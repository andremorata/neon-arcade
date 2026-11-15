'use strict';
// Cidade aberta gerada por quadras (chunks). Cada quadra nasce de um hash da
// posição, então nada precisa ser salvo: voltar a um lugar recria o mesmo lugar.
// Ruas ficam nas bordas da quadra; prédios e objetos, no miolo.
(() => {
  const G = window.G;
  const C = G.CHUNK, LIM = G.LIMITE;
  const RUA = 96, MEIA = RUA / 2, CALC = 20, BECO = 36;
  const MIOLO0 = MEIA + CALC, MIOLO = C - 2 * MIOLO0;
  const CHAVES = Object.keys(G.BAIRROS);
  const cache = new Map();
  const chave = (cx, cy) => cx + ',' + cy;

  const fora = (cx, cy) => Math.abs(cx) > LIM || Math.abs(cy) > LIM;
  const ehAbrigo = (cx, cy) => cx === 0 && cy === 0;

  // Voronoi com ruído: o bairro mais perto vence, mas a borda não é reta
  function bairroEm(cx, cy) {
    if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) return 'mercado';
    let melhor = CHAVES[0], md = Infinity;
    for (let i = 0; i < CHAVES.length; i++) {
      const b = G.BAIRROS[CHAVES[i]];
      const dx = cx - b.centro[0], dy = cy - b.centro[1];
      const d = Math.sqrt(dx * dx + dy * dy) / b.peso + (G.hash(cx, cy, 31 + i) / 4294967296) * 0.8;
      if (d < md) { md = d; melhor = CHAVES[i]; }
    }
    return melhor;
  }

  function caixa(tipo, x, y, w, d, h, extra) {
    return Object.assign({ tipo, x, y, w, d, h }, extra);
  }

  function predio(r, B, x, y, w, d) {
    const h = Math.round(G.lerp(B.alt[0], B.alt[1], r() * r()));
    const fh = h * G.K;
    const janelas = [];
    const cols = Math.floor((w - 8) / 20), rows = Math.floor((fh - 10) / 22);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (r() < 0.32 && janelas.length < 70) janelas.push([6 + i * 20, 8 + j * 22, G.pick(r, B.janela)]);
    }
    const b = caixa('predio', x, y, w, d, h, {
      frente: G.pick(r, B.frente), teto: G.pick(r, B.teto), janelas, topo: [],
    });
    const nTopo = 1 + ((r() * 3) | 0);
    for (let i = 0; i < nTopo; i++) {
      const tw = 14 + r() * 22, td = 10 + r() * 16;
      b.topo.push([r() * (w - tw), r() * (d - td), tw, td]);
    }
    if (r() < 0.65 && fh > 30) {
      const vertical = r() < 0.5;
      const pw = vertical ? 12 : Math.min(w - 16, 40 + r() * 50), ph = vertical ? Math.min(fh - 12, 34 + r() * 40) : 14;
      b.placa = { x: 8 + r() * (w - pw - 16), y: 6 + r() * Math.max(1, fh - ph - 12), w: pw, h: ph,
        cor: G.pick(r, B.neon), pisca: r() < 0.18, fase: r() * 10 };
    }
    return b;
  }

  // objetos sólidos baixos que dão a cara de cada bairro
  function prop(r, B, tipo, x, y, cx0, cy0, cw, cd) {
    switch (tipo) {
      case 'barraca': {
        const w = 44 + r() * 30, d = 30 + r() * 14;
        return caixa('barraca', G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d), w, d, 34,
          { cor: G.pick(r, B.neon), frente: '#241c30', teto: '#2c2238' });
      }
      case 'container': {
        const deitado = r() < 0.6, w = deitado ? 110 : 44, d = deitado ? 44 : 110;
        const cores = ['#7a3a1e', '#1e4a7a', '#7a6a1e', '#2a5a3a', '#5a2a4a'];
        return caixa('container', G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d), w, d, 46 + ((r() * 2) | 0) * 46,
          { cor: G.pick(r, cores) });
      }
      case 'sucata': {
        const w = 40 + r() * 50, d = 30 + r() * 40;
        return caixa('sucata', G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d), w, d, 20 + r() * 30,
          { cor: G.pick(r, ['#3a3a30', '#4a3a28', '#2f3a2c']), semente: (r() * 1e9) | 0 });
      }
      case 'cano': {
        const w = 30, d = 30;
        return caixa('cano', G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d), w, d, 60,
          { cor: G.pick(r, B.neon) });
      }
      default: { // pilar
        const w = 26, d = 26;
        return caixa('pilar', G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d), w, d, 90,
          { cor: G.pick(r, B.neon) });
      }
    }
  }

  // objeto novo só entra com folga pra alguém passar: fresta estreita prende e faz tremer
  const FOLGA = 40;
  function encaixar(ch, b) {
    for (const o of ch.caixas) {
      if (b.x < o.x + o.w + FOLGA && b.x + b.w + FOLGA > o.x && b.y < o.y + o.d + FOLGA && b.y + b.d + FOLGA > o.y) return;
    }
    ch.caixas.push(b);
  }

  function gerar(cx, cy) {
    const x = cx * C, y = cy * C;
    const ch = { cx, cy, x, y, chave: chave(cx, cy), caixas: [], luzes: [], pocas: [], marcas: [] };
    if (fora(cx, cy)) { ch.fora = true; return ch; }
    const r = G.rng(G.hash(cx, cy, G.SEMENTE));
    const bk = ch.bairro = bairroEm(cx, cy), B = G.BAIRROS[bk];

    // postes na esquina e às vezes no meio das calçadas
    const poste = (px, py) => ch.luzes.push({ x: px, y: py, raio: 150, cor: B.neon[1] || B.neon[0], poste: true });
    poste(x + MEIA + 8, y + MEIA + 8);
    if (r() < 0.6) poste(x + C / 2, y + MEIA + 8);
    if (r() < 0.6) poste(x + MEIA + 8, y + C / 2);

    for (let i = 0, n = 2 + ((r() * 4) | 0); i < n; i++) {
      // poças na rua: ou na faixa de cima ou na da esquerda
      const emCima = r() < 0.5;
      ch.pocas.push({
        x: emCima ? x + r() * C : x - MEIA + 10 + r() * (RUA - 20),
        y: emCima ? y - MEIA + 10 + r() * (RUA - 20) : y + r() * C,
        rx: 18 + r() * 34, ry: 6 + r() * 10, cor: G.pick(r, B.neon),
      });
    }
    for (let i = 0; i < 6; i++) ch.marcas.push([x + MIOLO0 + r() * MIOLO, y + MIOLO0 + r() * MIOLO, 10 + r() * 40, r()]);

    const mx = x + MIOLO0, my = y + MIOLO0;
    if (ehAbrigo(cx, cy)) {
      ch.seguro = true;
      ch.abrigo = { x: x + C / 2, y: y + C / 2 };
      // praça: quatro pilares baixos em volta do letreiro do abrigo
      for (const [ox, oy] of [[-150, -150], [124, -150], [-150, 124], [124, 124]]) {
        ch.caixas.push(caixa('pilar', x + C / 2 + ox, y + C / 2 + oy, 26, 26, 50, { cor: '#00f0ff' }));
      }
      ch.luzes.push({ x: x + C / 2, y: y + C / 2, raio: 260, cor: '#00f0ff' });
      return ch;
    }

    // miolo dividido em lotes separados por becos
    const nx = 1 + ((r() * 3) | 0), ny = 1 + ((r() * 3) | 0);
    const lw = (MIOLO - BECO * (nx - 1)) / nx, ld = (MIOLO - BECO * (ny - 1)) / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lx = mx + i * (lw + BECO), ly = my + j * (ld + BECO);
      if (r() < B.dens) {
        const m = 4 + r() * 14;
        ch.caixas.push(predio(r, B, lx + m, ly + m, lw - 2 * m, ld - 2 * m));
      } else {
        // lote aberto: arena natural pra luta, com objetos do bairro espalhados
        const n = 1 + ((r() * 4) | 0);
        for (let k = 0; k < n; k++) {
          encaixar(ch, prop(r, B, B.prop, lx + r() * lw, ly + r() * ld, lx, ly, lw, ld));
        }
        if (r() < 0.5) ch.luzes.push({ x: lx + lw / 2, y: ly + ld / 2, raio: 120, cor: G.pick(r, B.neon) });
      }
    }
    // barracas na calçada do Mercado
    if (B.prop === 'barraca' && r() < 0.7) {
      encaixar(ch, prop(r, B, 'barraca', x + MEIA + 6 + r() * (C - RUA - 80), y + MEIA + 2, x + MEIA, y + MEIA, C - RUA, 40));
    }
    return ch;
  }

  function chunk(cx, cy) {
    const k = chave(cx, cy);
    let ch = cache.get(k);
    if (!ch) { ch = gerar(cx, cy); cache.set(k, ch); }
    return ch;
  }

  // joga fora quadras longe do jogador pra não crescer memória no celular
  function podar(pcx, pcy, raio = 5) {
    for (const [k, ch] of cache) {
      if (Math.abs(ch.cx - pcx) > raio || Math.abs(ch.cy - pcy) > raio) cache.delete(k);
    }
  }

  const quadraDe = v => Math.floor(v / C);
  const bairroNoPonto = (x, y) => bairroEm(quadraDe(x), quadraDe(y));

  // borda da cidade: metade da rua externa ainda é andável
  const MIN = -LIM * C - MEIA + 20, MAX = (LIM + 1) * C + MEIA - 20;

  // empurra um círculo (e.x, e.y, e.r) pra fora das caixas sólidas
  function colidir(e) {
    const x0 = quadraDe(e.x - e.r), x1 = quadraDe(e.x + e.r);
    const y0 = quadraDe(e.y - e.r), y1 = quadraDe(e.y + e.r);
    let bateu = false;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const cs = chunk(cx, cy).caixas;
      for (let i = 0; i < cs.length; i++) {
        const b = cs[i];
        const px = G.clamp(e.x, b.x, b.x + b.w), py = G.clamp(e.y, b.y, b.y + b.d);
        const dx = e.x - px, dy = e.y - py, dd = dx * dx + dy * dy;
        if (dd >= e.r * e.r) continue;
        bateu = true;
        if (dd > 1e-6) {
          const d = Math.sqrt(dd), k = (e.r - d) / d;
          e.x += dx * k; e.y += dy * k;
        } else {
          // centro dentro da caixa: sai pelo lado mais perto
          const l = e.x - b.x, rr = b.x + b.w - e.x, t = e.y - b.y, bb = b.y + b.d - e.y;
          const m = Math.min(l, rr, t, bb);
          if (m === l) e.x = b.x - e.r; else if (m === rr) e.x = b.x + b.w + e.r;
          else if (m === t) e.y = b.y - e.r; else e.y = b.y + b.d + e.r;
        }
      }
    }
    e.x = G.clamp(e.x, MIN + e.r, MAX - e.r);
    e.y = G.clamp(e.y, MIN + e.r, MAX - e.r);
    return bateu;
  }

  function bloqueado(x, y) {
    if (x < MIN || x > MAX || y < MIN || y > MAX) return true;
    const cs = chunk(quadraDe(x), quadraDe(y)).caixas;
    for (let i = 0; i < cs.length; i++) {
      const b = cs[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.d) return true;
    }
    return false;
  }

  function livre(x, y, r) {
    const e = { x, y, r };
    return !colidir(e) && e.x === x && e.y === y;
  }

  // linha de visão: amostra o segmento; prédio no meio bloqueia tiro e mira
  function visao(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 24);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (bloqueado(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function pontoLivre(ch, r, sortear) {
    for (let i = 0; i < 40; i++) {
      const x = ch.x + sortear() * C, y = ch.y + sortear() * C;
      if (livre(x, y, r + 6)) return { x, y };
    }
    return null;
  }

  G.mundo = {
    RUA, MEIA, CALC, MIOLO0, MIOLO, MIN, MAX,
    gerar, chunk, podar, bairroEm, bairroNoPonto, quadraDe, colidir, bloqueado, livre, visao, pontoLivre, fora,
    limpar: () => cache.clear(),
  };
})();

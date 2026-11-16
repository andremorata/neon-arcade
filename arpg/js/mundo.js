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
  const ehZila = (cx, cy) => cx === G.ZILA_QUADRA[0] && cy === G.ZILA_QUADRA[1];

  // Voronoi com ruído: o bairro mais perto vence, mas a borda não é reta
  function bairroEm(cx, cy) {
    if (Math.abs(cx) <= 2 && Math.abs(cy) <= 2) return 'mercado';
    let melhor = CHAVES[0], md = Infinity;
    for (let i = 0; i < CHAVES.length; i++) {
      const b = G.BAIRROS[CHAVES[i]];
      const dx = cx - b.centro[0], dy = cy - b.centro[1];
      const d = Math.sqrt(dx * dx + dy * dy) / b.peso + (G.hash(cx, cy, 31 + i) / 4294967296) * 0.8;
      if (d < md) { md = d; melhor = CHAVES[i]; }
    }
    return melhor;
  }

  const caixa = (tipo, x, y, w, d, h, extra) => Object.assign({ tipo, x, y, w, d, h }, extra);

  function predio(r, B, x, y, w, d) {
    const h = Math.round(G.lerp(B.alt[0], B.alt[1], r() * r()));
    const fh = h * G.K;
    const pal = B.pal;
    const b = caixa('predio', x, y, w, d, h, {
      frente: G.mistura(pal.fachada, r() < 0.5 ? '#000000' : '#ffffff', r() * 0.06),
      teto: pal.teto, janelas: [], topo: [], manchas: [],
      lojas: w > 150 ? 2 : 1, luzLoja: [], toldo: r() < 0.5 ? G.mistura(pal.fachada, pal.acento, 0.35) : null,
    });
    // andares acima do térreo; o térreo (56 de altura de tela) é loja
    const cols = Math.floor((w - 20) / 31), rows = Math.floor((fh - 66) / 36);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      b.janelas.push([12 + i * 31, 10 + j * 36, r() < 0.28 ? (r() < 0.8 ? pal.luz : pal.apoio) : null, r() < 0.25]);
    }
    for (let i = 0; i < b.lojas; i++) b.luzLoja.push(r() < 0.75 ? (r() < 0.7 ? pal.luz : pal.apoio) : null);
    for (let i = 0; i < 8; i++) b.manchas.push([r() * w, r() * Math.max(1, fh - 60), 2 + r() * 3, 15 + r() * 50]);
    for (let i = 0, n = 1 + ((r() * 3) | 0); i < n; i++) {
      const tw = 18 + r() * 22, td = 14 + r() * 16;
      b.topo.push([r() * (w - tw), r() * (d - td), tw, td]);
    }
    if (r() < 0.45 && fh > 40) {
      const vertical = r() < 0.3;
      b.placa = { txt: G.pick(r, B.placas), vertical, x: 0.15 + r() * 0.7, aceso: r() < 0.3,
        cor: G.pick(r, [pal.acento, pal.apoio, '#EDF4F0']) };
    }
    return b;
  }

  // objetos sólidos baixos que dão a cara de cada bairro
  function prop(r, B, tipo, x, y, cx0, cy0, cw, cd) {
    const pal = B.pal;
    const enquadra = (w, d) => [G.clamp(x, cx0, cx0 + cw - w), G.clamp(y, cy0, cy0 + cd - d)];
    switch (tipo) {
      case 'barraca': {
        const w = 60 + r() * 40, d = 34 + r() * 14, [px, py] = enquadra(w, d);
        return caixa('barraca', px, py, w, d, 40, { lona: G.pick(r, ['#4a3e48', '#3d4a50', '#52473a', '#3e4a3c']),
          fruta: G.pick(r, ['#c4824e', '#9db36a', '#d9b25a', '#b25a4e']), lampiao: r() < 0.6 });
      }
      case 'container': {
        const deitado = r() < 0.6, w = deitado ? 120 : 48, d = deitado ? 48 : 120, [px, py] = enquadra(w, d);
        return caixa('container', px, py, w, d, 50 + ((r() * 2) | 0) * 50,
          { cor: G.pick(r, ['#6a3a28', '#2e4a62', '#6a5f30', '#34503c', '#4e3446']) });
      }
      case 'sucata': {
        const w = 44 + r() * 50, d = 34 + r() * 40, [px, py] = enquadra(w, d);
        return caixa('sucata', px, py, w, d, 22 + r() * 30, { cor: G.pick(r, ['#3a3a30', '#4a3a28', '#2f3a2c']), semente: (r() * 1e9) | 0 });
      }
      case 'cano': {
        const [px, py] = enquadra(34, 34);
        return caixa('cano', px, py, 34, 34, 64, { cor: pal.apoio });
      }
      default: {
        const [px, py] = enquadra(30, 30);
        return caixa('pilar', px, py, 30, 30, 96, { cor: pal.acento });
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
    const ch = { cx, cy, x, y, chave: chave(cx, cy), caixas: [], postes: [], pocas: [], marcas: [] };
    if (fora(cx, cy)) { ch.fora = true; return ch; }
    const r = G.rng(G.hash(cx, cy, G.SEMENTE));
    const bk = ch.bairro = bairroEm(cx, cy), B = G.BAIRROS[bk];

    // postes na calçada: a luz principal de cada rua
    ch.postes.push({ x: x + MEIA + 10, y: y + MEIA + 14 });
    if (r() < 0.7) ch.postes.push({ x: x + C / 2 + 20, y: y + MEIA + 14 });
    if (r() < 0.5) ch.postes.push({ x: x + MEIA + 10, y: y + C / 2 });

    for (let i = 0, n = 2 + ((r() * 4) | 0); i < n; i++) {
      const emCima = r() < 0.5;
      ch.pocas.push({
        x: emCima ? x + r() * C : x - MEIA + 12 + r() * (RUA - 24),
        y: emCima ? y - MEIA + 12 + r() * (RUA - 24) : y + r() * C,
        rx: 22 + r() * 40, ry: 6 + r() * 10,
      });
    }
    for (let i = 0; i < 10; i++) ch.marcas.push([x + r() * C, y + r() * C, 2 + r() * 40, r()]);

    const mx = x + MIOLO0, my = y + MIOLO0;
    if (ehAbrigo(cx, cy)) {
      ch.seguro = true;
      ch.abrigo = { x: x + C / 2, y: y + C / 2 };
      for (const [ox, oy] of [[-160, -160], [130, -160], [-160, 130], [130, 130]]) {
        ch.caixas.push(caixa('barraca', x + C / 2 + ox, y + C / 2 + oy, 64, 40, 40,
          { lona: G.pick(r, ['#4a3e48', '#3d4a50', '#52473a']), fruta: G.pick(r, ['#c4824e', '#9db36a', '#d9b25a']), lampiao: true }));
      }
      return ch;
    }
    if (ehZila(cx, cy)) {
      // fundos da feira: pátio aberto com o ateliê de costura no meio
      ch.zila = { x: x + C / 2, y: y + C / 2 + 40 };
      ch.caixas.push(caixa('barraca', x + C / 2 - 50, y + C / 2 - 30, 100, 44, 46,
        { lona: '#5a4652', fruta: '#d9b25a', lampiao: true, zila: true }));
      for (const ox of [-220, 160]) ch.caixas.push(predio(r, B, x + C / 2 + ox, my, 90, 160));
      return ch;
    }

    const nx = 1 + ((r() * 3) | 0), ny = 1 + ((r() * 3) | 0);
    const lw = (MIOLO - BECO * (nx - 1)) / nx, ld = (MIOLO - BECO * (ny - 1)) / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lx = mx + i * (lw + BECO), ly = my + j * (ld + BECO);
      if (r() < B.dens) {
        const m = 4 + r() * 14;
        ch.caixas.push(predio(r, B, lx + m, ly + m, lw - 2 * m, ld - 2 * m));
      } else {
        // lote aberto: arena natural pra luta, com objetos do bairro espalhados
        for (let k = 0, n = 1 + ((r() * 4) | 0); k < n; k++) encaixar(ch, prop(r, B, B.prop, lx + r() * lw, ly + r() * ld, lx, ly, lw, ld));
      }
    }
    if (B.prop === 'barraca' && r() < 0.7) {
      encaixar(ch, prop(r, B, 'barraca', x + MEIA + 6 + r() * (C - RUA - 100), y + MEIA + 2, x + MEIA, y + MEIA, C - RUA, 44));
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
          const l = e.x - b.x, rr = b.x + b.w - e.x, t = e.y - b.y, bb = b.y + b.d - e.y;
          const m = Math.min(l, rr, t, bb);
          if (m === l) e.x = b.x - e.r; else if (m === rr) e.x = b.x + b.w + e.r;
          else if (m === t) e.y = b.y - e.r; else e.y = b.y + b.d + e.r;
        }
      }
    }
    const ox = e.x, oy = e.y;
    e.x = G.clamp(e.x, MIN + e.r, MAX - e.r);
    e.y = G.clamp(e.y, MIN + e.r, MAX - e.r);
    return bateu || ox !== e.x || oy !== e.y;
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

  // lugares que os biscates apontam
  const lugar = nome => nome === 'zila'
    ? { x: (G.ZILA_QUADRA[0] + 0.5) * C, y: (G.ZILA_QUADRA[1] + 0.5) * C + 40 }
    : { x: C / 2, y: C / 2 };

  G.mundo = {
    RUA, MEIA, CALC, MIOLO0, MIOLO, MIN, MAX,
    gerar, chunk, podar, bairroEm, bairroNoPonto, quadraDe, colidir, bloqueado, livre, visao, pontoLivre, fora, lugar,
    limpar: () => cache.clear(),
  };
})();

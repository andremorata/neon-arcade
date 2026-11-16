'use strict';
// Desenho na linguagem Aurora noir: chão por quadra, caixas e personagens ordenados
// por profundidade, depois uma passada aditiva só com as luzes que existem (postes,
// lojas, poucos letreiros) e, por cima, névoa, chuva fina e vinheta.
// Brilho vem de sprites pré-desenhados, não de shadowBlur: no celular faz diferença.
(() => {
  const G = window.G, COR = G.COR;
  const C = G.CHUNK, K = G.K, M = G.M;
  const J = G.jogo;
  let cv, ctx, W = 0, H = 0, z = 1, dpr = 1;
  let camX = 0, camY = 0, vinheta = null;
  const VISTA = 500;              // altura visível do mundo, em unidades (12,5 m)
  const ALT_MAX = 270 * K;

  // ── sprites de luz ──────────────────────────────────
  const brilhos = new Map();
  function brilho(cor) {
    let c = brilhos.get(cor);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, G.rgba(cor, 1)); grad.addColorStop(0.4, G.rgba(cor, 0.32)); grad.addColorStop(1, G.rgba(cor, 0));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    brilhos.set(cor, c);
    return c;
  }
  function luz(x, y, rx, cor, a = 1, ry = rx) { ctx.globalAlpha = a; ctx.drawImage(brilho(cor), x - rx, y - ry, rx * 2, ry * 2); }

  const gotas = [];
  function ajustarChuva(n) {
    while (gotas.length < n) gotas.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6, perto: Math.random() < 0.18 });
    gotas.length = n;
  }

  function redimensionar() {
    const toque = matchMedia('(pointer: coarse)').matches;
    dpr = Math.min(window.devicePixelRatio || 1, toque ? 1.5 : 2);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    cv.width = W; cv.height = H;
    z = H > W ? W / VISTA : Math.min(W / (VISTA * 1.6), H / VISTA);
    vinheta = document.createElement('canvas'); vinheta.width = vinheta.height = 256;
    const v = vinheta.getContext('2d'), g = v.createRadialGradient(128, 128, 70, 128, 128, 182);
    g.addColorStop(0, 'rgba(8,13,28,0)'); g.addColorStop(1, 'rgba(8,13,28,0.72)');
    v.fillStyle = g; v.fillRect(0, 0, 256, 256);
    ajustarChuva(Math.round((W * H) / (toque ? 7000 : 4500) / dpr));
  }

  // ── chão ────────────────────────────────────────────
  function chao(ch) {
    const { x, y } = ch, Mu = G.mundo;
    if (ch.fora) {
      ctx.fillStyle = '#060a14'; ctx.fillRect(x, y, C, C);
      ctx.fillStyle = 'rgba(143,184,240,0.05)';
      for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 97 + J.t * 14) % C), y + i * 100 + 30, 70, 2);
      return;
    }
    const pal = G.BAIRROS[ch.bairro].pal;
    ctx.fillStyle = pal.asfalto; ctx.fillRect(x, y, C, C);
    ctx.fillStyle = pal.calcada; ctx.fillRect(x + Mu.MEIA, y + Mu.MEIA, C - Mu.RUA, C - Mu.RUA);
    ctx.fillStyle = G.mistura(pal.asfalto, pal.calcada, 0.45); ctx.fillRect(x + Mu.MIOLO0, y + Mu.MIOLO0, Mu.MIOLO, Mu.MIOLO);
    // juntas da calçada e meio-fio
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = Mu.MEIA; i < C - Mu.MEIA; i += 52) { ctx.fillRect(x + i, y + Mu.MEIA, 2, Mu.CALC); ctx.fillRect(x + i, y + C - Mu.MIOLO0, 2, Mu.CALC); ctx.fillRect(x + Mu.MEIA, y + i, Mu.CALC, 2); ctx.fillRect(x + C - Mu.MIOLO0, y + i, Mu.CALC, 2); }
    ctx.strokeStyle = G.mistura(pal.calcada, '#ffffff', 0.08); ctx.lineWidth = 3;
    ctx.strokeRect(x + Mu.MEIA, y + Mu.MEIA, C - Mu.RUA, C - Mu.RUA);
    // faixa no meio da rua (as ruas ficam nas bordas da quadra)
    ctx.fillStyle = G.rgba(COR.ambar, 0.12);
    for (let i = Mu.MEIA + 16; i < C - Mu.MEIA - 16; i += 60) { ctx.fillRect(x + i, y - 2, 30, 4); ctx.fillRect(x - 2, y + i, 4, 30); }
    for (const [mx, my, r, k] of ch.marcas) { ctx.fillStyle = k < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.02)'; ctx.fillRect(mx, my, r, r * 0.5); }
    if (ch.abrigo) {
      const a = ch.abrigo;
      ctx.strokeStyle = G.rgba(COR.menta, 0.22); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 190, 190 * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = G.rgba(COR.menta, 0.05); ctx.fill();
      placaPintada('ABRIGO', a.x, a.y + 4, COR.menta, 22, true, true);
    }
    if (ch.zila) placaPintada('ATELIÊ DA ZILÁ', ch.zila.x, ch.zila.y + 34, COR.lavanda, 15, true, true);
  }
  function pocas(ch) {
    for (const p of ch.pocas) {
      ctx.fillStyle = 'rgba(6,10,20,0.45)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // letreiro pintado à mão; poucos acendem
  function placaPintada(txt, x, y, cor, tam, aceso, chao) {
    ctx.font = `700 ${tam}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + tam, h = tam * 1.6;
    if (!chao) { ctx.fillStyle = '#0c111c'; ctx.fillRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4); ctx.fillStyle = aceso ? '#18202e' : '#222a3a'; ctx.fillRect(x - w / 2, y - h / 2, w, h); }
    ctx.fillStyle = aceso ? cor : G.rgba(cor, 0.5); ctx.fillText(txt, x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ── caixas ──────────────────────────────────────────
  function desenharCaixa(b, pal) {
    const fh = b.h * K, topo = b.y - fh, frente = b.y + b.d - fh;
    switch (b.tipo) {
      case 'predio': {
        ctx.fillStyle = b.frente; ctx.fillRect(b.x, frente, b.w, fh);
        for (const [mx, my, mw, mh] of b.manchas) { ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(b.x + mx, frente + my, mw, mh); }
        const terreo = Math.min(56, fh * 0.55);
        for (let yy = frente + 46; yy < b.y + b.d - terreo - 10; yy += 36) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(b.x, yy, b.w, 3); }
        for (const [jx, jy, aceso, ar] of b.janelas) {
          if (jy + 30 > fh - terreo) continue;
          ctx.fillStyle = '#0c111c'; ctx.fillRect(b.x + jx - 2, frente + jy - 2, 22, 28);
          ctx.fillStyle = aceso ? G.rgba(aceso, 0.24) : G.mistura(pal.fachada, '#000000', 0.45); ctx.fillRect(b.x + jx, frente + jy, 18, 24);
          if (ar) { ctx.fillStyle = G.mistura(pal.fachada, '#ffffff', 0.08); ctx.fillRect(b.x + jx + 1, frente + jy + 26, 16, 8); }
        }
        // térreo: lojas de porta de enrolar com luz vazando
        const ty = b.y + b.d - terreo;
        ctx.fillStyle = '#0b0f19'; ctx.fillRect(b.x, ty, b.w, terreo);
        const lw = b.w / b.lojas;
        b.luzLoja.forEach((l, i) => {
          const lx = b.x + i * lw + 10, ww = lw - 20;
          if (l) { ctx.fillStyle = G.rgba(l, 0.2); ctx.fillRect(lx, ty + 8, ww, terreo - 8); }
          ctx.fillStyle = G.mistura(pal.fachada, '#000000', 0.15); ctx.fillRect(lx, ty + 8, ww, l ? terreo * 0.35 : terreo - 8);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < (l ? terreo * 0.35 : terreo - 8); k += 6) ctx.fillRect(lx, ty + 8 + k, ww, 2);
        });
        if (b.toldo) { ctx.fillStyle = b.toldo; ctx.fillRect(b.x + 6, ty - 8, b.w - 12, 10); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x + 6, ty + 2, b.w - 12, 3); }
        if (b.placa) {
          const pl = b.placa;
          if (pl.vertical) {
            const px = b.x + pl.x * b.w, letras = [...pl.txt].slice(0, Math.floor((fh - terreo - 10) / 16));
            const h = letras.length * 16 + 8;
            ctx.fillStyle = '#0c111c'; ctx.fillRect(px - 12, frente + 6, 24, h + 4);
            ctx.fillStyle = pl.aceso ? '#18202e' : '#222a3a'; ctx.fillRect(px - 10, frente + 8, 20, h);
            ctx.font = '700 12px Orbitron, sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = pl.aceso ? pl.cor : G.rgba(pl.cor, 0.5);
            letras.forEach((l, i) => ctx.fillText(l, px, frente + 22 + i * 16));
          } else placaPintada(pl.txt, b.x + pl.x * b.w, ty - 20, pl.cor, 12, pl.aceso);
        }
        ctx.fillStyle = b.teto; ctx.fillRect(b.x, topo, b.w, b.d);
        for (const t of b.topo) { ctx.fillStyle = G.mistura(b.teto, '#ffffff', 0.05); ctx.fillRect(b.x + t[0], topo + t[1], t[2], t[3]); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(b.x + t[0], topo + t[1] + t[3], t[2], 6); }
        ctx.fillStyle = G.mistura(b.teto, '#ffffff', 0.1); ctx.fillRect(b.x, topo + b.d - 4, b.w, 4);
        break;
      }
      case 'barraca': {
        ctx.fillStyle = '#1b1712'; ctx.fillRect(b.x, frente, b.w, fh);
        for (let i = 0; i < 3; i++) {
          const cx = b.x + 6 + i * (b.w - 12) / 3;
          ctx.fillStyle = '#3a3226'; ctx.fillRect(cx, frente + fh - 18, (b.w - 18) / 3, 16);
          ctx.fillStyle = b.fruta; for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(cx + 5 + q * 6, frente + fh - 16, 3.5, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.fillStyle = b.lona; ctx.fillRect(b.x - 4, topo, b.w + 8, b.d + 6);
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; for (let i = 0; i < b.w; i += 20) ctx.fillRect(b.x - 4 + i, topo, 10, b.d + 6);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(b.x - 4, topo + b.d + 2, b.w + 8, 4);
        if (b.lampiao) { ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(b.x + b.w - 8, frente + 6, 3, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'container': {
        ctx.fillStyle = G.mistura(b.cor, '#000000', 0.35); ctx.fillRect(b.x, frente, b.w, fh);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 5; i < b.w; i += 8) ctx.fillRect(b.x + i, frente, 2, fh);
        ctx.fillStyle = b.cor; ctx.fillRect(b.x, topo, b.w, b.d);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, topo + 1, b.w - 2, b.d - 2);
        break;
      }
      case 'sucata': {
        const r = G.rng(b.semente);
        ctx.fillStyle = G.mistura(b.cor, '#000000', 0.3); ctx.fillRect(b.x, frente, b.w, fh);
        ctx.fillStyle = b.cor; ctx.fillRect(b.x, topo, b.w, b.d);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#55503f' : '#3b3326'; ctx.fillRect(b.x + r() * b.w * 0.7, topo + r() * (b.d + fh) * 0.7, 10 + r() * 20, 6 + r() * 12); }
        break;
      }
      default: {
        ctx.fillStyle = '#161c28'; ctx.fillRect(b.x, frente, b.w, fh);
        ctx.fillStyle = '#202838'; ctx.fillRect(b.x, topo, b.w, b.d);
        ctx.fillStyle = G.rgba(b.cor, 0.5); ctx.fillRect(b.x, frente + fh * 0.3, b.w, 3);
      }
    }
  }

  // ── avisos de ataque: coral no chão ─────────────────
  function aviso(e) {
    const a = e.aviso;
    if (!a) return;
    const k = 1 - e.prep / e.prepMax, p = J.p;
    ctx.strokeStyle = G.rgba(COR.coral, 0.9); ctx.lineWidth = 3; ctx.fillStyle = G.rgba(COR.coral, 0.28);
    if (a.forma === 'circulo' || a.forma === 'arco') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1, 0.55);
      ctx.beginPath();
      if (a.forma === 'circulo') ctx.arc(0, 0, a.raio, 0, Math.PI * 2); else { ctx.moveTo(0, 0); ctx.arc(0, 0, a.raio, a.ang - a.abre / 2, a.ang + a.abre / 2); ctx.closePath(); }
      ctx.stroke();
      ctx.beginPath();
      if (a.forma === 'circulo') ctx.arc(0, 0, a.raio * k, 0, Math.PI * 2); else { ctx.moveTo(0, 0); ctx.arc(0, 0, a.raio * k, a.ang - a.abre / 2, a.ang + a.abre / 2); ctx.closePath(); }
      ctx.fill(); ctx.restore();
    } else if (a.forma === 'linha') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(a.ang);
      if (a.trilho) { ctx.strokeStyle = G.rgba(COR.lavanda, 0.5 + 0.5 * k); ctx.fillStyle = G.rgba(COR.lavanda, 0.18); }
      if (a.ima) { ctx.setLineDash([10, 8]); }
      ctx.strokeRect(0, -a.larg, a.comp, a.larg * 2); ctx.fillRect(0, -a.larg, a.comp * k, a.larg * 2);
      ctx.restore();
    } else if (a.forma === 'mira') {
      ctx.save(); ctx.strokeStyle = G.rgba(COR.coral, 0.35 + 0.5 * k); ctx.lineWidth = 2; ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y - 40); ctx.lineTo(e.x + Math.cos(a.ang) * a.comp, e.y - 40 + Math.sin(a.ang) * a.comp); ctx.stroke();
      ctx.restore();
    } else if (a.forma === 'canal') {
      ctx.save(); ctx.strokeStyle = G.rgba(COR.lavanda, 0.4 + 0.5 * k); ctx.lineWidth = 2 + 3 * k;
      ctx.beginPath(); ctx.moveTo(e.x, e.y - 60);
      for (let i = 1; i <= 6; i++) { const t = i / 6; ctx.lineTo(G.lerp(e.x, p.x, t) + (i < 6 ? G.rand(-8, 8) : 0), G.lerp(e.y - 60, p.y - 40, t) + (i < 6 ? G.rand(-8, 8) : 0)); }
      ctx.stroke(); ctx.restore();
    } else if (a.forma === 'sinal') {
      ctx.strokeStyle = G.rgba(COR.ambar, 0.8); ctx.beginPath(); ctx.ellipse(e.x, e.y, 30 + 40 * k, (30 + 40 * k) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Pátio das Calhas alagado: lâmina d'água e faixas de choque
  function arenaAlagada() {
    const a = J.alagada, F = J.faixas;
    if (!a) return;
    ctx.fillStyle = 'rgba(120,150,200,0.13)'; ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = 'rgba(190,210,235,0.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const yy = a.y + ((i * 47 + J.t * 18) % a.h); ctx.beginPath(); ctx.moveTo(a.x + (i * 83) % a.w, yy); ctx.lineTo(a.x + (i * 83) % a.w + 60, yy); ctx.stroke(); }
    if (!F) return;
    const h = a.h / 5;
    for (const b of F.bandas) {
      const y = a.y + b * h;
      if (F.estado === 'aviso') {
        ctx.strokeStyle = G.rgba(COR.coral, 0.9); ctx.lineWidth = 3; ctx.strokeRect(a.x, y, a.w, h);
        ctx.fillStyle = G.rgba(COR.coral, 0.25 * (1 - F.t / 1.2)); ctx.fillRect(a.x, y, a.w, h);
      } else if (F.estado === 'choque') {
        ctx.fillStyle = 'rgba(220,230,255,0.28)'; ctx.fillRect(a.x, y, a.w, h);
        ctx.strokeStyle = 'rgba(240,245,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = a.x; x < a.x + a.w; x += 30) { ctx.moveTo(x, y + G.rand(0, h)); ctx.lineTo(x + 30, y + G.rand(0, h)); }
        ctx.stroke();
      }
    }
  }

  // gente com quem dá pra falar
  function desenharNpc(n) {
    const tipo = G.figuras.TIPOS[n.id] ? n.id : 'atirador';
    G.figuras.desenhar(ctx, z, tipo, n.x, n.y, { pose: 'parado', olha: J.p.x < n.x ? -1 : 1, mira: 0.9 });
    ctx.font = '700 11px "Space Mono", monospace'; ctx.textAlign = 'center';
    const nome = G.NPCS[n.id].nome, w = ctx.measureText(nome).width;
    ctx.fillStyle = 'rgba(17,29,44,0.8)'; ctx.fillRect(n.x - w / 2 - 6, n.y - 104, w + 12, 17);
    ctx.fillStyle = COR.lavanda; ctx.fillText(nome, n.x, n.y - 91);
  }

  function desenharLoot(l) {
    const y = l.y - l.z;
    if (l.tipo === 'peca') {
      ctx.fillStyle = '#04060c'; ctx.beginPath(); ctx.arc(l.x, y - 6, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa0ae'; ctx.beginPath(); ctx.arc(l.x, y - 6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04060c'; ctx.beginPath(); ctx.arc(l.x, y - 6, 1.5, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (l.tipo === 'lasca') {
      ctx.fillStyle = '#04060c'; ctx.beginPath(); ctx.moveTo(l.x, y - 12); ctx.lineTo(l.x + 7, y - 4); ctx.lineTo(l.x, y + 1); ctx.lineTo(l.x - 7, y - 4); ctx.fill();
      ctx.fillStyle = COR.ambar; ctx.beginPath(); ctx.moveTo(l.x, y - 10); ctx.lineTo(l.x + 4.5, y - 4); ctx.lineTo(l.x, y - 1); ctx.lineTo(l.x - 4.5, y - 4); ctx.fill();
      return;
    }
    const R = G.raridade(l.item.rar);
    ctx.fillStyle = '#04060c'; ctx.fillRect(l.x - 13, y - 12, 26, 12);
    ctx.fillStyle = l.item.slot === 'arma' ? '#3b4252' : '#3a3530'; ctx.fillRect(l.x - 11, y - 10, 22, 8);
    ctx.fillStyle = R.cor; ctx.fillRect(l.x - 11, y - 3, 22, 2);
    if (l.z === 0 && G.d2(l.x, l.y, J.p.x, J.p.y) < 320 * 320) {
      ctx.font = '700 11px "Space Mono", monospace'; ctx.textAlign = 'center';
      const w = ctx.measureText(l.item.nome).width;
      ctx.fillStyle = 'rgba(17,29,44,0.85)'; ctx.fillRect(l.x - w / 2 - 6, y - 38, w + 12, 18);
      ctx.strokeStyle = G.rgba(R.cor, 0.6); ctx.lineWidth = 1; ctx.strokeRect(l.x - w / 2 - 6, y - 38, w + 12, 18);
      ctx.fillStyle = R.cor; ctx.fillText(l.item.nome, l.x, y - 25);
    }
  }

  function quedas() {
    for (const f of J.fx) if (f.tipo === 'queda') {
      const a = 1 - f.t / f.dur;
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#2c3140';
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 4, f.maior ? 40 : 28, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ── quadro ──────────────────────────────────────────
  const fila = [];
  function quadro(dt) {
    const p = J.p;
    if (!p) return;
    const fx = p.x + G.input.mx * 40, fy = p.y - 40 + G.input.my * 30;
    const k = 1 - Math.exp(-8 * dt);
    if (!camX && !camY) { camX = fx; camY = fy; }
    camX += (fx - camX) * k; camY += (fy - camY) * k;
    const tr = J.tremor, sx = tr ? G.rand(-tr, tr) : 0, sy = tr ? G.rand(-tr, tr) : 0;
    const bk = J.bairro || 'mercado', B = G.BAIRROS[bk], pal = B.pal, claro = bk === 'torres';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#060a14'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, W / 2 - (camX + sx) * z, H / 2 - (camY + sy) * z);

    const vw = W / z / 2, vh = H / z / 2;
    const x0 = camX - vw, x1 = camX + vw, y0 = camY - vh, y1 = camY + vh + ALT_MAX;
    const Mu = G.mundo;
    const quadras = [];
    for (let cy = Mu.quadraDe(y0); cy <= Mu.quadraDe(y1); cy++) for (let cx = Mu.quadraDe(x0); cx <= Mu.quadraDe(x1); cx++) quadras.push(Mu.chunk(cx, cy));
    for (const ch of quadras) chao(ch);
    for (const ch of quadras) pocas(ch);
    arenaAlagada();
    quedas();
    for (const e of J.inimigos) if (e.prep > 0) aviso(e);
    for (const r of J.rastros) { ctx.fillStyle = G.rgba(COR.lavanda, 0.35 * Math.min(1, r.t)); ctx.beginPath(); ctx.ellipse(r.x, r.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    if (J.marca && !J.marca.e.morto) { const e = J.marca.e; ctx.strokeStyle = G.rgba(COR.coral, 0.8); ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r + 16, (e.r + 16) * 0.45, J.t, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // Varredura: cone quente no chão
    ctx.globalCompositeOperation = 'lighter';
    for (const f of J.fx) if (f.tipo === 'cone') {
      const a = 1 - f.t / f.dur;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.alc);
      g.addColorStop(0, G.rgba('#F2C38B', 0.45 * a)); g.addColorStop(1, G.rgba('#F2C38B', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, f.alc, f.ang - f.meio, f.ang + f.meio); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    // profundidade: caixa pela borda de baixo, gente pelos pés
    fila.length = 0;
    for (const ch of quadras) for (const b of ch.caixas) {
      if (b.x > x1 || b.x + b.w < x0 || b.y + b.d < y0 || b.y - b.h * K > y1) continue;
      fila.push({ k: b.y + b.d, c: b, pal: G.BAIRROS[ch.bairro].pal });
    }
    for (const ch of quadras) for (const l of ch.postes) fila.push({ k: l.y, poste: l });
    for (const ch of quadras) for (const n of ch.npcs || []) fila.push({ k: n.y, npc: n });
    for (const l of J.loot) fila.push({ k: l.y - 1, l });
    for (const e of J.inimigos) if (e.x > x0 - 80 && e.x < x1 + 80 && e.y > y0 - 40 && e.y < y1 + 120) fila.push({ k: e.y, e });
    fila.push({ k: p.y, p });
    fila.sort((a, b) => a.k - b.k);
    let escondido = false, depois = false;
    for (const f of fila) {
      if (f.c) {
        desenharCaixa(f.c, f.pal);
        const b = f.c;
        if (depois && p.x + 12 > b.x && p.x - 12 < b.x + b.w && p.y > b.y - b.h * K && p.y - 76 < b.y + b.d) escondido = true;
      } else if (f.npc) desenharNpc(f.npc);
      else if (f.poste) {
        const l = f.poste;
        ctx.fillStyle = '#0a0e18'; ctx.fillRect(l.x - 3, l.y - 150, 6, 150); ctx.fillRect(l.x - 3, l.y - 152, 34, 5);
        ctx.fillStyle = '#fff1d6'; ctx.fillRect(l.x + 20, l.y - 150, 14, 5);
      } else if (f.e) {
        const e = f.e;
        const tipo = G.figuras.TIPOS[e.tipo] ? e.tipo : 'atirador';
        G.figuras.desenhar(ctx, z, tipo, e.x, e.y, e.fig || {});
        // no Surto do Ruído as barras de Vida somem
        if ((e.hp < e.hpMax || e === J.alvo) && !(J.surto > 0) && !e.chefe) {
          const w = e.elite ? 54 : e.r < 10 ? 20 : 36, yb = e.y - G.figuras.TIPOS[tipo].altura - 16 - (e.voa ? 50 : 0);
          ctx.fillStyle = 'rgba(8,13,28,0.8)'; ctx.fillRect(e.x - w / 2 - 1, yb - 1, w + 2, 6);
          ctx.fillStyle = e.elite ? COR.ambar : e.id === 'eco' ? COR.lavanda : COR.coral; ctx.fillRect(e.x - w / 2, yb, w * Math.max(0, e.hp / e.hpMax), 4);
          if (e.escudoEnergia > 0) { ctx.fillStyle = '#8FB8F0'; ctx.fillRect(e.x - w / 2, yb - 4, w * e.escudoEnergia / 40, 2); }
          if (e.atordoado > 0) { ctx.fillStyle = COR.ambar; ctx.font = '700 11px "Space Mono"'; ctx.textAlign = 'center'; ctx.fillText('✶ ✶', e.x, yb - 6); }
        }
        if (e === J.alvo) { ctx.strokeStyle = G.rgba(COR.texto, 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r + 10, (e.r + 10) * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
      } else if (f.l) desenharLoot(f.l);
      else if (!p.morto) {
        if (p.escudo > 0) { ctx.strokeStyle = G.rgba(COR.ambar, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y - 36, 34, 48, 0, 0, Math.PI * 2); ctx.stroke(); }
        G.figuras.desenhar(ctx, z, 'faro', p.x, p.y, p.fig || {});
        depois = true;
      }
    }

    // granadas no ar e pousadas
    for (const f of J.fx) if (f.tipo === 'granada' && !f.explodiu) {
      ctx.fillStyle = 'rgba(3,6,14,0.5)'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b4252'; ctx.beginPath(); ctx.arc(f.x, f.y - 8 - f.z, 5, 0, Math.PI * 2); ctx.fill();
      if (f.t > f.voo) {
        const pisca = Math.floor(f.t * 12) % 2;
        ctx.fillStyle = pisca ? COR.coral : COR.ambar; ctx.fillRect(f.x - 1.5, f.y - 14, 3, 3);
        ctx.strokeStyle = G.rgba(COR.ambar, 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.raio, f.raio * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ── passada aditiva: só as luzes que existem ──
    ctx.globalCompositeOperation = 'lighter';
    for (const ch of quadras) {
      if (ch.fora) continue;
      const pl = G.BAIRROS[ch.bairro].pal;
      const forca = ch.bairro === 'torres' ? 0.35 : 1;
      for (const l of ch.postes) {
        luz(l.x + 27, l.y - 150, 26, pl.luz, 0.8 * forca);
        luz(l.x + 27, l.y + 30, 220, pl.luz, 0.2 * forca, 120);
      }
      for (const pc of ch.pocas) for (const l of ch.postes) {
        if (Math.abs(l.x + 27 - pc.x) < pc.rx + 60 && Math.abs(l.y - pc.y) < 200) { ctx.globalAlpha = 0.25 * forca; ctx.fillStyle = pl.luz; for (let i = 0; i < 4; i++) ctx.fillRect(l.x + 17 - i * 3, pc.y - pc.ry + i * pc.ry * 0.5, 20 + i * 6, 2); }
      }
      for (const b of ch.caixas) {
        if (b.tipo === 'predio') {
          const lw = b.w / b.lojas;
          b.luzLoja.forEach((cor, i) => { if (cor) luz(b.x + (i + 0.5) * lw, b.y + b.d + 16, lw * 0.55, cor, 0.16 * forca, 28); });
          if (b.placa && b.placa.aceso) luz(b.x + b.placa.x * b.w, b.y + b.d - b.h * K * 0.6, 50, b.placa.cor, 0.14);
        } else if (b.tipo === 'barraca' && b.lampiao) luz(b.x + b.w - 8, b.y + b.d - b.h * K + 6, 70, '#F2C38B', 0.32);
      }
      if (ch.abrigo) luz(ch.abrigo.x, ch.abrigo.y, 200, COR.menta, 0.08, 150);
      if (ch.zila) luz(ch.zila.x, ch.zila.y - 20, 120, COR.lavanda, 0.14, 80);
    }
    for (const pr of J.projs) {
      const a = Math.atan2(pr.vy, pr.vx), vy = pr.y - 44;
      ctx.globalAlpha = 1; ctx.strokeStyle = pr.cor || '#FFF0D8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pr.x - Math.cos(a) * 18, vy - Math.sin(a) * 18); ctx.lineTo(pr.x, vy); ctx.stroke();
      luz(pr.x, vy, 16, pr.cor || '#F2C38B', 0.5);
    }
    for (const f of J.fx) {
      const kk = f.t / f.dur;
      if (f.tipo === 'cabo') { ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#d9d2c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y - 50); ctx.lineTo(f.x1, f.y1 - 40); ctx.stroke(); }
      else if (f.tipo === 'clarao') luz(f.x, f.y - 30, f.raio * (0.6 + kk * 0.5), '#F2C38B', 0.7 * (1 - kk));
      else if (f.tipo === 'anel') {
        ctx.globalAlpha = 1 - kk; ctx.strokeStyle = f.cor; ctx.lineWidth = 3;
        const r = f.raio * (0.3 + kk * 0.8);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (f.tipo === 'cone') {
        ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#FFF0D8'; ctx.lineWidth = 2;
        for (let i = -3; i <= 3; i++) {
          const a = f.ang + i * f.meio / 3, d0 = 30 + kk * f.alc * 0.6, d1 = d0 + 50;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * d0, f.y - 44 + Math.sin(a) * d0 * 0.6); ctx.lineTo(f.x + Math.cos(a) * d1, f.y - 44 + Math.sin(a) * d1 * 0.6); ctx.stroke();
        }
      }
    }
    for (const l of J.loot) {
      if (l.tipo === 'lasca') { luz(l.x, l.y - l.z - 5, 12, COR.ambar, 0.35); continue; }
      const R = G.raridade(l.item.rar), i = G.RARIDADES.indexOf(R);
      luz(l.x, l.y - l.z - 6, 26, R.cor, 0.4);
      if (i >= 2) { ctx.globalAlpha = 0.28 + Math.sin(J.t * 3) * 0.06; ctx.fillStyle = R.cor; ctx.fillRect(l.x - 2, l.y - 220, 4, 210); }
    }
    for (const q of J.parts) {
      const a = Math.max(0, q.vida / q.max);
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = q.cor; ctx.fillRect(q.x - q.tam / 2, q.y - q.z - q.tam / 2, q.tam, q.tam);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // Olho-de-Gato: contorno de quem está atrás da parede
    if (p.visaoParedes) for (const e of J.inimigos) if (G.d2(e.x, e.y, p.x, p.y) < p.visaoParedes ** 2 && G.figuras.TIPOS[e.tipo]) {
      ctx.globalAlpha = 0.3; ctx.strokeStyle = COR.coral; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(e.x - 12, e.y - G.figuras.TIPOS[e.tipo].altura, 24, G.figuras.TIPOS[e.tipo].altura, 8); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!p.morto && escondido) {
      ctx.strokeStyle = G.rgba(COR.menta, 0.55); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(p.x - 13, p.y - 78, 26, 78, 10); ctx.stroke();
    }
    ctx.textAlign = 'center';
    for (const t of J.textos) {
      const kk = t.t / t.vida;
      ctx.globalAlpha = 1 - kk * kk;
      ctx.font = `800 ${t.grande ? 22 : 16}px Orbitron, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#080d1c'; ctx.strokeText(t.txt, t.x, t.y - kk * 40);
      ctx.fillStyle = t.cor; ctx.fillText(t.txt, t.x, t.y - kk * 40);
    }
    ctx.globalAlpha = 1;

    // ── tela: névoa do bairro, chuva fina, vinheta ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ng = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    ng.addColorStop(0, G.rgba(pal.nevoa, claro ? 0.25 : 0.16)); ng.addColorStop(1, G.rgba(pal.nevoa, 0));
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H * 0.55);
    const nChuva = Math.round(gotas.length * pal.chuva);
    if (nChuva) {
      const vel = 1300 * dpr * dt, vento = -0.18;
      for (const perto of [false, true]) {
        ctx.strokeStyle = perto ? 'rgba(214,224,240,0.2)' : 'rgba(184,196,224,0.11)'; ctx.lineWidth = (perto ? 2 : 1.2) * dpr;
        ctx.beginPath();
        for (let i = 0; i < nChuva; i++) {
          const g = gotas[i];
          if (g.perto !== perto) continue;
          g.y += vel * g.v * (perto ? 1.3 : 1); g.x += vel * g.v * vento;
          if (g.y > H) { g.y -= H + 20; g.x = Math.random() * W * 1.2; }
          if (g.x < 0) g.x += W;
          const l = (perto ? 30 : 18) * dpr * g.v;
          ctx.moveTo(g.x, g.y); ctx.lineTo(g.x - vento * l, g.y - l);
        }
        ctx.stroke();
      }
    }
    if (!claro) ctx.drawImage(vinheta, 0, 0, W, H);
    if (J.lentidao > 0) { ctx.fillStyle = 'rgba(175,163,245,0.08)'; ctx.fillRect(0, 0, W, H); }
    // Ruído na tela: linhas de varredura e um fantasma deslocado, crescendo com o estágio
    const est = p.estagioRuim ? p.estagioRuim.id : 'limpo';
    if (est !== 'limpo') {
      const forca = { chiado: 0.03, estatica: 0.06, afinado: 0.09 }[est] + (J.surto > 0 ? 0.06 : 0);
      ctx.fillStyle = `rgba(8,13,28,${forca})`;
      for (let yy = (J.t * 40) % 4; yy < H; yy += 4 * dpr) ctx.fillRect(0, yy, W, dpr);
      if (Math.random() < forca * 3) { ctx.globalAlpha = forca * 2.5; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(cv, Math.round(G.rand(-3, 3) * dpr), 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    }
    if (p.flash > 0) { ctx.fillStyle = G.rgba(COR.coral, Math.min(0.22, p.flash)); ctx.fillRect(0, 0, W, H); }
    if (!p.morto && p.hp / p.hpMax < 0.3) { ctx.fillStyle = G.rgba(COR.coral, 0.06 + Math.sin(J.t * 6) * 0.04); ctx.fillRect(0, 0, W, H); }
  }

  G.render = {
    iniciar(canvas) { cv = canvas; ctx = cv.getContext('2d', { alpha: false }); redimensionar(); addEventListener('resize', redimensionar); },
    quadro,
    telaParaMundo(sx, sy) { return { x: (sx * dpr - W / 2) / z + camX, y: (sy * dpr - H / 2) / z + camY }; },
    centrar() { camX = camY = 0; },
  };
})();

'use strict';
// Desenho: chão por quadra, caixas e personagens ordenados por profundidade,
// depois uma passada aditiva de luzes neon e, por cima, chuva e névoa.
// Brilho vem de sprites pré-desenhados, não de shadowBlur: no celular faz diferença.
(() => {
  const G = window.G;
  const C = G.CHUNK, K = G.K;
  const J = G.jogo;
  let cv, ctx, W = 0, H = 0, z = 1, dpr = 1;
  let camX = 0, camY = 0, vinheta = null;
  const VISTA = 470;              // altura visível do mundo, em unidades
  const ALT_MAX = 270 * K;        // o prédio mais alto, pra não cortar o topo na borda

  // ── sprites de brilho ───────────────────────────────
  const brilhos = new Map();
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function brilho(cor) {
    let c = brilhos.get(cor);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), [r, gg, b] = rgb(cor);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.3, `rgba(${r},${gg},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    brilhos.set(cor, c);
    return c;
  }
  function luz(x, y, raio, cor, a = 1) {
    ctx.globalAlpha = a;
    ctx.drawImage(brilho(cor), x - raio, y - raio, raio * 2, raio * 2);
  }

  // ── chuva (espaço de tela) ──────────────────────────
  const gotas = [];
  function ajustarChuva(n) {
    while (gotas.length < n) gotas.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6 });
    gotas.length = n;
  }

  function redimensionar() {
    const toque = matchMedia('(pointer: coarse)').matches;
    dpr = Math.min(window.devicePixelRatio || 1, toque ? 1.5 : 2);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    cv.width = W; cv.height = H;
    z = Math.min(W, H * 1.6) / (VISTA * 1.6);
    if (H > W) z = W / VISTA;   // retrato: enquadra pela largura
    vinheta = document.createElement('canvas'); vinheta.width = 256; vinheta.height = 256;
    const v = vinheta.getContext('2d'), g = v.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    v.fillStyle = g; v.fillRect(0, 0, 256, 256);
    ajustarChuva(Math.round((W * H) / (toque ? 9000 : 6000) / dpr));
  }

  // ── chão ────────────────────────────────────────────
  function chao(ch) {
    const { x, y } = ch, M = G.mundo;
    if (ch.fora) {
      // além da cidade: água preta com reflexo
      ctx.fillStyle = '#04030a'; ctx.fillRect(x, y, C, C);
      ctx.fillStyle = 'rgba(80,90,180,0.08)';
      for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 97 + J.t * 20) % C), y + i * 100 + 30, 60, 2);
      return;
    }
    const B = G.BAIRROS[ch.bairro];
    ctx.fillStyle = B.rua; ctx.fillRect(x, y, C, C);
    ctx.fillStyle = B.calcada; ctx.fillRect(x + M.MEIA, y + M.MEIA, C - M.RUA, C - M.RUA);
    ctx.fillStyle = B.chao; ctx.fillRect(x + M.MIOLO0, y + M.MIOLO0, M.MIOLO, M.MIOLO);
    ctx.strokeStyle = B.borda; ctx.lineWidth = 2;
    ctx.strokeRect(x + M.MEIA, y + M.MEIA, C - M.RUA, C - M.RUA);
    // faixa no meio da rua (as ruas ficam nas bordas da quadra)
    ctx.fillStyle = 'rgba(255,220,140,0.16)';
    for (let i = M.MEIA + 10; i < C - M.MEIA - 10; i += 44) { ctx.fillRect(x + i, y - 1.5, 22, 3); ctx.fillRect(x - 1.5, y + i, 3, 22); }
    // manchas do bairro: ferrugem, ladrilho, grade...
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (const [mx, my, r] of ch.marcas) ctx.fillRect(mx, my, r, r * 0.6);
    if (ch.abrigo) {
      const a = ch.abrigo;
      ctx.strokeStyle = 'rgba(0,240,255,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 170, 170, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,240,255,0.18)'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 120, 120, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function pocas(ch) {
    for (const p of ch.pocas) {
      ctx.fillStyle = 'rgba(120,130,200,0.10)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── caixas (prédios e objetos) ──────────────────────
  function desenharCaixa(b) {
    const fh = b.h * K, topo = b.y - fh, frente = b.y + b.d - fh;
    switch (b.tipo) {
      case 'predio': {
        ctx.fillStyle = b.frente; ctx.fillRect(b.x, frente, b.w, fh);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x, frente + fh * 0.55, b.w, fh * 0.45);
        for (const j of b.janelas) { ctx.fillStyle = j[2]; ctx.globalAlpha = 0.55; ctx.fillRect(b.x + j[0], frente + j[1], 9, 11); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.teto; ctx.fillRect(b.x, topo, b.w, b.d);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (const t of b.topo) ctx.fillRect(b.x + t[0], topo + t[1], t[2], t[3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 1, topo + 1, b.w - 2, b.d - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(b.x, frente, b.w, 2);   // quina iluminada
        if (b.placa) {
          const pl = b.placa;
          const liga = !pl.pisca || Math.sin(J.t * 9 + pl.fase) + Math.sin(J.t * 23 + pl.fase) > -0.6;
          ctx.fillStyle = liga ? pl.cor : '#222';
          ctx.fillRect(b.x + pl.x, frente + pl.y, pl.w, pl.h);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(b.x + pl.x + 3, frente + pl.y + 3, pl.w - 6, pl.h - 6);
          pl.liga = liga;
        }
        break;
      }
      case 'barraca': {
        ctx.fillStyle = b.frente; ctx.fillRect(b.x, frente, b.w, fh);
        // toldo listrado
        ctx.fillStyle = '#2a2236'; ctx.fillRect(b.x - 3, topo, b.w + 6, b.d + 6);
        ctx.fillStyle = b.cor; ctx.globalAlpha = 0.55;
        for (let i = 0; i < b.w; i += 12) ctx.fillRect(b.x + i, topo, Math.min(6, b.w - i), b.d + 6);
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.cor; ctx.fillRect(b.x - 3, topo + b.d + 4, b.w + 6, 2);
        break;
      }
      case 'container': {
        ctx.fillStyle = b.cor; ctx.globalAlpha = 0.6; ctx.fillRect(b.x, frente, b.w, fh); ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 6; i < b.w; i += 8) ctx.fillRect(b.x + i, frente, 2, fh);
        ctx.fillStyle = b.cor; ctx.fillRect(b.x, topo, b.w, b.d);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, topo + 1, b.w - 2, b.d - 2);
        break;
      }
      case 'sucata': {
        const r = G.rng(b.semente);
        ctx.fillStyle = b.cor; ctx.fillRect(b.x, frente, b.w, fh);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#55503f' : '#3b3326';
          ctx.fillRect(b.x + r() * b.w * 0.7, topo + r() * (b.d + fh) * 0.7, 10 + r() * 20, 6 + r() * 12);
        }
        break;
      }
      case 'cano':
      case 'pilar': {
        ctx.fillStyle = '#1a1a26'; ctx.fillRect(b.x, frente, b.w, fh);
        ctx.fillStyle = '#242436'; ctx.fillRect(b.x, topo, b.w, b.d);
        ctx.fillStyle = b.cor; ctx.fillRect(b.x, frente + fh * 0.25, b.w, 4); ctx.fillRect(b.x, frente + fh * 0.7, b.w, 3);
        break;
      }
    }
  }

  // ── personagens ─────────────────────────────────────
  function sombra(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }

  function corpo(x, y, dir, jaqueta, detalhe, passo, flash, tam = 1) {
    const bal = Math.sin(passo * 14) * 3 * tam;
    // pernas
    ctx.fillStyle = '#0c0b14';
    ctx.fillRect(x - 7 * tam, y - 12 * tam + bal * 0.3, 5 * tam, 12 * tam);
    ctx.fillRect(x + 2 * tam, y - 12 * tam - bal * 0.3, 5 * tam, 12 * tam);
    // tronco
    ctx.fillStyle = jaqueta;
    ctx.beginPath(); ctx.roundRect(x - 10 * tam, y - 34 * tam, 20 * tam, 24 * tam, 5 * tam); ctx.fill();
    ctx.fillStyle = detalhe; ctx.fillRect(x - 10 * tam, y - 22 * tam, 20 * tam, 2 * tam);
    // arma apontando
    const ax = Math.cos(dir), ay = Math.sin(dir) * 0.8;
    ctx.strokeStyle = '#9aa0b8'; ctx.lineWidth = 4 * tam; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + ax * 6 * tam, y - 24 * tam + ay * 4); ctx.lineTo(x + ax * 22 * tam, y - 24 * tam + ay * 16 * tam); ctx.stroke();
    // cabeça com visor
    ctx.fillStyle = '#1c1a26';
    ctx.beginPath(); ctx.arc(x, y - 41 * tam, 8 * tam, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = detalhe;
    ctx.fillRect(x - 6 * tam + ax * 2, y - 44 * tam, 12 * tam, 3 * tam);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash * 8); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(x - 11 * tam, y - 50 * tam, 22 * tam, 50 * tam, 8 * tam); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function desenharJogador(p) {
    if (p.morto) return;
    if (p.inv > 0 && p.dash <= 0 && Math.floor(J.t * 20) % 2) ctx.globalAlpha = 0.5;
    sombra(p.x, p.y, 16);
    corpo(p.x, p.y, p.dir, '#1d2a44', '#00f0ff', p.andando, p.flash);
    ctx.globalAlpha = 1;
  }

  function desenharInimigo(e) {
    const flash = e.flash;
    if (e.elite) {
      ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r + 8, (e.r + 8) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.prep > 0) {
      // aviso de golpe: anel vermelho fechando
      ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.lineWidth = 3;
      const k = e.T.modo === 'perto' ? e.prep / 0.32 : e.prep / 0.4;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r + 4 + 20 * k, (e.r + 4 + 20 * k) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.T.voa) {
      const alt = 40 + Math.sin(e.fase * 4) * 5;
      sombra(e.x, e.y, e.r * 0.8);
      const y = e.y - alt;
      ctx.fillStyle = flash > 0 ? '#fff' : '#2a2a3a';
      ctx.beginPath(); ctx.moveTo(e.x, y - e.r); ctx.lineTo(e.x + e.r, y); ctx.lineTo(e.x, y + e.r); ctx.lineTo(e.x - e.r, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = e.cor; ctx.lineWidth = 2;
      const h = (J.t * 40) % 6;
      ctx.beginPath(); ctx.moveTo(e.x - e.r - 8, y - 3 - h * 0.2); ctx.lineTo(e.x - e.r + 4, y - 3); ctx.moveTo(e.x + e.r - 4, y - 3); ctx.lineTo(e.x + e.r + 8, y - 3 - h * 0.2); ctx.stroke();
      ctx.fillStyle = e.cor; ctx.fillRect(e.x - 3, y - 3, 6, 6);
    } else {
      sombra(e.x, e.y, e.r);
      const tam = e.r / 15;
      const jaq = e.tipo === 'punk' ? '#3a1530' : '#2c2416';
      corpo(e.x, e.y, e.olha || 0, jaq, e.cor, e.estado !== 'parado' ? e.fase : 0, flash, tam);
      if (e.tipo === 'punk') { ctx.fillStyle = e.cor; ctx.fillRect(e.x - 2 * tam, e.y - 53 * tam, 4 * tam, 8 * tam); }
    }
    if (e.hp < e.hpMax || e === J.alvo) {
      const w = 34 * (e.elite ? 1.4 : 1), y = e.y - (e.T.voa ? 66 : 60) * (e.r / 15);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = e.elite ? '#ffb300' : '#ff3d5a'; ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.hpMax), 4);
    }
  }

  function desenharLoot(l) {
    const y = l.y - l.z;
    if (l.tipo === 'credito') {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(l.x, y - 4, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const R = G.RARIDADES[l.item.rar];
      ctx.fillStyle = R.cor;
      ctx.fillRect(l.x - 7, y - 10, 14, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(l.x - 5, y - 8, 10, 2);
      if (l.z === 0) {
        ctx.font = '600 12px "Space Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; const w = ctx.measureText(l.item.nome).width;
        ctx.fillRect(l.x - w / 2 - 4, y - 34, w + 8, 16);
        ctx.fillStyle = R.cor; ctx.fillText(l.item.nome, l.x, y - 22);
      }
    }
  }

  // ── quadro ──────────────────────────────────────────
  const fila = [];
  function quadro(dt) {
    const p = J.p;
    if (!p) return;
    // câmera segue com folga e adianta um pouco pra onde o jogador anda
    const fx = p.x + G.input.mx * 40, fy = p.y - 20 + G.input.my * 30;
    const k = 1 - Math.exp(-8 * dt);
    if (!camX && !camY) { camX = fx; camY = fy; }
    camX += (fx - camX) * k; camY += (fy - camY) * k;
    const tr = J.tremor, sx = tr ? G.rand(-tr, tr) : 0, sy = tr ? G.rand(-tr, tr) : 0;

    const bk = J.bairro || 'mercado', B = G.BAIRROS[bk];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, W / 2 - (camX + sx) * z, H / 2 - (camY + sy) * z);

    const vw = W / z / 2, vh = H / z / 2;
    const x0 = camX - vw, x1 = camX + vw, y0 = camY - vh, y1 = camY + vh + ALT_MAX;
    const M = G.mundo;
    const qx0 = M.quadraDe(x0), qx1 = M.quadraDe(x1), qy0 = M.quadraDe(y0), qy1 = M.quadraDe(y1);
    const quadras = [];
    for (let cy = qy0; cy <= qy1; cy++) for (let cx = qx0; cx <= qx1; cx++) quadras.push(M.chunk(cx, cy));
    for (const ch of quadras) chao(ch);
    for (const ch of quadras) pocas(ch);

    // ordena por profundidade: caixa pela borda de baixo, gente pelos pés
    fila.length = 0;
    for (const ch of quadras) for (const b of ch.caixas) {
      if (b.x > x1 || b.x + b.w < x0 || b.y + b.d < y0 || b.y - b.h * K > y1) continue;
      fila.push({ k: b.y + b.d, c: b });
    }
    for (const l of J.loot) fila.push({ k: l.y - 1, l });
    for (const e of J.inimigos) if (e.x > x0 - 60 && e.x < x1 + 60 && e.y > y0 - 40 && e.y < y1) fila.push({ k: e.y + (e.T.voa ? 30 : 0), e });
    fila.push({ k: p.y, p });
    fila.sort((a, b) => a.k - b.k);
    let escondido = false, depois = false;
    for (const f of fila) {
      if (f.c) {
        desenharCaixa(f.c);
        // caixa desenhada depois do jogador e por cima dele: ele está atrás dela
        const b = f.c;
        if (depois && p.x + 10 > b.x && p.x - 10 < b.x + b.w && p.y > b.y - b.h * K && p.y - 50 < b.y + b.d) escondido = true;
      } else if (f.e) desenharInimigo(f.e); else if (f.l) desenharLoot(f.l); else { desenharJogador(f.p); depois = true; }
    }

    // granadas no ar
    for (const f of J.fx) if (f.tipo === 'granada' && !f.explodiu) {
      sombra(f.x, f.y, 5);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(f.x, f.y - 10 - f.z, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,63,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x1, f.y1, f.raio, f.raio * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // ── passada aditiva: tudo que brilha ──
    ctx.globalCompositeOperation = 'lighter';
    for (const ch of quadras) {
      for (const l of ch.luzes) {
        if (l.poste) {
          ctx.globalAlpha = 1; ctx.fillStyle = l.cor; ctx.fillRect(l.x - 2, l.y - 70 * K - 2, 4, 4);
          luz(l.x, l.y - 70 * K, 18, l.cor, 0.9);
          luz(l.x, l.y, l.raio, l.cor, 0.18);
        } else luz(l.x, l.y, l.raio, l.cor, 0.22);
      }
      for (const pc of ch.pocas) luz(pc.x, pc.y, pc.rx * 1.3, pc.cor, 0.12);
      for (const b of ch.caixas) {
        if (b.placa && b.placa.liga) {
          const pl = b.placa, fr = b.y + b.d - b.h * K;
          luz(b.x + pl.x + pl.w / 2, fr + pl.y + pl.h / 2, Math.max(pl.w, pl.h) * 1.4, pl.cor, 0.55);
          luz(b.x + pl.x + pl.w / 2, b.y + b.d + 30, Math.max(pl.w, pl.h) * 1.6, pl.cor, 0.12);   // reflexo no chão molhado
        } else if (b.tipo === 'barraca' || b.tipo === 'pilar' || b.tipo === 'cano') {
          luz(b.x + b.w / 2, b.y + b.d, 60, b.cor, 0.18);
        }
      }
    }
    if (!p.morto) luz(p.x, p.y - 10, 120, '#00f0ff', 0.14);
    for (const e of J.inimigos) if (e.T.voa) luz(e.x, e.y - 40, 26, e.cor, 0.5);
    for (const pr of J.projs) {
      ctx.globalAlpha = 1; ctx.fillStyle = pr.cor;
      const vy = pr.y - 22, a = Math.atan2(pr.vy, pr.vx);
      ctx.save(); ctx.translate(pr.x, vy); ctx.rotate(a); ctx.fillRect(-10, -2, 20, 4); ctx.restore();
      luz(pr.x, vy, 22, pr.cor, 0.8);
    }
    for (const f of J.fx) {
      const k = f.t / f.dur;
      if (f.tipo === 'clarao') luz(f.x, f.y - 10, f.raio * (0.6 + k * 0.6), f.cor, 1 - k);
      else if (f.tipo === 'anel') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.cor; ctx.lineWidth = 4;
        const r = f.raio * (0.3 + k * 0.9);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const l of J.loot) {
      if (l.tipo === 'credito') luz(l.x, l.y - l.z - 4, 14, '#ffd23f', 0.6);
      else {
        const R = G.RARIDADES[l.item.rar];
        luz(l.x, l.y - l.z - 6, 30, R.cor, 0.7);
        if (l.item.rar >= 2) {
          // facho de luz no item bom, visível de longe
          ctx.globalAlpha = 0.35 + Math.sin(J.t * 4) * 0.1; ctx.fillStyle = R.cor;
          ctx.fillRect(l.x - 2, l.y - 160, 4, 150);
          luz(l.x, l.y - 80, 50, R.cor, 0.25);
        }
      }
    }
    for (const q of J.parts) {
      const a = Math.max(0, q.vida / q.max);
      ctx.globalAlpha = a; ctx.fillStyle = q.cor;
      if (q.rastro) luz(q.x, q.y, q.tam * 2, q.cor, a * 0.6);
      else ctx.fillRect(q.x - q.tam / 2, q.y - 14 - q.tam / 2, q.tam, q.tam);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // contorno do jogador por cima de tudo: atrás de prédio ele não some
    if (!p.morto && escondido) {
      ctx.strokeStyle = 'rgba(0,240,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(p.x - 10, p.y - 49, 20, 49, 8); ctx.stroke();
    }

    // números de dano
    ctx.textAlign = 'center';
    for (const t of J.textos) {
      const k = t.t / t.vida;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${t.grande ? 22 : 15}px Orbitron, sans-serif`;
      ctx.fillStyle = '#000'; ctx.fillText(t.txt, t.x + 1.5, t.y - k * 40 + 1.5);
      ctx.fillStyle = t.cor; ctx.fillText(t.txt, t.x, t.y - k * 40);
    }
    ctx.globalAlpha = 1;

    // ── tela: névoa do bairro, chuva, vinheta ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = B.nevoa; ctx.fillRect(0, 0, W, H);
    const nChuva = Math.round(gotas.length * B.chuva);
    if (nChuva) {
      ctx.strokeStyle = 'rgba(170,190,255,0.28)'; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      const vel = 1300 * dpr * dt, vento = -0.18;
      for (let i = 0; i < nChuva; i++) {
        const g = gotas[i];
        g.y += vel * g.v; g.x += vel * g.v * vento;
        if (g.y > H) { g.y -= H + 20; g.x = Math.random() * W * 1.2; }
        if (g.x < 0) g.x += W;
        const l = 18 * dpr * g.v;
        ctx.moveTo(g.x, g.y); ctx.lineTo(g.x - vento * l, g.y - l);
      }
      ctx.stroke();
    }
    ctx.drawImage(vinheta, 0, 0, W, H);
    if (p.flash > 0) { ctx.fillStyle = `rgba(255,40,70,${Math.min(0.3, p.flash)})`; ctx.fillRect(0, 0, W, H); }
    if (!p.morto && p.hp / p.hpMax < 0.3) {
      ctx.fillStyle = `rgba(255,0,40,${0.08 + Math.sin(J.t * 6) * 0.05})`; ctx.fillRect(0, 0, W, H);
    }
  }

  G.render = {
    iniciar(canvas) {
      cv = canvas; ctx = cv.getContext('2d', { alpha: false });
      redimensionar();
      addEventListener('resize', redimensionar);
    },
    quadro,
    telaParaMundo(sx, sy) { return { x: (sx * dpr - W / 2) / z + camX, y: (sy * dpr - H / 2) / z + camY }; },
    centrar() { camX = camY = 0; },
  };
})();

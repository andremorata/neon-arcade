'use strict';
// Personagens: esqueleto (juntas em unidades locais, pés na origem, olhando pra direita)
// vestido peça por peça. Cada pose vira um sprite com três passadas: sombreado na
// direção da luz, luz de recorte quente e contorno escuro. O sprite fica em cache,
// então o custo por quadro é um drawImage.
(() => {
  const G = window.G, COR = G.COR;
  const ALTURA = 190;                 // altura do esqueleto em unidades locais
  const LUZ = [0.42, -0.9];           // luz de cima e da direita (postes e céu)
  const RECORTE = '#F2C38B';
  const cache = new Map();
  let escalaCache = 0;
  const MAX_CACHE = 280;

  // ── formas ─────────────────────────────────────────
  function capsula(x1, y1, r1, x2, y2, r2) {
    const p = new Path2D(), a = Math.atan2(y2 - y1, x2 - x1), n = a + Math.PI / 2;
    p.moveTo(x1 + Math.cos(n) * r1, y1 + Math.sin(n) * r1);
    p.lineTo(x2 + Math.cos(n) * r2, y2 + Math.sin(n) * r2);
    p.arc(x2, y2, r2, n, n + Math.PI, true);
    p.lineTo(x1 - Math.cos(n) * r1, y1 - Math.sin(n) * r1);
    p.arc(x1, y1, r1, n + Math.PI, n, true);
    p.closePath(); return p;
  }
  // contorno suave: passa pelo meio de cada lado (pano não tem quina)
  function forma(pts, curva = true) {
    const p = new Path2D();
    if (!curva) { pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; }
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = pts.length;
    const s = m(pts[n - 1], pts[0]); p.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const q = m(pts[i], pts[(i + 1) % n]); p.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    p.closePath(); return p;
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const soma = (a, dx, dy) => [a[0] + dx, a[1] + dy];
  function membro(g, a, b, c, r1, r2, r3, cor) {
    g.fillStyle = cor; g.fill(capsula(a[0], a[1], r1, b[0], b[1], r2)); g.fill(capsula(b[0], b[1], r2, c[0], c[1], r3));
  }
  function bota(g, t, cor, sola, k = 1) {
    g.fillStyle = cor;
    g.fill(forma([[t[0] - 9 * k, t[1] - 15 * k], [t[0] + 7 * k, t[1] - 15 * k], [t[0] + 20 * k, t[1] - 4 * k], [t[0] + 22 * k, t[1] + 2], [t[0] - 10 * k, t[1] + 2]]));
    g.fillStyle = sola; g.fillRect(t[0] - 11 * k, t[1], 34 * k, 4);
  }
  function mao(g, p, cor, r = 6) { g.fillStyle = cor; g.beginPath(); g.ellipse(p[0], p[1], r, r * 0.92, 0, 0, Math.PI * 2); g.fill(); }
  function cabeca(g, h, o) {
    const [x, y] = h;
    g.fillStyle = o.pele;
    g.fill(capsula(x - 3, y + 10, 6, x - 4, y + 20, 7));
    g.fill(forma([[x - 11, y - 12], [x + 8, y - 14], [x + 13, y - 4], [x + 15, y + 2], [x + 11, y + 4], [x + 9, y + 12], [x, y + 15], [x - 10, y + 9]]));
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill(forma([[x - 4, y + 4], [x + 9, y + 6], [x + 7, y + 13], [x, y + 15], [x - 6, y + 10]]));
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 5, y - 3, 5, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 3, y - 6, 8, 1.8);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x - 4, y - 1, 3, 4.5, 0, 0, Math.PI * 2); g.fill();
    if (o.cabelo) g.fillStyle = o.cabelo, g.fill(forma([[x - 13, y - 4], [x - 12, y - 14], [x - 2, y - 19], [x + 10, y - 16], [x + 13, y - 9], [x + 4, y - 11], [x - 6, y - 8], [x - 8, y + 2]]));
  }
  // braço de dois ossos: dado ombro e mão, acha o cotovelo (dobra pra baixo)
  function ik(o, m, L1 = 27, L2 = 25, lado = 1) {
    const dx = m[0] - o[0], dy = m[1] - o[1], d = Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy));
    const base = Math.atan2(dy, dx), a = Math.acos(G.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    return [o[0] + Math.cos(base + a * lado) * L1, o[1] + Math.sin(base + a * lado) * L1];
  }

  // ── esqueleto por pose ─────────────────────────────
  function esqueleto(pose, fase, mira) {
    let a1F = 0.12, a1B = -0.12, kF = 0.06, kB = 0.06, inclina = 0, bob = 0, agacha = 0;
    const phi = fase * Math.PI * 2;
    if (pose === 'anda' || pose === 'corre') {
      const amp = pose === 'corre' ? 0.7 : 0.48;
      a1F = amp * Math.sin(phi); a1B = -amp * Math.sin(phi);
      kF = 0.15 + 0.75 * Math.max(0, Math.cos(phi)); kB = 0.15 + 0.75 * Math.max(0, -Math.cos(phi));
      bob = -Math.abs(Math.sin(phi)) * 4; inclina = pose === 'corre' ? 10 : 3;
    } else if (pose === 'atira') { a1F = 0.3; a1B = -0.32; kF = 0.12; kB = 0.08; agacha = 3; }
    else if (pose === 'golpe') { a1F = 0.55; a1B = -0.5; kF = 0.3; kB = 0.1; inclina = 6 + fase * 14; agacha = 6; }
    else if (pose === 'recua') { a1F = 0.05; a1B = -0.35; kF = 0.2; kB = 0.05; inclina = -12; }
    else if (pose === 'investe') { a1F = 0.65; a1B = -0.7; kF = 0.5; kB = 0.05; inclina = 22; agacha = 8; }
    else if (pose === 'rola') { a1F = 0.9; a1B = 0.6; kF = 1.9; kB = 1.9; inclina = 18; agacha = 46; }
    const L1 = 47, L2 = 45, qy = -96 + bob + agacha;
    const qF = [6, qy], qB = [-6, qy - 1];
    const perna = (q, a1, k) => { const j = [q[0] + Math.sin(a1) * L1, q[1] + Math.cos(a1) * L1]; const a2 = a1 - k; return [j, [j[0] + Math.sin(a2) * L2, j[1] + Math.cos(a2) * L2]]; };
    const [jF, tF0] = perna(qF, a1F, kF), [jB, tB0] = perna(qB, a1B, kB);
    // pé no chão: o quadril sobe ou desce pra que o pé mais baixo encoste em y = 0
    const chao = pose === 'rola' ? 0 : -Math.max(tF0[1], tB0[1]);
    const desl = (p) => [p[0], p[1] + chao];
    const s = { qF: desl(qF), qB: desl(qB), jF: desl(jF), jB: desl(jB), tF: desl(tF0), tB: desl(tB0) };
    const oy = -146 + bob + agacha + chao;
    s.ombroF = [8 + inclina, oy]; s.ombroB = [-7 + inclina, oy - 2];
    s.cab = [7 + inclina * 1.25, oy - 24];
    s.peito = [14 + inclina, oy + 22];
    s.inclina = inclina; s.fase = fase; s.mira = mira; s.phi = phi;
    return s;
  }

  // ── roupas ─────────────────────────────────────────
  // sobretudo/capa: dos ombros até a barra, que acompanha as coxas
  function casaco(g, s, cor, comprimento, largura = 1) {
    const hF = soma(lerp2(s.qF, s.jF, comprimento), 10 * largura, 4), hB = soma(lerp2(s.qB, s.jB, comprimento), -14 * largura, 4);
    const meio = soma(lerp2(hF, hB, 0.5), 0, 6);
    g.fillStyle = cor;
    g.fill(forma([
      soma(s.ombroB, -8 * largura, -6), soma(s.ombroF, 6, -10), soma(s.ombroF, 14 * largura, 2),
      soma(s.qF, 14 * largura, -12), hF, meio, hB, soma(s.qB, -16 * largura, -10), soma(s.ombroB, -14 * largura, 10),
    ]));
    return { hF, hB };
  }
  function dobras(g, s, n, alfa = 0.28) {
    g.strokeStyle = `rgba(0,0,0,${alfa})`; g.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      const a = lerp2(s.ombroB, s.ombroF, (i + 0.5) / n), b = lerp2(s.jB, s.jF, (i + 0.5) / n);
      g.beginPath(); g.moveTo(a[0], a[1] + 30); g.quadraticCurveTo((a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 + 20, b[0], b[1] - 8); g.stroke();
    }
  }

  // ── tipos ──────────────────────────────────────────
  const TIPOS = {
    // Faro, Mercenário: sobretudo aberto, cachecol âmbar, ombreira, escopeta de cano serrado
    faro: { altura: 76, desenhar(g, s, pose) {
      const pele = '#a87b60', calca = '#1f232d', luva = '#1b1715', cas = '#2d3444', casEsc = '#232938';
      if (pose === 'rola') { rolando(g, s, cas, pele, COR.ambar); return; }
      const pivo = soma(s.peito, 0, 2), m = s.mira, dir = [Math.cos(m), Math.sin(m)];
      const maoB = soma(pivo, dir[0] * 28, dir[1] * 28), maoF = soma(pivo, dir[0] * 2 - 2, dir[1] * 2 + 4);
      g.fillStyle = casEsc; g.fill(forma([soma(s.ombroB, -6, 10), soma(s.qB, -6, 0), soma(lerp2(s.qB, s.jB, 0.95), -20, 8), soma(lerp2(s.qB, s.jB, 0.95), -38, 0), soma(s.qB, -26, -20)]));
      membro(g, s.qB, s.jB, s.tB, 10, 8, 6.5, calca); bota(g, s.tB, '#16120f', '#0a0806');
      membro(g, s.ombroB, ik(s.ombroB, maoB, 27, 25, 1), maoB, 7.5, 6.5, 5.5, casEsc);
      membro(g, s.qF, s.jF, s.tF, 10, 8, 6.5, calca); bota(g, s.tF, '#16120f', '#0a0806');
      casaco(g, s, cas, 0.92);
      g.fillStyle = '#161a22'; g.fill(forma([soma(s.ombroF, -2, -4), soma(s.ombroF, 5, -4), soma(s.qF, 8, -6), soma(s.qF, 2, -2)], false));
      g.fillStyle = '#3a4255'; g.fill(forma([soma(s.ombroF, 2, -10), soma(s.ombroF, 12, 0), soma(s.ombroF, 9, 18), soma(s.ombroF, 4, 6)]));
      g.fillStyle = '#17130f'; g.fillRect(s.qB[0] - 12, s.qF[1] - 6, 34, 6); g.fillStyle = '#7a6a52'; g.fillRect(s.qF[0] + 4, s.qF[1] - 6, 5, 6);
      dobras(g, s, 3);
      g.fillStyle = '#4b433a'; g.fill(forma([soma(s.ombroF, -6, -12), soma(s.ombroF, 14, -8), soma(s.ombroF, 18, 8), soma(s.ombroF, -2, 8)]));
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(s.ombroF[0] - 4, s.ombroF[1], 20, 2.5);
      cabeca(g, s.cab, { pele, cabelo: '#141519' });
      g.fillStyle = COR.ambar;
      g.fill(forma([soma(s.cab, -14, 12), soma(s.cab, 4, 10), soma(s.cab, 6, 20), soma(s.cab, -14, 22)]));
      g.fill(forma([soma(s.cab, -14, 16), soma(s.cab, -8, 18), soma(s.cab, -20, 44 - s.inclina), soma(s.cab, -26, 40 - s.inclina)]));
      g.save(); g.translate(pivo[0], pivo[1]); g.rotate(m);
      g.fillStyle = '#5a4230'; g.fill(forma([[-26, 4], [-4, -2], [4, 6], [-22, 14]]));
      g.fillStyle = '#2c303b'; g.fillRect(-4, -5, 52, 6); g.fillRect(-4, 1, 52, 5);
      g.fillStyle = 'rgba(237,244,240,0.25)'; g.fillRect(0, -5, 46, 1.5);
      g.fillStyle = '#4a3828'; g.fillRect(18, 3, 16, 7);
      g.restore();
      mao(g, maoB, luva);
      membro(g, s.ombroF, ik(s.ombroF, maoF, 27, 25, 1), maoF, 8, 7, 6, cas);
      mao(g, maoF, luva);
    } },
    // Goteira Faca: capa de chuva de plástico com capuz, bandana coral, faca
    faca: { altura: 70, desenhar(g, s, pose) {
      const pele = '#8e6a55', calca = '#2a2c33', pl = '#4c5466', plEsc = '#3c4354';
      const golpe = pose === 'golpe', t = s.fase;
      const maoF = golpe ? (t < 0.6 ? soma(s.ombroF, -6, -26) : soma(s.ombroF, 40, 6)) : pose === 'recua' ? soma(s.ombroF, 6, -30) : soma(s.ombroF, 26, 20);
      const maoB = pose === 'corre' ? soma(s.ombroB, -14 - 20 * Math.sin(s.phi), 40) : soma(s.ombroB, -16, 44);
      membro(g, s.qB, s.jB, s.tB, 9.5, 7.5, 6, calca); bota(g, s.tB, '#bdb8ad', '#3a3630');
      membro(g, s.ombroB, ik(s.ombroB, maoB, 26, 24, -1), maoB, 7, 6, 5, plEsc); mao(g, maoB, pele);
      membro(g, s.qF, s.jF, s.tF, 9.5, 7.5, 6, calca); bota(g, s.tF, '#bdb8ad', '#3a3630');
      casaco(g, s, pl, 0.5, 1.15);
      g.strokeStyle = 'rgba(230,238,255,0.32)'; g.lineWidth = 2.5;
      for (const [a, b] of [[0, 14], [12, 34], [-12, 46]]) { g.beginPath(); g.moveTo(s.ombroF[0] + a - 4, s.ombroF[1] + b); g.lineTo(s.ombroF[0] + a, s.ombroF[1] + b + 24); g.stroke(); }
      dobras(g, s, 3, 0.22);
      cabeca(g, s.cab, { pele });
      const c = s.cab;
      g.fillStyle = pl; g.fill(forma([soma(c, -16, 14), soma(c, -18, -8), soma(c, -6, -22), soma(c, 10, -20), soma(c, 17, -8), soma(c, 8, -12), soma(c, -2, -6), soma(c, -4, 12)]));
      g.fillStyle = '#b8645d'; g.fill(forma([soma(c, 1, 4), soma(c, 15, 3), soma(c, 12, 12), soma(c, 1, 13)]));
      membro(g, s.ombroF, ik(s.ombroF, maoF, 26, 24, golpe && t < 0.6 ? -1 : 1), maoF, 7, 6, 5, pl);
      g.save(); g.translate(maoF[0], maoF[1]); g.rotate(golpe ? (t < 0.6 ? -2.2 : 0.2) : pose === 'recua' ? -1.4 : 0.5);
      g.fillStyle = '#c9d2e0'; g.fill(forma([[2, -3], [26, -1], [30, 1], [2, 3]], false)); g.fillStyle = '#222'; g.fillRect(-6, -3, 9, 6);
      g.restore(); mao(g, maoF, pele);
    } },
    // Goteira Atirador: jaqueta curta, boné, fuzil apoiado no ombro
    atirador: { altura: 72, desenhar(g, s, pose) {
      const pele = '#7f5d4a', calca = '#24262d', jaq = '#3b3036';
      const mirando = pose === 'atira' || pose === 'parado', m = mirando ? s.mira : 0.9;
      const pivo = soma(s.ombroF, -4, 6), dir = [Math.cos(m), Math.sin(m)];
      const maoB = soma(pivo, dir[0] * 40, dir[1] * 40), maoF = soma(pivo, dir[0] * 12, dir[1] * 12 + 6);
      membro(g, s.qB, s.jB, s.tB, 9.5, 7.5, 6, calca); bota(g, s.tB, '#15130f', '#080706');
      membro(g, s.ombroB, ik(s.ombroB, maoB, 27, 25, 1), maoB, 7, 6, 5, '#2c2328'); mao(g, maoB, pele);
      membro(g, s.qF, s.jF, s.tF, 9.5, 7.5, 6, calca); bota(g, s.tF, '#15130f', '#080706');
      casaco(g, s, jaq, 0.05, 0.95);
      g.fillStyle = '#2a2125'; g.fillRect(s.qB[0] - 12, s.qF[1] - 10, 34, 8);
      g.fillStyle = '#b8645d'; g.fillRect(s.ombroB[0] - 12, s.ombroB[1] + 12, 8, 10);
      cabeca(g, s.cab, { pele, cabelo: '#111' });
      g.fillStyle = '#1d212b'; g.fill(forma([soma(s.cab, -14, -16), soma(s.cab, 6, -18), soma(s.cab, 10, -8), soma(s.cab, -16, -6)])); g.fillRect(s.cab[0] + 2, s.cab[1] - 10, 18, 4);
      g.save(); g.translate(pivo[0], pivo[1]); g.rotate(m);
      g.fillStyle = '#3a2c22'; g.fill(forma([[-20, -4], [4, -6], [4, 8], [-18, 10]]));
      g.fillStyle = '#2b2f39'; g.fillRect(2, -5, 70, 8); g.fillRect(14, -12, 22, 6); g.fillRect(40, 3, 8, 12);
      g.restore();
      membro(g, s.ombroF, ik(s.ombroF, maoF, 27, 25, 1), maoF, 8, 7, 6, jaq); mao(g, maoF, pele);
    } },
    // Portão: grandalhão de moletom, colete acolchoado e porta de aço como escudo
    portao: { altura: 88, desenhar(g, s, pose) {
      const pele = '#6f5243', calca = '#26282e', mol = '#3b3f48', col = '#2a2d34';
      membro(g, s.qB, s.jB, s.tB, 12, 10, 8, calca); bota(g, s.tB, '#121010', '#060505', 1.2);
      membro(g, s.qF, s.jF, s.tF, 12, 10, 8, calca); bota(g, s.tF, '#121010', '#060505', 1.2);
      casaco(g, s, mol, 0.08, 1.35);
      g.fillStyle = col; g.fill(forma([soma(s.ombroB, -10, 2), soma(s.ombroF, 10, -2), soma(s.ombroF, 16, 16), soma(s.qF, 16, -8), soma(s.qB, -14, -6), soma(s.ombroB, -16, 18)]));
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      for (let k = 10; k < 46; k += 9) { g.beginPath(); g.moveTo(s.ombroB[0] - 12, s.ombroB[1] + k); g.lineTo(s.ombroF[0] + 14, s.ombroF[1] + k - 2); g.stroke(); }
      cabeca(g, s.cab, { pele });
      const c = s.cab;
      g.fillStyle = mol; g.fill(forma([soma(c, -18, 20), soma(c, -20, -6), soma(c, -8, -22), soma(c, 10, -20), soma(c, 18, -6), soma(c, 8, -8), soma(c, -4, -2), soma(c, -6, 18)]));
      g.fillStyle = '#b8645d'; g.fill(forma([soma(c, 0, 4), soma(c, 15, 3), soma(c, 13, 12), soma(c, 0, 13)]));
      const empurra = pose === 'golpe' ? 14 * s.fase : pose === 'investe' ? 12 : 0;
      const maoF = soma(s.ombroF, 30 + empurra, 20);
      membro(g, s.ombroF, ik(s.ombroF, maoF, 30, 28, 1), maoF, 10, 9, 7, mol);
      // porta de aço de enrolar, arrancada, segurada na frente
      const px = s.ombroF[0] + 22 + empurra, py = s.ombroF[1] - 30;
      g.fillStyle = '#5a5f6a'; g.fillRect(px, py, 26, 128);
      g.fillStyle = 'rgba(0,0,0,0.3)'; for (let b = 6; b < 128; b += 9) g.fillRect(px, py + b, 26, 3);
      g.fillStyle = 'rgba(140,82,52,0.55)'; g.fillRect(px + 4, py + 84, 14, 18);
      g.strokeStyle = 'rgba(237,136,127,0.75)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px + 13, py + 30); g.quadraticCurveTo(px + 22, py + 54, px + 13, py + 62); g.quadraticCurveTo(px + 4, py + 54, px + 13, py + 30); g.stroke();
      mao(g, soma(maoF, 2, 0), pele, 7);
    } },
  };

  function rolando(g, s, cas, pele, cachecol) {
    // bola encolhida girando: corpo, cabeça e pernas dobradas
    g.save(); g.translate(0, -34); g.rotate(s.fase * Math.PI * 2);
    g.fillStyle = cas; g.beginPath(); g.ellipse(0, 0, 30, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1f232d'; g.beginPath(); g.ellipse(14, 12, 16, 10, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = pele; g.beginPath(); g.arc(-16, -14, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = cachecol; g.fillRect(-14, -6, 16, 6);
    g.restore();
  }

  // ── sprite com sombreado, recorte e contorno ───────
  function gerarSprite(tipo, pose, fase, olha, mira, escala) {
    const T = TIPOS[tipo], S = escala * T.altura / ALTURA;
    const LADO = 300, c = document.createElement('canvas');
    c.width = Math.max(8, Math.ceil(LADO * S)); c.height = c.width;
    const g = c.getContext('2d'), ox = c.width / 2, oy = c.height - 16 * S;
    const s = esqueleto(pose, fase, mira);
    g.save(); g.translate(ox, oy); g.scale(S * olha, S); g.lineJoin = 'round'; g.lineCap = 'round';
    T.desenhar(g, s, pose); g.restore();
    const lx = LUZ[0] * olha, ly = LUZ[1];
    g.globalCompositeOperation = 'source-atop';
    const cy = oy - 100 * S;
    const sg = g.createLinearGradient(ox + lx * 60 * S, cy + ly * 60 * S, ox - lx * 60 * S, cy - ly * 60 * S);
    sg.addColorStop(0, 'rgba(255,214,160,0.14)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(4,8,20,0.45)');
    g.fillStyle = sg; g.fillRect(0, 0, c.width, c.height);
    const ag = g.createLinearGradient(0, oy - 60 * S, 0, oy); ag.addColorStop(0, 'rgba(4,8,20,0)'); ag.addColorStop(1, 'rgba(4,8,20,0.4)');
    g.fillStyle = ag; g.fillRect(0, 0, c.width, c.height);
    const px = Math.max(1.2, 3.2 * S);
    const rim = document.createElement('canvas'); rim.width = c.width; rim.height = c.height;
    const rg = rim.getContext('2d');
    rg.drawImage(c, 0, 0); rg.globalCompositeOperation = 'source-in'; rg.fillStyle = G.rgba(RECORTE, 0.8); rg.fillRect(0, 0, c.width, c.height);
    rg.globalCompositeOperation = 'destination-out'; rg.drawImage(c, -lx * px, -ly * px);
    g.globalCompositeOperation = 'lighter'; g.drawImage(rim, 0, 0);
    const borda = Math.max(1, 2.2 * S / 0.45);
    const out = document.createElement('canvas'); out.width = c.width + 6; out.height = c.height + 6;
    const og = out.getContext('2d');
    rg.globalCompositeOperation = 'copy'; rg.drawImage(c, 0, 0);
    rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#04060c'; rg.fillRect(0, 0, c.width, c.height);
    for (let a = 0; a < 8; a++) og.drawImage(rim, 3 + Math.cos(a * Math.PI / 4) * borda, 3 + Math.sin(a * Math.PI / 4) * borda);
    og.drawImage(c, 3, 3);
    return { c: out, ox: ox + 3, oy: oy + 3 };
  }

  const QUADROS = { anda: 8, corre: 8, golpe: 4, rola: 6 };
  function sprite(tipo, pose, fase, olha, mira, escala) {
    if (escala !== escalaCache) { cache.clear(); escalaCache = escala; }
    const n = QUADROS[pose] || 1, q = Math.floor(((fase % 1) + 1) % 1 * n) % n;
    // mira em 8 faixas no meio-plano pra onde ele olha
    let ml = olha > 0 ? mira : Math.PI - mira;
    ml = G.difAng(ml, 0); ml = G.clamp(ml, -1.3, 1.3);
    const mb = Math.round((ml + 1.3) / 2.6 * 7);
    const k = `${tipo}|${pose}|${q}|${olha}|${mb}`;
    let sp = cache.get(k);
    if (!sp) {
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      sp = gerarSprite(tipo, pose, q / n, olha, mb / 7 * 2.6 - 1.3, escala);
      cache.set(k, sp);
    } else { cache.delete(k); cache.set(k, sp); }   // LRU: usado agora vai pro fim
    return sp;
  }

  let rascunho = null;
  // desenha no ctx com transform de mundo (z = pixels por unidade)
  function desenhar(ctx, z, tipo, x, y, e) {
    const sp = sprite(tipo, e.pose || 'parado', e.fase || 0, e.olha || 1, e.mira ?? 0.4, Math.round(z * 100) / 100);
    const k = 1 / z, W = sp.c.width * k, Hh = sp.c.height * k;
    const larg = TIPOS[tipo].altura * 0.42;
    ctx.fillStyle = 'rgba(3,6,14,0.5)';
    ctx.beginPath(); ctx.ellipse(x - 4, y + 1, larg, larg * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    const dx = x - sp.ox * k, dy = y - sp.oy * k;
    if (e.alfa != null) ctx.globalAlpha = e.alfa;
    ctx.drawImage(sp.c, dx, dy, W, Hh);
    if (e.flash > 0) {
      if (!rascunho) rascunho = document.createElement('canvas');
      rascunho.width = sp.c.width; rascunho.height = sp.c.height;
      const rg = rascunho.getContext('2d');
      rg.drawImage(sp.c, 0, 0); rg.globalCompositeOperation = 'source-in';
      rg.fillStyle = `rgba(250,240,225,${Math.min(0.85, e.flash)})`; rg.fillRect(0, 0, sp.c.width, sp.c.height);
      ctx.drawImage(rascunho, dx, dy, W, Hh);
    }
    ctx.globalAlpha = 1;
  }

  // retrato do jogador pra HUD
  function retrato(canvas) {
    const g = canvas.getContext('2d'), w = canvas.width;
    g.clearRect(0, 0, w, w);
    g.save(); g.translate(w * 0.42, w * 1.02); g.scale(w / 64, w / 64);
    const s = esqueleto('parado', 0, 0.3);
    g.translate(-s.cab[0], -s.cab[1] - 52); g.scale(1, 1);
    TIPOS.faro.desenhar(g, s, 'parado');
    g.restore();
  }

  G.figuras = { desenhar, retrato, TIPOS, esqueleto, limpar: () => cache.clear(), tamanhoCache: () => cache.size };
})();

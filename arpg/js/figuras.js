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
  const barra = (g, a, b, r, cor) => { g.fillStyle = cor; g.fill(capsula(a[0], a[1], r, b[0], b[1], r)); };
  function disco(g, x, y, r, cor) { g.fillStyle = cor; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // brilho é luz emitida: durante gerarSprite ele só anota a posição e entra depois do
  // contorno, somado (senão o contorno escurece o halo); fora dele desenha direto
  let luzes = null;
  function emite(g, fn) { if (luzes) luzes.push({ m: g.getTransform(), fn }); else fn(g); }
  function brilho(g, x, y, r, cor, a) {
    emite(g, g => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, G.rgba(cor, a)); gr.addColorStop(1, G.rgba(cor, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
  function caixa(x, y, w, h, r) {
    const p = new Path2D(); r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p;
  }
  // engrenagem/rolo dentado visto de lado
  function engrenagem(g, x, y, r, n, ang, cor, corEsc) {
    const p = new Path2D();
    for (let i = 0; i < n * 2; i++) {
      const a0 = ang + i * Math.PI / n, a1 = a0 + Math.PI / n, rr = i % 2 ? r - 7 : r;
      if (!i) p.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr); else p.lineTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
      p.lineTo(x + Math.cos(a1 - 0.08) * rr, y + Math.sin(a1 - 0.08) * rr);
    }
    p.closePath(); g.fillStyle = cor; g.fill(p);
    disco(g, x, y, r * 0.62, corEsc); disco(g, x, y, r * 0.24, cor);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 2; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 2.4, 0, Math.PI * 2); g.fill(); }
  }
  // balanço dos braços ao andar (-1..1); zero fora de anda/corre
  const bal = (s, pose) => (pose === 'anda' ? Math.sin(s.phi) : pose === 'corre' ? 1.35 * Math.sin(s.phi) : 0);
  // corrente: elos ao longo de uma lista de pontos
  function corrente(g, pts, cor) {
    g.strokeStyle = cor; g.lineWidth = 2.4;
    let resto = 0, k = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      let d = resto;
      for (; d < L; d += 7.5, k++) {
        const x = a[0] + (b[0] - a[0]) * d / L, y = a[1] + (b[1] - a[1]) * d / L;
        g.beginPath(); g.ellipse(x, y, 4.6, k % 2 ? 1.2 : 2.8, ang, 0, Math.PI * 2); g.stroke();
      }
      resto = d - L;
    }
  }
  function curva(a, c, b, n = 14) {
    const r = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; r.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
    return r;
  }
  // exoesqueleto de carga: barras paralelas ao membro, juntas aparafusadas
  function exoPerna(g, q, j, t, cor) {
    const a = soma(q, 3, -2), k = soma(j, 8, 0), b = soma(t, 3, -16);
    barra(g, a, k, 3.6, cor); barra(g, k, b, 3.6, cor);
    barra(g, lerp2(k, b, 0.2), lerp2(k, b, 0.78), 6.5, cor);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill(capsula(...lerp2(k, b, 0.3), 1.2, ...lerp2(k, b, 0.7), 1.2));
    barra(g, b, soma(t, 16, -3), 3, cor);
    disco(g, a[0], a[1], 6.5, cor); disco(g, k[0], k[1], 7.5, cor); disco(g, k[0], k[1], 3, '#17191d'); disco(g, a[0], a[1], 2.6, '#17191d');
  }
  function exoBraco(g, o, c, m, cor) {
    barra(g, soma(o, 0, -7), soma(c, 0, -5), 3.4, cor); barra(g, soma(c, 0, -5), m, 3.4, cor);
    barra(g, lerp2(c, m, 0.15), lerp2(c, m, 0.7), 6, cor);
    disco(g, o[0], o[1] - 7, 8, cor); disco(g, o[0], o[1] - 7, 3, '#17191d');
    disco(g, c[0], c[1] - 5, 6.5, cor); disco(g, c[0], c[1] - 5, 2.6, '#17191d');
  }
  function pinca(g, p, ang, abre, cor, anel) {
    g.save(); g.translate(p[0], p[1]); g.rotate(ang);
    const garra = [[0, -5], [14, -8], [25, -4], [29, 3], [22, 1], [12, -1], [0, 3]];
    for (const lado of [-1, 1]) {
      g.save(); g.translate(8, 5 * lado); g.rotate(-lado * abre);
      g.fillStyle = lado < 0 ? cor : G.mistura(cor, '#000000', 0.25);
      g.fill(forma(garra.map(([x, y]) => [x, y * -lado]), false)); g.restore();
    }
    g.fillStyle = cor; g.fill(caixa(-7, -10, 18, 20, 4));
    g.fillStyle = anel; g.fillRect(-5, -10, 6, 20);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(4, -2, 6, 4);
    g.restore();
  }
  function sinalizador(g, p, ang, aceso, cor) {
    g.save(); g.translate(p[0], p[1]); g.rotate(ang);
    if (aceso) { brilho(g, 32, 0, 50, cor, 0.55); brilho(g, 32, 0, 14, '#FFE9CC', 0.9); }
    g.fillStyle = '#26262a'; g.fillRect(-6, -3.2, 20, 6.4);
    g.fillStyle = cor; g.fillRect(12, -3.6, 14, 7.2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(12, 1.5, 14, 2);
    if (aceso) {
      g.fillStyle = '#FFE3BF'; g.fill(forma([[25, -4], [36, -2], [44, 0], [36, 2], [25, 4]]));
      g.fillStyle = 'rgba(255,236,210,0.85)';
      for (const [x, y] of [[40, -9], [48, 5], [36, 10], [52, -4]]) g.fillRect(x, y, 2.2, 2.2);
    } else { g.fillStyle = '#3b2c22'; g.fillRect(25, -2.4, 3, 4.8); }
    g.restore();
  }
  function pistola(g, p, ang) {
    g.save(); g.translate(p[0], p[1]); g.rotate(ang);
    g.fillStyle = '#1b1d22'; g.fill(forma([[-3, -1], [5, -1], [3, 12], [-5, 11]], false));
    g.fillStyle = '#2e323b'; g.fillRect(-4, -7, 26, 7);
    g.fillStyle = 'rgba(237,244,240,0.28)'; g.fillRect(-2, -7, 22, 1.4);
    g.restore();
  }
  // chapéu de oleado (aba larga, mais comprida atrás)
  function chapeuOleado(g, c, cor) {
    g.fillStyle = cor;
    g.fill(forma([soma(c, -12, -6), soma(c, -10, -20), soma(c, 2, -25), soma(c, 12, -21), soma(c, 14, -7)]));
    g.fill(forma([soma(c, -28, 8), soma(c, -18, -8), soma(c, 4, -11), soma(c, 20, -9), soma(c, 25, -5), soma(c, 18, -3), soma(c, 0, -4), soma(c, -16, 4)]));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(c[0] - 12, c[1] - 9, 26, 2.5);
  }
  function gorro(g, c, cor) {
    g.fillStyle = cor;
    g.fill(forma([soma(c, -15, 2), soma(c, -15, -14), soma(c, -4, -23), soma(c, 9, -21), soma(c, 15, -11), soma(c, 15, -5), soma(c, 2, -7), soma(c, -8, -3)]));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(forma([soma(c, -15, -4), soma(c, 15, -9), soma(c, 15, -5), soma(c, -15, 1)], false));
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

    // ── Docas ──
    // Estivador: grandalhão num exo de carga, quadro de aço nos membros, pinça na mão da frente
    estivador: { altura: 88, desenhar(g, s, pose) {
      const pele = '#76584a', mac = '#33363d', macEsc = '#272a30', aco = '#5d636c', acoEsc = '#40454d', cor = '#D9925A';
      const b = bal(s, pose), t = s.fase, golpe = pose === 'golpe';
      const maoB = soma(s.ombroB, 4 + 16 * b, 46);
      const maoF = golpe ? (t < 0.5 ? soma(s.ombroF, -12, 20) : soma(s.ombroF, 54, 4))
        : pose === 'investe' ? soma(s.ombroF, 48, 8) : pose === 'atira' ? soma(s.ombroF, 40, 0)
        : pose === 'recua' ? soma(s.ombroF, 22, -16) : soma(s.ombroF, 16 - 16 * b, 44);
      const abre = golpe ? (t < 0.5 ? 0.75 : 0.06) : pose === 'investe' || pose === 'atira' ? 0.6 : 0.22;
      // quadro das costas, por trás de tudo
      barra(g, soma(s.ombroB, -20, -22), soma(s.qB, -18, 4), 5, acoEsc);
      barra(g, soma(s.ombroB, -20, -22), soma(s.ombroF, -2, -22), 4, acoEsc);
      g.fillStyle = acoEsc; g.fill(caixa(s.ombroB[0] - 32, s.ombroB[1] + 6, 16, 40, 4));
      membro(g, s.qB, s.jB, s.tB, 13, 11, 8, macEsc); bota(g, s.tB, '#141210', '#060505', 1.25);
      exoPerna(g, s.qB, s.jB, s.tB, acoEsc);
      const cB = ik(s.ombroB, maoB, 30, 28, 1);
      membro(g, s.ombroB, cB, maoB, 10, 9, 7, macEsc); exoBraco(g, s.ombroB, cB, maoB, acoEsc); mao(g, maoB, '#1b1816', 7);
      membro(g, s.qF, s.jF, s.tF, 13, 11, 8, mac); bota(g, s.tF, '#141210', '#060505', 1.25);
      casaco(g, s, mac, 0.12, 1.4);
      exoPerna(g, s.qF, s.jF, s.tF, aco);
      // arnês do exo no peito e cinto de ferramentas
      g.fillStyle = acoEsc; g.fill(forma([soma(s.ombroB, -6, 4), soma(s.ombroF, 10, 0), soma(s.ombroF, 16, 22), soma(s.ombroB, -4, 26)]));
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 8; k < 24; k += 7) g.fillRect(s.ombroB[0] - 4, s.ombroB[1] + k, s.ombroF[0] - s.ombroB[0] + 16, 2);
      g.fillStyle = '#1c1d21'; g.fillRect(s.qB[0] - 14, s.qF[1] - 8, 38, 8); g.fillStyle = acoEsc; g.fillRect(s.qF[0] + 2, s.qF[1] - 10, 10, 10);
      cabeca(g, s.cab, { pele });
      g.fillStyle = 'rgba(20,16,14,0.45)'; g.fill(forma([soma(s.cab, 0, 6), soma(s.cab, 14, 4), soma(s.cab, 10, 14), soma(s.cab, 0, 15)]));
      gorro(g, s.cab, '#26282e');
      const cF = ik(s.ombroF, maoF, 30, 28, 1);
      membro(g, s.ombroF, cF, maoF, 11, 10, 8, mac);
      exoBraco(g, s.ombroF, cF, maoF, aco);
      pinca(g, maoF, Math.atan2(maoF[1] - cF[1], maoF[0] - cF[0]), abre, aco, cor);
    } },
    // Vigia: magro, capa de oleado e chapéu de aba, sinalizador na mão
    vigia: { altura: 72, desenhar(g, s, pose) {
      const pele = '#8c6c58', calca = '#25272d', ole = '#3f4436', oleEsc = '#30342a', cor = '#D9925A';
      const b = bal(s, pose), t = s.fase, ergue = pose === 'atira';
      const maoB = soma(s.ombroB, 8 + 14 * b, 44);
      const maoF = ergue ? soma(s.ombroF, 8, -48) : pose === 'golpe' ? (t < 0.5 ? soma(s.ombroF, -6, -34) : soma(s.ombroF, 46, 6))
        : pose === 'recua' ? soma(s.ombroF, 18, -22) : pose === 'investe' ? soma(s.ombroF, 42, 10) : soma(s.ombroF, 16 - 14 * b, 42);
      const angS = ergue ? -Math.PI / 2 + 0.12 : pose === 'golpe' ? (t < 0.5 ? -2.3 : 0.15) : pose === 'recua' ? -1.3 : pose === 'investe' ? -0.15 : 0.55;
      membro(g, s.qB, s.jB, s.tB, 8.5, 7, 5.5, calca); bota(g, s.tB, '#1d1a14', '#080706');
      const cB = ik(s.ombroB, maoB, 26, 24, 1);
      membro(g, s.ombroB, cB, maoB, 7, 6, 5, oleEsc); mao(g, maoB, pele, 5);
      membro(g, s.qF, s.jF, s.tF, 8.5, 7, 5.5, calca); bota(g, s.tF, '#1d1a14', '#080706');
      casaco(g, s, ole, 0.72, 1.25);
      // brilho do oleado molhado
      g.strokeStyle = 'rgba(214,222,190,0.2)'; g.lineWidth = 2.2;
      for (const [a, d] of [[2, 16], [12, 30], [-10, 40]]) { g.beginPath(); g.moveTo(s.ombroF[0] + a - 3, s.ombroF[1] + d); g.lineTo(s.ombroF[0] + a + 1, s.ombroF[1] + d + 26); g.stroke(); }
      dobras(g, s, 3, 0.3);
      g.fillStyle = oleEsc; g.fill(forma([soma(s.ombroB, -6, -8), soma(s.ombroF, 8, -10), soma(s.ombroF, 6, 2), soma(s.ombroB, -4, 2)]));
      cabeca(g, s.cab, { pele });
      chapeuOleado(g, s.cab, oleEsc);
      const cF = ik(s.ombroF, maoF, 26, 24, ergue || (pose === 'golpe' && t < 0.5) ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 7.5, 6.5, 5.5, ole);
      sinalizador(g, maoF, angS, ergue, cor);
      mao(g, maoF, pele, 5.5);
    } },
    // Empilhadeira: máquina sem cabine ocupada, garfos na frente, giroflex no teto
    empilhadeira: { altura: 70, sombra: [34, 11], desenhar(g, s, pose) {
      const corpo = '#3b3f47', corpoEsc = '#2b2e35', aco = '#5f646d', pneu = '#14161a', cor = '#D9925A';
      const inv = pose === 'investe', mov = pose === 'anda' || pose === 'corre' || inv;
      const garfo = inv ? -8 : pose === 'golpe' ? -30 - 60 * s.fase : pose === 'atira' ? -70 : pose === 'recua' ? -50 : -32;
      const giro = mov ? s.phi : 0, vib = mov ? Math.sin(s.phi * 2) * 1.2 : 0;
      g.save();
      if (inv) { g.translate(40, 0); g.rotate(0.09); g.translate(-40, 0); }
      if (pose === 'recua') { g.translate(-60, 0); g.rotate(-0.06); g.translate(60, 0); }
      g.translate(0, vib);
      // mastro e garfos
      g.fillStyle = corpoEsc; g.fillRect(48, -156, 7, 152); g.fillRect(58, -150, 6, 146);
      g.fillStyle = 'rgba(0,0,0,0.4)'; for (let y = -140; y < -10; y += 26) g.fillRect(48, y, 16, 3);
      barra(g, [44, -30], [44, -118], 3, aco);
      g.fillStyle = aco; g.fillRect(62, garfo - 38, 9, 42);
      g.fill(forma([[66, garfo - 4], [134, garfo - 3], [138, garfo + 1], [66, garfo + 3]], false));
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(66, garfo + 1, 70, 2);
      // carroceria: contrapeso atrás, caixas de roda
      g.fillStyle = corpo;
      g.fill(forma([[-104, -26], [-108, -70], [-96, -88], [-60, -92], [-40, -74], [30, -74], [46, -66], [48, -24]], false));
      g.fillStyle = corpoEsc; g.fill(caixa(-110, -90, 46, 66, 14));
      g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = -80; y < -30; y += 12) g.fillRect(-106, y, 38, 3);
      g.fillStyle = '#16181d'; g.beginPath(); g.arc(-58, -24, 30, Math.PI, 0); g.arc(34, -26, 32, Math.PI, 0); g.fill();
      // gaiola de proteção e banco vazio
      barra(g, [-44, -74], [-50, -164], 3.2, corpoEsc); barra(g, [28, -74], [34, -164], 3.2, corpoEsc);
      g.fillStyle = corpoEsc; g.fillRect(-58, -170, 98, 9);
      g.fillStyle = '#23252b'; g.fill(forma([[-34, -76], [-14, -76], [-16, -84], [-32, -86], [-38, -122], [-46, -120]]));
      barra(g, [8, -78], [22, -104], 2.4, corpoEsc); g.fillStyle = '#23252b'; g.beginPath(); g.ellipse(20, -106, 9, 3, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(237,244,240,0.18)'; g.fillRect(-56, -170, 96, 2);
      // escapamento e farol
      barra(g, [-88, -92], [-88, -116], 3.4, '#202227');
      g.fillStyle = '#d8d2c0'; g.fillRect(40, -70, 6, 7);
      // giroflex no teto
      g.fillStyle = '#202227'; g.fillRect(-14, -176, 20, 6);
      if (inv || pose === 'atira') brilho(g, -4, -184, 36, cor, 0.55); else brilho(g, -4, -184, 18, cor, 0.35);
      g.fillStyle = cor; g.beginPath(); g.ellipse(-4, -177, 9, 11, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,235,210,0.7)'; g.fillRect(-8, -184, 3, 5);
      // rodas
      for (const [x, r] of [[-58, 22], [34, 24]]) {
        disco(g, x, -r, r, pneu); disco(g, x, -r, r * 0.5, '#41454d');
        g.fillStyle = '#1b1d22';
        for (let i = 0; i < 3; i++) { const a = giro + i * 2.094; g.fillRect(x + Math.cos(a) * r * 0.32 - 2, -r + Math.sin(a) * r * 0.32 - 2, 4, 4); }
      }
      g.restore();
    } },

    // ── Ferro-Velho ──
    // Carcará: drone-pássaro de lata, voa a ~60 sobre a origem
    carcara: { altura: 78, sombra: [13, 4.5], desenhar(g, s, pose) {
      const lata = '#5a6058', lataEsc = '#40453f', clara = '#6c7369', ferr = '#7a4a32', esc = '#1c1e1d', olho = '#A8DBA0';
      const mov = pose === 'anda' || pose === 'corre', bate = Math.sin(s.phi);
      let cx = 0, cy = -146, rot = 0, k = 0.35, enc = 1, bico = 0, garra = false;
      if (pose === 'investe') { cx = 18; cy = -98; rot = 0.68; k = 0.25; enc = 0.72; }
      else if (pose === 'recua') { cy = -156; rot = -0.34; k = 0.95; }
      else if (pose === 'golpe') { cx = 10 * s.fase; cy = -126; rot = -0.2; k = 0.8; garra = true; }
      else if (pose === 'atira') { rot = -0.1; k = 0.6; bico = 1; }
      else if (mov) { k = bate; cy -= bate * 6; rot = pose === 'corre' ? 0.16 : 0.08; }
      const asa = (dx, dy, cA, cB) => {
        const a = -2.8 + 0.8 * k, L = 74 * enc, R1 = [10 + dx, -6 + dy], R2 = [-16 + dx, -2 + dy];
        const T = [R1[0] - 10 + Math.cos(a) * L, R1[1] + Math.sin(a) * L];
        const d = [T[0] - R2[0], T[1] - R2[1]], dl = Math.hypot(d[0], d[1]);
        let n = [-d[1] / dl, d[0] / dl];
        const mT = lerp2(R2, T, 0.5), mL = lerp2(R1, T, 0.5);
        if (n[0] * (mT[0] - mL[0]) + n[1] * (mT[1] - mL[1]) < 0) n = [-n[0], -n[1]];
        const pts = [R1, lerp2(R1, T, 0.55), T];
        for (let i = 3; i >= 1; i--) { const p = lerp2(R2, T, i / 4); pts.push(soma(p, n[0] * 9, n[1] * 9), soma(lerp2(R2, T, (i - 0.5) / 4), n[0] * 2, n[1] * 2)); }
        pts.push(R2);
        g.fillStyle = cA; g.fill(forma(pts, false));
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.6;
        for (let i = 1; i <= 3; i++) { const p = lerp2(R2, T, i / 4), q = lerp2(R1, T, i / 4); g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(p[0] + n[0] * 8, p[1] + n[1] * 8); g.stroke(); }
        g.fillStyle = cB; const f = lerp2(R1, T, 0.75); g.beginPath(); g.ellipse(f[0] + n[0] * 5, f[1] + n[1] * 5, 7, 4, a, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(237,244,240,0.3)'; for (let i = 1; i < 5; i++) { const p = lerp2(R1, T, i / 5); g.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
      };
      g.save(); g.translate(cx, cy); g.rotate(rot);
      asa(5, -3, lataEsc, '#5a3828');
      // cauda de chapas
      g.fillStyle = lataEsc; g.fill(forma([[-18, -4], [-48, -10], [-54, 0], [-46, 10], [-18, 6]], false));
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; for (const y of [-4, 3]) { g.beginPath(); g.moveTo(-20, y / 2); g.lineTo(-50, y); g.stroke(); }
      // hélice nas costas (é drone)
      barra(g, [-4, -12], [-4, -22], 2, esc);
      g.fillStyle = 'rgba(205,214,200,0.28)'; g.beginPath(); g.ellipse(-4, -23, 22, 3.2, 0, 0, Math.PI * 2); g.fill();
      // corpo: lata com frisos e ferrugem
      g.fillStyle = lata; g.fill(capsula(-22, 1, 12, 13, -3, 14));
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.6;
      for (const x of [-12, -2, 8]) { g.beginPath(); g.moveTo(x, -14); g.lineTo(x + 1, 13); g.stroke(); }
      g.fillStyle = ferr; g.beginPath(); g.ellipse(-12, 7, 8, 4, 0.2, 0, Math.PI * 2); g.fill();
      // garras
      if (garra) {
        barra(g, [2, 9], [18, 26], 2.4, esc);
        g.strokeStyle = esc; g.lineWidth = 2.2;
        for (const a of [-0.5, 0.1, 0.7]) { g.beginPath(); g.arc(18 + Math.cos(a) * 4, 26 + Math.sin(a) * 4, 5, a - 1, a + 0.8); g.stroke(); }
      } else barra(g, [-2, 10], [-10, 16], 2.4, esc);
      // cabeça, capuz escuro, bico em gancho e olho
      disco(g, 19, -11, 11, clara);
      g.fillStyle = '#2b2d2a'; g.fill(forma([[9, -16], [16, -24], [28, -20], [27, -14], [16, -14]]));
      g.fillStyle = '#9b9e93'; g.fill(forma([[27, -16], [40, -14], [45, -8], [42, -2], [38, -6], [28, -6]], false));
      g.fillStyle = '#3a3b37'; g.fill(forma([[40, -12], [45, -8], [42, -2], [40, -6]], false));
      if (bico) { g.fillStyle = '#7c7f75'; g.fill(forma([[28, -5], [40, 0], [36, 4], [27, 1]], false)); }
      brilho(g, 21, -13, 9, olho, 0.55); disco(g, 21, -13, 3, olho);
      asa(0, 0, clara, ferr);
      g.restore();
    } },
    // Cupim: robozinho de seis patas
    cupim: { altura: 22, sombra: [13, 4], desenhar(g, s, pose) {
      const lata = '#5f5c52', lataEsc = '#45433c', ferr = '#7a4a31', esc = '#1b1c1c', olho = '#A8DBA0';
      const mov = pose === 'anda' || pose === 'corre' || pose === 'investe', ph = s.phi;
      let by = -84, rot = 0, abre = 0.25, dx = 0;
      if (pose === 'investe') { rot = 0.14; by = -72; abre = 0.85; dx = 12; }
      else if (pose === 'recua') { rot = -0.24; dx = -8; }
      else if (pose === 'golpe') { abre = s.fase < 0.5 ? 0.9 : 0.02; dx = s.fase < 0.5 ? -8 : 16; rot = 0.08; }
      else if (pose === 'atira') { rot = -0.14; abre = 0.6; }
      if (mov) by -= Math.abs(Math.sin(ph * 2)) * 5;
      const cr = Math.cos(rot), sr = Math.sin(rot), P = (x, y) => [dx + x * cr - y * sr, by + x * sr + y * cr];
      const pata = (i, longe) => {
        const ax = [-30, 6, 30][i], base = [-128, 2, 122][i], off = (i % 2 ? Math.PI : 0) + (longe ? Math.PI : 0);
        const a = P(ax, 22), pe = [base + (longe ? 10 : 0) + (mov ? 20 * Math.sin(ph + off) : 0), -(mov ? Math.max(0, Math.cos(ph + off)) * 22 : 0)];
        const jo = [a[0] + (pe[0] - a[0]) * 0.62, by - 36 + (longe ? 6 : 0)];
        const cor = longe ? '#2c2d2b' : '#4a4a44';
        barra(g, a, jo, 5.5, cor); barra(g, jo, pe, 4, cor); disco(g, jo[0], jo[1], 6.5, longe ? esc : lataEsc);
        g.fillStyle = cor; g.fill(forma([soma(pe, -8, 0), soma(pe, 10, -2), soma(pe, 12, 4), soma(pe, -8, 4)], false));
      };
      for (let i = 0; i < 3; i++) pata(i, true);
      g.save(); g.translate(dx, by); g.rotate(rot);
      // antenas
      g.strokeStyle = esc; g.lineWidth = 3.2;
      for (const [x, y] of [[112, -66], [96, -74]]) { g.beginPath(); g.moveTo(66, -16); g.quadraticCurveTo(84, -60, x, y); g.stroke(); disco(g, x, y, 4.5, pose === 'atira' ? olho : '#3c3d38'); }
      if (pose === 'atira') brilho(g, 112, -66, 22, olho, 0.6);
      // abdome em gomos, tórax, cabeça
      g.fillStyle = lata; g.beginPath(); g.ellipse(-56, 0, 54, 40, -0.08, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 3;
      for (const x of [-84, -60, -36]) { g.beginPath(); g.ellipse(x, 0, 10, 36, 0, -1.2, 1.2); g.stroke(); }
      g.fillStyle = ferr; g.beginPath(); g.ellipse(-70, -18, 18, 9, -0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = lataEsc; g.beginPath(); g.ellipse(8, -2, 34, 32, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.4)'; for (const [x, y] of [[-4, -16], [16, -18], [6, 10]]) disco(g, x, y, 3.2, 'rgba(0,0,0,0.4)');
      g.fillStyle = '#4f4d45'; g.beginPath(); g.ellipse(64, 6, 27, 25, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(40, -22, 4, 44);
      // mandíbulas
      for (const lado of [-1, 1]) {
        g.save(); g.translate(82, 16); g.rotate(lado * abre * 0.6 + 0.25);
        g.fillStyle = lado < 0 ? '#76786d' : '#5a5b53';
        g.fill(forma([[-4, -5 * lado], [18, -6 * lado], [28, 4 * -lado + 2], [16, 0], [-2, 4 * lado]].map(([x, y]) => [x, y + lado * 5]), false));
        g.restore();
      }
      brilho(g, 76, -6, 20, olho, 0.5); disco(g, 76, -6, 7, olho); disco(g, 78, -8, 2.4, '#effcec');
      g.restore();
      for (let i = 0; i < 3; i++) pata(i, false);
    } },
    // Triturador: máquina elite de esteira, rolos dentados na frente, ímã no braço
    triturador: { altura: 86, largura: 380, sombra: [58, 14], desenhar(g, s, pose) {
      const casco = '#45433e', cascoEsc = '#34322e', ferr = '#6e4532', aco = '#51544f', esc = '#1d1e20', verde = '#A8DBA0';
      const ima = pose === 'atira', ativo = pose === 'anda' || pose === 'corre' || pose === 'golpe' || pose === 'investe';
      const giro = ativo ? s.phi * (pose === 'golpe' ? 2 : 1) : 0;
      g.save();
      if (pose === 'golpe') g.translate(14 * s.fase, 0);
      if (pose === 'investe') { g.translate(70, 0); g.rotate(0.06); g.translate(-70, 0); }
      if (pose === 'recua') { g.translate(-110, 0); g.rotate(-0.05); g.translate(110, 0); }
      // escapamentos
      barra(g, [-86, -120], [-88, -178], 5, '#26272a'); barra(g, [-70, -124], [-72, -166], 4, '#26272a');
      g.fillStyle = 'rgba(30,32,36,0.5)'; g.beginPath(); g.ellipse(-92, -184, 10, 5, 0, 0, Math.PI * 2); g.fill();
      // esteira
      g.fillStyle = esc; g.fill(caixa(-122, -50, 192, 50, 24));
      g.fillStyle = '#2c2d2f';
      for (let i = 0; i < 11; i++) { const off = (i * 16 + giro / (Math.PI * 2) * 16) % 176; g.fillRect(-112 + off, -50, 7, 4); g.fillRect(58 - off, -4, 7, 4); }
      for (let i = 0; i < 5; i++) { const x = -96 + i * 36; disco(g, x, -25, 15, '#3f4143'); disco(g, x, -25, 5, esc); }
      // casco remendado
      g.fillStyle = casco; g.fill(forma([[-110, -48], [-106, -126], [-64, -140], [16, -140], [52, -118], [62, -48]], false));
      g.fillStyle = cascoEsc; g.fill(forma([[-60, -138], [14, -138], [20, -104], [-56, -104]], false));
      g.fillStyle = ferr; for (const [x, y, rx, ry] of [[-84, -70, 16, 9], [26, -86, 10, 14], [-30, -60, 12, 6]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      for (const [a, b] of [[[-60, -104], [-62, -50]], [[20, -104], [24, -50]], [[-106, -90], [58, -90]]]) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      g.fillStyle = 'rgba(237,244,240,0.25)'; for (const [x, y] of [[-100, -96], [-70, -96], [-40, -96], [-10, -96], [30, -96]]) g.fillRect(x, y, 2.5, 2.5);
      g.fillStyle = esc; g.fillRect(-4, -126, 34, 8); disco(g, 36, -122, 3.4, ima ? verde : '#55705a');
      // rolos dentados na frente
      g.fillStyle = cascoEsc; g.fillRect(52, -112, 30, 10); g.fillRect(56, -62, 30, 10);
      engrenagem(g, 94, -42, 32, 10, giro, '#6b6d66', '#2a2b2c');
      engrenagem(g, 90, -104, 27, 9, -giro + 0.3, '#5f615b', '#2a2b2c');
      // braço com ímã
      const om = [-30, -146];
      const cot = ima ? [30, -186] : [4, -188];
      const mg = ima ? [100, -156] : [46, -150];
      const face = ima ? G.clamp(s.mira, -0.4, 0.6) : Math.PI / 2;
      disco(g, om[0], om[1], 16, cascoEsc);
      barra(g, om, cot, 9, aco); barra(g, cot, mg, 7, aco);
      barra(g, lerp2(om, cot, 0.3), lerp2(cot, mg, 0.4), 3, '#3d3f3c');
      disco(g, cot[0], cot[1], 10, cascoEsc); disco(g, cot[0], cot[1], 4, esc); disco(g, om[0], om[1], 5, esc);
      g.save(); g.translate(mg[0], mg[1]); g.rotate(face);
      if (ima) {
        brilho(g, 14, 0, 46, verde, 0.42);
        g.lineWidth = 3;
        for (let i = 0; i < 3; i++) { g.strokeStyle = G.rgba(verde, 0.7 - i * 0.2); g.beginPath(); g.arc(4, 0, 24 + i * 13, -0.75, 0.75); g.stroke(); }
      }
      g.fillStyle = '#4e463a'; g.fill(caixa(-16, -24, 20, 48, 5));
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; for (let x = -12; x < 4; x += 5) { g.beginPath(); g.moveTo(x, -22); g.lineTo(x, 22); g.stroke(); }
      g.fillStyle = ima ? '#cfe6c9' : aco; g.fillRect(4, -26, 7, 52);
      g.restore();
      g.restore();
    } },

    // ── Subsolo ──
    // Chiado: gente que o Ruído levou; magro, roupa rasgada, torto, silhueta com interferência
    chiado: { altura: 72, desenhar(g, s0, pose) {
      const s = { ...s0, ombroF: soma(s0.ombroF, 3, 7), ombroB: soma(s0.ombroB, 0, -2), cab: soma(s0.cab, 9, 8) };
      const pele = '#7b7470', calca = '#27282e', cam = '#3b3c46', camEsc = '#2e2f38';
      const b = bal(s, pose) * 1.3, t = s.fase;
      let maoF, maoB;
      if (pose === 'atira') { maoF = soma(s.ombroF, 48, -10); maoB = soma(s.ombroB, 46, -2); }
      else if (pose === 'golpe') { maoF = t < 0.5 ? soma(s.ombroF, -2, -40) : soma(s.ombroF, 46, 18); maoB = soma(s.ombroB, 18, 32); }
      else if (pose === 'investe') { maoF = soma(s.ombroF, 50, 10); maoB = soma(s.ombroB, 46, 18); }
      else if (pose === 'recua') { maoF = soma(s.ombroF, 14, -28); maoB = soma(s.ombroB, 22, -22); }
      else { maoF = soma(s.ombroF, 8 - 14 * b, 50); maoB = soma(s.ombroB, 2 + 14 * b, 49); }
      membro(g, s.qB, s.jB, s.tB, 8, 6.5, 5, calca); bota(g, s.tB, '#24211d', '#0b0a09', 0.9);
      const cB = ik(s.ombroB, maoB, 27, 25, 1);
      membro(g, s.ombroB, cB, maoB, 6.5, 5.5, 4.5, camEsc); g.fillStyle = pele; g.fill(capsula(...lerp2(s.ombroB, cB, 0.7), 4.5, ...maoB, 4)); mao(g, maoB, pele, 4.5);
      membro(g, s.qF, s.jF, s.tF, 8, 6.5, 5, calca); bota(g, s.tF, '#24211d', '#0b0a09', 0.9);
      g.fillStyle = pele; g.beginPath(); g.ellipse(s.jF[0] + 3, s.jF[1], 5, 6.5, 0, 0, Math.PI * 2); g.fill();
      // camisa rasgada: barra em zigue-zague e um rasgo no peito
      const hF = soma(s.qF, 12, 16), hB = soma(s.qB, -14, 10), pts = [soma(s.ombroB, -10, -4), soma(s.ombroF, 6, -8), soma(s.ombroF, 12, 4), soma(s.qF, 11, -6), hF];
      for (let i = 1; i < 6; i++) pts.push(soma(lerp2(hF, hB, i / 6), 0, i % 2 ? -12 : 2));
      pts.push(hB, soma(s.qB, -12, -10), soma(s.ombroB, -12, 10));
      g.fillStyle = cam; g.fill(forma(pts, false));
      g.fillStyle = pele; g.fill(forma([soma(s.ombroF, 0, 16), soma(s.ombroF, 8, 14), soma(s.ombroF, 4, 30), soma(s.ombroF, 0, 26)], false));
      dobras(g, s, 2, 0.3);
      g.save(); g.translate(s.cab[0], s.cab[1] + 14); g.rotate(0.38); g.translate(-s.cab[0], -s.cab[1] - 14);
      cabeca(g, s.cab, { pele });
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(s.cab[0] + 4, s.cab[1] - 4, 7, 4);
      g.fillStyle = '#16161a'; g.fill(forma([[-14, 6], [-17, -9], [-7, -18], [6, -17], [13, -10], [15, 0], [10, -6], [6, -1], [3, -8], [-3, -5], [-8, 4]].map(([x, y]) => soma(s.cab, x, y)), false));
      g.restore();
      const cF = ik(s.ombroF, maoF, 27, 25, pose === 'golpe' && t < 0.5 ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 6.5, 5.5, 4.5, cam); g.fillStyle = pele; g.fill(capsula(...lerp2(s.ombroF, cF, 0.7), 4.5, ...maoF, 4));
      mao(g, maoF, pele, 4.8);
    }, depois: interferencia },
    // Sentinela do Coro Mudo: manto até o chão, capuz, faixa na boca; canaliza com as mãos erguidas
    sentinela: { altura: 74, desenhar(g, s, pose) {
      const pele = '#6e605a', manto = '#2c2a38', mantoEsc = '#211f2b', faixa = '#AFA3F5';
      const canal = pose === 'atira', t = s.fase;
      let maoF, maoB;
      if (canal) { maoF = soma(s.ombroF, 22, -46); maoB = soma(s.ombroB, 30, -41); }
      else if (pose === 'golpe') { maoF = t < 0.5 ? soma(s.ombroF, 6, 12) : soma(s.ombroF, 50, -2); maoB = soma(s.peito, 6, 24); }
      else if (pose === 'investe') { maoF = soma(s.ombroF, 40, 20); maoB = soma(s.ombroB, 40, 24); }
      else if (pose === 'recua') { maoF = soma(s.ombroF, 22, -12); maoB = soma(s.ombroB, 26, -6); }
      else { maoF = soma(s.peito, 10, 24); maoB = soma(s.peito, 4, 22); }
      bota(g, s.tB, '#15131a', '#08070c', 0.85); bota(g, s.tF, '#15131a', '#08070c', 0.85);
      const cB = ik(s.ombroB, maoB, 27, 25, 1);
      membro(g, s.ombroB, cB, maoB, 8, 9, 11, mantoEsc); mao(g, maoB, pele, 5);
      // manto até os pés, barra acompanha as pernas
      const meio = soma(lerp2(s.tF, s.tB, 0.5), 0, -6);
      g.fillStyle = manto;
      g.fill(forma([soma(s.ombroB, -10, -8), soma(s.ombroF, 6, -12), soma(s.ombroF, 16, 4), soma(s.qF, 16, -4), soma(s.tF, 20, -12), meio, soma(s.tB, -18, -12), soma(s.qB, -20, 0), soma(s.ombroB, -16, 12)]));
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
      for (const k of [0.25, 0.55, 0.8]) { const a = lerp2(s.ombroB, s.ombroF, k), z = lerp2(s.tB, s.tF, k); g.beginPath(); g.moveTo(a[0], a[1] + 30); g.quadraticCurveTo((a[0] + z[0]) / 2 + 4, (a[1] + z[1]) / 2, z[0], z[1] - 14); g.stroke(); }
      g.fillStyle = mantoEsc; g.fillRect(s.qB[0] - 14, s.qF[1] - 8, 34, 5);
      // cabeça no fundo do capuz, faixa lavanda na boca
      const c = s.cab;
      cabeca(g, c, { pele });
      g.fillStyle = 'rgba(8,6,14,0.55)'; g.fill(forma([soma(c, -4, -14), soma(c, 16, -10), soma(c, 16, 14), soma(c, -4, 16)]));
      g.fillStyle = faixa; g.fill(forma([soma(c, 1, 4), soma(c, 15, 3), soma(c, 14, 10), soma(c, 1, 11)], false));
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(c[0] + 1, c[1] + 8, 14, 2);
      g.fillStyle = manto; g.fill(forma([soma(c, -18, 22), soma(c, -21, -6), soma(c, -10, -25), soma(c, 8, -25), soma(c, 19, -12), soma(c, 13, -15), soma(c, 2, -14), soma(c, -3, 2), soma(c, 0, 20)]));
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill(forma([soma(c, 13, -15), soma(c, 19, -12), soma(c, 17, -9), soma(c, 10, -12)], false));
      const cF = ik(s.ombroF, maoF, 27, 25, canal ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 8.5, 9.5, 11.5, manto);
      if (canal) {
        const m = lerp2(maoF, maoB, 0.5);
        brilho(g, m[0] + 4, m[1] - 10, 40, faixa, 0.6); brilho(g, m[0] + 4, m[1] - 10, 10, '#E6E1FF', 0.9);
      }
      mao(g, maoF, pele, 5.2);
    } },
    // Verme de Trilho: máquina segmentada de manutenção do metrô; farol aceso ao investir
    verme: { altura: 44, largura: 720, sombra: [58, 9], desenhar(g, s, pose) {
      const corpo = '#3a3e48', placa = '#4a4f5b', esc = '#202329', lav = '#AFA3F5';
      const farol = pose === 'investe', mov = pose === 'anda' || pose === 'corre' || farol;
      const segs = [-196, -86, 24];
      const dyDe = i => (mov ? Math.sin(s.phi + i * 1.4) * 3.5 : pose === 'recua' ? i * -2 : 0);
      // engates sanfonados
      for (let i = 0; i < 3; i++) {
        const x0 = segs[i] + 40, x1 = (i < 2 ? segs[i + 1] : 120) - 40, y = (dyDe(i) + dyDe(i + 1)) / 2;
        g.fillStyle = esc; g.fillRect(x0 - 4, -96 + y, x1 - x0 + 8, 56);
        g.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = x0; x < x1; x += 7) g.fillRect(x, -96 + y, 2.5, 56);
      }
      const rodas = (x, dy) => { for (const dx of [-26, 26]) { disco(g, x + dx, -15, 15, '#16181c'); disco(g, x + dx, -15, 6, '#4a4e57'); } };
      segs.forEach((x, i) => {
        const dy = dyDe(i), k = [0.74, 0.86, 0.96][i], w = 104 * k, h = 112 * k, y0 = -24 - h + dy;
        rodas(x, dy);
        g.fillStyle = corpo; g.fill(caixa(x - w / 2, y0, w, h, 30 * k));
        g.fillStyle = placa; g.fill(caixa(x - w / 2 + 10, y0 + 6, w - 20, 22 * k, 10 * k));
        g.fillStyle = 'rgba(0,0,0,0.45)'; for (let j = -1; j <= 1; j++) g.fillRect(x + j * 22 * k - 6, y0 + h * 0.45, 12, h * 0.25);
        g.fillStyle = esc; g.fillRect(x - w / 2 + 6, -40 + dy, w - 12, 12);
        g.fillStyle = 'rgba(237,244,240,0.22)'; for (const bx of [-0.38, 0.34]) g.fillRect(x + bx * w, y0 + h * 0.38, 3, 3);
      });
      // cabeça: carcaça inclinada, escovas embaixo e farol
      const dy = dyDe(3), hx = 120;
      rodas(hx + 40, dy);
      g.save(); g.translate(0, dy);
      g.fillStyle = corpo; g.fill(forma([[hx - 46, -24], [hx - 48, -140], [hx + 30, -150], [hx + 84, -132], [hx + 116, -84], [hx + 118, -36], [hx + 104, -24]], false));
      g.fillStyle = placa; g.fill(forma([[hx - 38, -132], [hx + 28, -142], [hx + 70, -128], [hx - 38, -110]], false));
      g.fillStyle = esc; g.fill(forma([[hx + 30, -112], [hx + 76, -114], [hx + 96, -90], [hx + 38, -86]], false));
      g.fillStyle = 'rgba(0,0,0,0.4)'; for (let k = 0; k < 4; k++) g.fillRect(hx - 30 + k * 16, -96, 9, 40);
      // escovas giratórias
      const gira = (pose === 'golpe' || mov) ? s.phi * 2 : 0;
      engrenagem(g, hx + 110, -30, 20, 8, gira, '#565a63', esc);
      // farol
      const fx = hx + 104, fy = -100;
      if (farol) {
        emite(g, g => {
          const fg = g.createLinearGradient(fx, 0, fx + 120, 0);
          fg.addColorStop(0, G.rgba(lav, 0.45)); fg.addColorStop(1, G.rgba(lav, 0));
          g.fillStyle = fg; g.fill(forma([[fx, fy - 10], [fx + 120, fy - 40], [fx + 120, fy + 46], [fx, fy + 10]], false));
        });
        brilho(g, fx, fy, 36, lav, 0.7);
      }
      g.fillStyle = esc; g.fill(caixa(fx - 14, fy - 16, 22, 32, 6));
      disco(g, fx, fy, 11, farol ? '#ECE8FF' : '#4c4762');
      if (!farol) disco(g, fx + 2, fy - 3, 3, 'rgba(175,163,245,0.55)');
      g.restore();
    } },

    // ── Torres ──
    // Guarda Límpida: armadura branca limpa, capacete fechado de visor azul, fuzil compacto
    guarda: { altura: 74, desenhar(g, s, pose) {
      const traje = '#2a2e38', br = '#cdd3dc', brEsc = '#a0a8b5', visor = '#6F97D8', arma = '#2b2f39';
      const t = s.fase, mirando = pose === 'atira' || pose === 'parado';
      const m = mirando ? s.mira : pose === 'golpe' ? (t < 0.5 ? -0.9 : 0.15) : 0.85;
      const pivo = soma(s.ombroF, pose === 'golpe' && t >= 0.5 ? 12 : -2, 8), dir = [Math.cos(m), Math.sin(m)];
      const maoB = soma(pivo, dir[0] * 34, dir[1] * 34), maoF = soma(pivo, dir[0] * 10, dir[1] * 10 + 6);
      const placas = (q, j, tt, c) => {
        barra(g, lerp2(q, j, 0.12), lerp2(q, j, 0.72), 9.5, c);
        g.fillStyle = c; g.fill(capsula(...lerp2(j, tt, 0.12), 8, ...lerp2(j, tt, 0.72), 6.5));
        disco(g, j[0] + 3, j[1], 7.5, G.mistura(c, '#000000', 0.2));
        bota(g, tt, c, '#2a2e36', 1.05);
      };
      membro(g, s.qB, s.jB, s.tB, 9.5, 7.5, 6, traje); placas(s.qB, s.jB, s.tB, brEsc);
      const cB = ik(s.ombroB, maoB, 27, 25, 1);
      membro(g, s.ombroB, cB, maoB, 7, 6, 5, traje); barra(g, lerp2(cB, maoB, 0.15), lerp2(cB, maoB, 0.7), 6, brEsc); mao(g, maoB, '#20232b');
      membro(g, s.qF, s.jF, s.tF, 9.5, 7.5, 6, traje);
      casaco(g, s, traje, 0.1, 1.05);
      placas(s.qF, s.jF, s.tF, br);
      // peitoral e placas do abdome
      g.fillStyle = br; g.fill(forma([soma(s.ombroB, -8, -2), soma(s.ombroF, 8, -6), soma(s.ombroF, 15, 10), soma(s.ombroF, 11, 32), soma(s.ombroB, -6, 34)]));
      g.fillStyle = brEsc; for (let k = 0; k < 2; k++) g.fill(caixa(s.ombroB[0] - 4, s.ombroB[1] + 38 + k * 9, s.ombroF[0] - s.ombroB[0] + 14, 7, 3));
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(s.ombroB[0] - 6, s.ombroB[1] + 30, s.ombroF[0] - s.ombroB[0] + 18, 2);
      g.fillStyle = br; g.fill(forma([soma(s.qF, -6, -8), soma(s.qF, 14, -10), soma(s.qF, 14, 10), soma(s.qF, -2, 12)]));
      // capacete fechado
      const c = s.cab;
      barra(g, soma(c, -3, 12), soma(c, -4, 22), 7, traje);
      g.fillStyle = br; g.fill(forma([soma(c, -15, -2), soma(c, -12, -17), soma(c, 0, -22), soma(c, 12, -18), soma(c, 17, -6), soma(c, 17, 8), soma(c, 10, 15), soma(c, -3, 16), soma(c, -13, 10)]));
      g.fillStyle = '#171b25'; g.fill(forma([soma(c, 2, -8), soma(c, 18, -8), soma(c, 18, 2), soma(c, 3, 2)], false));
      g.fillStyle = visor; g.fillRect(c[0] + 5, c[1] - 4.5, 13, 2.6);
      disco(g, c[0] - 3, c[1] + 1, 5, brEsc);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(c[0] + 6, c[1] + 6, 10, 2);
      // fuzil compacto
      g.save(); g.translate(pivo[0], pivo[1]); g.rotate(m);
      g.fillStyle = arma; g.fill(caixa(-16, -6, 50, 11, 3)); g.fillRect(34, -3, 16, 5); g.fillRect(10, 4, 8, 12);
      g.fillStyle = '#20232b'; g.fillRect(4, -12, 16, 6);
      g.fillStyle = brEsc; g.fillRect(-16, -6, 12, 11);
      g.fillStyle = 'rgba(237,244,240,0.25)'; g.fillRect(-2, -6, 34, 1.5);
      g.restore();
      const cF = ik(s.ombroF, maoF, 27, 25, 1);
      membro(g, s.ombroF, cF, maoF, 7.5, 6.5, 5.5, traje);
      barra(g, lerp2(cF, maoF, 0.1), lerp2(cF, maoF, 0.7), 6.5, '#b6bec9');
      const ombreira = forma([soma(s.ombroF, -9, -8), soma(s.ombroF, 8, -11), soma(s.ombroF, 15, 4), soma(s.ombroF, 8, 17), soma(s.ombroF, -7, 12)]);
      g.strokeStyle = '#2a2e38'; g.lineWidth = 3; g.stroke(ombreira); g.fillStyle = '#c3cad4'; g.fill(ombreira);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(s.ombroF[0] - 6, s.ombroF[1] + 4, 18, 2);
      mao(g, maoF, '#20232b');
    } },
    // Drone Auréola: suporte flutuando a ~70, anel azul em volta
    aureola: { altura: 90, sombra: [12, 4], desenhar(g, s, pose) {
      const br = '#cfd5de', brEsc = '#98a1ae', anel = '#6F97D8', esc = '#1e2430';
      const mov = pose === 'anda' || pose === 'corre', ativo = pose === 'atira';
      const by = -150 + (mov ? Math.sin(s.phi) * 5 : 0) + (pose === 'investe' ? 10 : pose === 'recua' ? -6 : 0);
      const tilt = pose === 'investe' ? 0.3 : pose === 'recua' ? -0.3 : mov ? 0.12 : pose === 'golpe' ? 0.2 * Math.sin(s.phi) : 0;
      const rx = ativo ? 62 : 50, ry = ativo ? 17 : 13;
      g.save(); g.translate(0, by); g.rotate(tilt);
      // jatos embaixo
      brilho(g, 0, 36, 16, anel, ativo ? 0.5 : 0.3);
      g.fillStyle = brEsc; g.fill(forma([[-9, 20], [9, 20], [5, 32], [-5, 32]], false)); disco(g, 0, 32, 4, '#8fb0e4');
      // anel de trás
      g.strokeStyle = anel; g.lineWidth = 6;
      g.beginPath(); g.ellipse(0, 4, rx, ry, 0, Math.PI, Math.PI * 2); g.stroke();
      barra(g, [-24, 4], [-rx + 3, 4], 2.4, brEsc); barra(g, [24, 4], [rx - 3, 4], 2.4, brEsc);
      // corpo: esfera branca, faixa escura, lente
      disco(g, 0, 0, 26, br);
      g.fillStyle = brEsc; g.beginPath(); g.arc(0, 0, 26, 0.15, Math.PI - 0.15); g.fill();
      g.fillStyle = esc; g.fillRect(-26, -2, 52, 6);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-8, -14, 9, 5, -0.4, 0, Math.PI * 2); g.fill();
      disco(g, 17, -6, 8, esc); disco(g, 18, -6, 4, '#DCE8F8');
      barra(g, [-6, -24], [-12, -42], 1.6, brEsc); disco(g, -12, -43, 3, brEsc);
      // anel da frente
      g.strokeStyle = anel; g.lineWidth = 6;
      g.beginPath(); g.ellipse(0, 4, rx, ry, 0, 0, Math.PI); g.stroke();
      g.strokeStyle = 'rgba(232,240,252,0.55)'; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(0, 3, rx, ry, 0, 0.3, Math.PI - 0.3); g.stroke();
      if (ativo) { brilho(g, -rx * 0.7, 8, 22, anel, 0.5); brilho(g, rx * 0.7, 8, 22, anel, 0.5); brilho(g, 0, 4, 70, anel, 0.25); }
      g.restore();
    } },
    // Afinado: civil de escritório cedido ao CORAL; postura rígida, anel de luz nos olhos
    afinado: { altura: 72, desenhar(g, s0, pose) {
      const k = s0.inclina * 0.85;
      const s = { ...s0, ombroF: soma(s0.ombroF, -k, -2), ombroB: soma(s0.ombroB, -k, -2), cab: soma(s0.cab, -k * 1.25, -3), peito: soma(s0.peito, -k, 0), inclina: s0.inclina * 0.15 };
      const pele = '#9a7a66', calca = '#25272e', cam = '#868c95', camEsc = '#6a7079', grav = '#2a2e39', luz = '#6F97D8';
      const t = s.fase;
      let maoF = soma(s.ombroF, 3, 51), maoB = soma(s.ombroB, 2, 51);
      if (pose === 'atira') { maoF = soma(s.ombroF, 51, 2); maoB = soma(s.ombroB, 51, -1); }
      else if (pose === 'golpe') { maoF = t < 0.5 ? soma(s.ombroF, 6, -51) : soma(s.ombroF, 44, 26); }
      else if (pose === 'investe') { maoF = soma(s.ombroF, 48, 16); maoB = soma(s.ombroB, 48, 20); }
      else if (pose === 'recua') { maoF = soma(s.ombroF, 22, 46); }
      membro(g, s.qB, s.jB, s.tB, 9, 7, 5.5, calca); bota(g, s.tB, '#111114', '#050506', 0.95);
      membro(g, s.ombroB, ik(s.ombroB, maoB, 27, 25, 1), maoB, 6.5, 5.5, 4.5, camEsc); mao(g, maoB, pele, 5);
      membro(g, s.qF, s.jF, s.tF, 9, 7, 5.5, calca); bota(g, s.tF, '#111114', '#050506', 0.95);
      g.fillStyle = 'rgba(237,244,240,0.2)'; g.fillRect(s.tF[0] + 2, s.tF[1] - 8, 10, 1.6);
      casaco(g, s, cam, 0.03, 0.95);
      g.fillStyle = '#18191d'; g.fillRect(s.qB[0] - 12, s.qF[1] - 8, 34, 5);
      g.fillStyle = grav; g.fill(forma([soma(s.ombroF, 4, -6), soma(s.ombroF, 9, -6), soma(s.ombroF, 12, 30), soma(s.ombroF, 7, 34), soma(s.ombroF, 5, 28)], false));
      g.strokeStyle = '#2b2f3a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(s.ombroF[0] - 4, s.ombroF[1] - 6); g.lineTo(s.ombroF[0] + 2, s.ombroF[1] + 22); g.stroke();
      g.fillStyle = '#d5d9de'; g.fillRect(s.ombroF[0], s.ombroF[1] + 22, 7, 9);
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s.ombroB[0], s.ombroB[1] + 10); g.lineTo(s.qB[0] + 4, s.qB[1] - 12); g.stroke();
      const c = s.cab;
      cabeca(g, c, { pele, cabelo: '#1c1a18' });
      brilho(g, c[0] + 7.5, c[1] - 2, 11, luz, 0.65);
      g.strokeStyle = '#DCE8FF'; g.lineWidth = 2; g.beginPath(); g.arc(c[0] + 7.5, c[1] - 2, 3.6, 0, Math.PI * 2); g.stroke();
      const cF = ik(s.ombroF, maoF, 27, 25, pose === 'golpe' && t < 0.5 ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 7, 6, 5, cam); mao(g, maoF, pele, 5.2);
    } },

    // ── Chefe e especiais ──
    // Calha: líder dos Goteiras; capa de chuva aberta, bandana coral, braço lacrado com corrente
    calha: { altura: 92, largura: 420, desenhar(g, s, pose) {
      const pele = '#7a5844', calca = '#25272d', capa = '#434b5c', capaEsc = '#343b4b', camisa = '#1d1f25';
      const metal = '#666c76', metalEsc = '#474c55', lacre = '#d8dce0', coral = '#B8645D', elo = '#727985';
      const golpe = pose === 'golpe', b = bal(s, pose), t = s.fase;
      const centro = soma(s.cab, -6, -34), th0 = t * Math.PI * 2 + 0.6;
      const maoF = golpe ? soma(centro, Math.cos(th0) * 16, Math.sin(th0) * 6 + 14)
        : pose === 'atira' ? soma(s.ombroF, 50, -4) : pose === 'recua' ? soma(s.ombroF, 24, -18)
        : pose === 'investe' ? soma(s.ombroF, 40, 14) : soma(s.ombroF, 16 - 14 * b, 46);
      const maoB = soma(s.ombroB, 6 + 14 * b, 46);
      // corrente girando acima da cabeça: elos do arco de trás antes do corpo, os da frente depois
      let frente = [], tras = [];
      if (golpe) {
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const u = i / 40, th = th0 - u * 2.3, rx = 18 + 104 * Math.sqrt(u), ry = 6 + 26 * Math.sqrt(u);
          pts.push([centro[0] + Math.cos(th) * rx, centro[1] + Math.sin(th) * ry + 14 * (1 - u), Math.sin(th)]);
        }
        let atual = null, ladoAnt = null;
        for (const p of pts) { const lado = p[2] < 0 ? tras : frente; if (lado !== ladoAnt) { if (atual) atual.push(p); atual = []; lado.push(atual); ladoAnt = lado; } atual.push(p); }
        emite(g, g => {
          g.strokeStyle = 'rgba(214,222,232,0.13)'; g.lineWidth = 7;
          g.beginPath(); g.ellipse(centro[0], centro[1] + 2, 122, 32, 0, th0 - 2.3, th0 - 4.4, true); g.stroke();
          g.lineWidth = 3; g.beginPath(); g.ellipse(centro[0], centro[1] + 2, 100, 27, 0, th0 - 2.1, th0 - 3.6, true); g.stroke();
        });
        tras.forEach(seg => corrente(g, seg, G.mistura(elo, '#000000', 0.25)));
      }
      membro(g, s.qB, s.jB, s.tB, 11, 9, 7, calca); bota(g, s.tB, '#16130f', '#070605', 1.1);
      const cB = ik(s.ombroB, maoB, 27, 25, 1);
      membro(g, s.ombroB, cB, maoB, 8.5, 7.5, 6, capaEsc); mao(g, maoB, '#1d1916', 6.5);
      membro(g, s.qF, s.jF, s.tF, 11, 9, 7, calca); bota(g, s.tF, '#16130f', '#070605', 1.1);
      casaco(g, s, capa, 0.95, 1.3);
      // capa aberta: camisa escura aparecendo na frente, aba solta com brilho de plástico
      g.fillStyle = camisa; g.fill(forma([soma(s.ombroF, -4, -4), soma(s.ombroF, 8, -6), soma(s.qF, 12, -4), soma(s.qF, 0, 2)], false));
      g.fillStyle = '#17181c'; g.fillRect(s.qF[0] - 4, s.qF[1] - 8, 16, 6);
      g.fillStyle = capaEsc; g.fill(forma([soma(s.ombroF, 6, -4), soma(s.ombroF, 14, 4), soma(lerp2(s.qF, s.jF, 0.9), 16, 2), soma(lerp2(s.qF, s.jF, 0.9), 6, 6), soma(s.qF, 4, -10)]));
      g.strokeStyle = 'rgba(230,238,255,0.28)'; g.lineWidth = 2.5;
      for (const [a, d] of [[-6, 16], [-14, 38], [4, 52]]) { g.beginPath(); g.moveTo(s.ombroF[0] + a - 4, s.ombroF[1] + d); g.lineTo(s.ombroF[0] + a, s.ombroF[1] + d + 28); g.stroke(); }
      dobras(g, s, 3, 0.25);
      // capuz caído atrás do pescoço
      const c = s.cab;
      g.fillStyle = capaEsc; g.fill(forma([soma(c, -22, 12), soma(c, -16, 4), soma(c, -2, 12), soma(c, 2, 24), soma(c, -18, 28)]));
      cabeca(g, c, { pele, cabelo: '#131315' });
      g.fillStyle = coral; g.fill(forma([soma(c, 1, 4), soma(c, 15, 3), soma(c, 13, 13), soma(c, 1, 14)]));
      g.fill(forma([soma(c, -8, 8), soma(c, 2, 6), soma(c, -6, 18), soma(c, -14, 16)]));
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(c[0] + 2, c[1] + 10, 12, 2);
      // braço de metal lacrado
      const cF = ik(s.ombroF, maoF, 28, 26, golpe || pose === 'recua' ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 9, 8, 7, metal);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      for (const [a, z] of [[s.ombroF, cF], [cF, maoF]]) for (const u of [0.35, 0.65]) {
        const p = lerp2(a, z, u), ang = Math.atan2(z[1] - a[1], z[0] - a[0]) + Math.PI / 2;
        g.beginPath(); g.moveTo(p[0] - Math.cos(ang) * 7, p[1] - Math.sin(ang) * 7); g.lineTo(p[0] + Math.cos(ang) * 7, p[1] + Math.sin(ang) * 7); g.stroke();
      }
      disco(g, cF[0], cF[1], 7.5, metalEsc); disco(g, cF[0], cF[1], 3, '#2b2e34');
      { const p = lerp2(cF, maoF, 0.5), ang = Math.atan2(maoF[1] - cF[1], maoF[0] - cF[0]);
        g.save(); g.translate(p[0], p[1]); g.rotate(ang);
        g.fillStyle = lacre; g.fill(caixa(-8, -7, 16, 14, 2));
        g.fillStyle = 'rgba(30,34,42,0.55)'; g.fillRect(-5, -3, 10, 1.6); g.fillRect(-5, 1, 7, 1.6);
        g.restore(); }
      // corrente: girando, lançada pra frente ou pendurada
      if (golpe) frente.forEach(seg => corrente(g, seg, elo));
      else {
        const pts = pose === 'atira' ? curva(maoF, soma(maoF, 60, 14), soma(maoF, 116, 4))
          : pose === 'investe' ? curva(maoF, soma(maoF, -20, 50), [maoF[0] - 60, -2])
          : curva(maoF, [maoF[0] + 6, -6], [maoF[0] + 40, -2]);
        if (pose !== 'atira' && pose !== 'investe') pts.push([maoF[0] + 56, 0]);
        corrente(g, pts, elo);
        const fim = pts[pts.length - 1];
        g.fillStyle = '#5a5f68'; g.fill(caixa(fim[0] - 6, fim[1] - 8, 12, 10, 2));
        g.strokeStyle = '#5a5f68'; g.lineWidth = 2.4; g.beginPath(); g.arc(fim[0], fim[1] - 8, 4, Math.PI, 0); g.stroke();
      }
      mao(g, maoF, '#555b64', 7);
    } },
    // Cobrador da Fiança Áurea: terno escuro, gravata âmbar, pistola
    cobrador: { altura: 72, desenhar(g, s, pose) {
      const pele = '#94725d', calca = '#22242c', terno = '#25272f', ternoEsc = '#1c1e25', cam = '#bdb7ab', grav = '#E9B77C';
      const b = bal(s, pose), t = s.fase, mirando = pose === 'atira';
      const pivo = soma(s.ombroF, 0, 6), m = s.mira, dir = [Math.cos(m), Math.sin(m)];
      let maoF, angA;
      if (mirando) { maoF = soma(pivo, dir[0] * 46, dir[1] * 46); angA = m; }
      else if (pose === 'golpe') { maoF = t < 0.5 ? soma(s.ombroF, -2, -40) : soma(s.ombroF, 44, 16); angA = t < 0.5 ? -2.2 : 0.9; }
      else if (pose === 'recua') { maoF = soma(s.ombroF, 22, -14); angA = -1.3; }
      else if (pose === 'investe') { maoF = soma(s.ombroF, 40, 14); angA = 0.3; }
      else { maoF = soma(s.ombroF, 10 - 12 * b, 46); angA = 1.35; }
      const maoB = mirando ? soma(maoF, -8, 5) : soma(s.ombroB, 4 + 12 * b, 46);
      membro(g, s.qB, s.jB, s.tB, 9, 7, 5.5, calca); bota(g, s.tB, '#0f0f12', '#050506', 0.95);
      const cB = ik(s.ombroB, maoB, 27, 25, 1);
      membro(g, s.ombroB, cB, maoB, 7, 6, 5, ternoEsc); mao(g, maoB, pele, 5);
      membro(g, s.qF, s.jF, s.tF, 9, 7, 5.5, calca); bota(g, s.tF, '#0f0f12', '#050506', 0.95);
      g.fillStyle = 'rgba(237,244,240,0.22)'; g.fillRect(s.tF[0] + 2, s.tF[1] - 8, 10, 1.6);
      casaco(g, s, terno, 0.34, 1.05);
      // camisa em V, gravata âmbar, lapela
      g.fillStyle = cam; g.fill(forma([soma(s.ombroF, 0, -9), soma(s.ombroF, 12, -8), soma(s.ombroF, 11, 24), soma(s.ombroF, 6, 24)], false));
      g.fillStyle = ternoEsc; g.fill(forma([soma(s.ombroF, -2, -10), soma(s.ombroF, 3, -9), soma(s.ombroF, 8, 26), soma(s.ombroF, 3, 28)], false));
      g.fillStyle = grav; g.fill(forma([soma(s.ombroF, 7, -8), soma(s.ombroF, 11, -8), soma(s.ombroF, 12, 19), soma(s.ombroF, 9.5, 23), soma(s.ombroF, 8, 19)], false));
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(s.ombroF[0] + 7, s.ombroF[1] - 4, 4, 1.6);
      dobras(g, s, 2, 0.22);
      cabeca(g, s.cab, { pele, cabelo: '#121216' });
      g.fillStyle = 'rgba(237,244,240,0.18)'; g.fillRect(s.cab[0] - 8, s.cab[1] - 14, 12, 1.5);
      const cF = ik(s.ombroF, maoF, 27, 25, pose === 'golpe' && t < 0.5 ? -1 : 1);
      membro(g, s.ombroF, cF, maoF, 7.5, 6.5, 5.5, terno);
      pistola(g, maoF, angA);
      mao(g, maoF, pele, 5.2);
    } },
    // ── vendedores: gente parada atrás do balcão, um detalhe de cor cada ──
    nicanor: vendedor({ pele: '#9a7258', roupa: '#3b4040', calca: '#26282e', comp: 0.12, cabelo: '#2a2a2a', extra(g, s) {
      g.fillStyle = '#4d6650'; g.fill(forma([soma(s.ombroF, -14, 4), soma(s.ombroF, 12, 4), soma(s.qF, 12, 36), soma(s.qB, -10, 36)], false));   // avental da feira
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) g.fillRect(s.ombroF[0] - 10 + i * 6, s.ombroF[1] + 8, 2, 70);
      g.fillStyle = '#2b2f36'; g.fill(forma([soma(s.cab, -13, -12), soma(s.cab, 10, -15), soma(s.cab, 24, -9), soma(s.cab, -13, -4)]));   // boné
      g.fillStyle = '#d8d4cc'; g.fillRect(s.cab[0] + 3, s.cab[1] + 4, 10, 3);   // bigode grisalho
    } }),
    zila: vendedor({ pele: '#a07a62', roupa: '#3a3342', calca: '#2a2530', comp: 0.95, largura: 1.15, extra(g, s) {
      g.fillStyle = '#5a4f7a'; g.fill(forma([soma(s.ombroB, -14, -4), soma(s.ombroF, 16, -6), soma(s.ombroF, 12, 30), soma(s.ombroB, -12, 36)]));   // xale
      g.fillStyle = '#c9c4ba'; g.fill(forma([soma(s.cab, -13, -2), soma(s.cab, -12, -15), soma(s.cab, 0, -20), soma(s.cab, 12, -15), soma(s.cab, 12, -8), soma(s.cab, -2, -10)]));
      g.beginPath(); g.arc(s.cab[0] - 12, s.cab[1] - 12, 6, 0, Math.PI * 2); g.fill();   // coque
      g.strokeStyle = '#d8d0b8'; g.lineWidth = 1.5; g.strokeRect(s.cab[0] + 3, s.cab[1] - 5, 8, 5);   // óculos
      g.strokeStyle = '#E9B77C'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.ombroF[0] - 6, s.ombroF[1] - 4); g.lineTo(s.ombroF[0] - 2, s.ombroF[1] + 40); g.stroke();   // fita métrica
    } }),
    iara: vendedor({ pele: '#7e5c48', roupa: '#24343c', calca: '#1f262c', comp: 0.6, cabelo: '#141519', extra(g, s) {
      g.fillStyle = '#5f9a96'; g.fill(forma([soma(s.cab, -12, 12), soma(s.cab, 6, 10), soma(s.cab, 8, 20), soma(s.cab, -12, 22)]));   // lenço
      g.fillStyle = '#1b252b'; g.fill(forma([soma(s.cab, -14, -10), soma(s.cab, 12, -14), soma(s.cab, 22, -8), soma(s.cab, -14, -4)]));   // quepe
      g.fillStyle = '#c9a86a'; g.fillRect(s.cab[0] - 2, s.cab[1] - 12, 6, 3);
      g.fillStyle = '#c9a86a'; for (let i = 0; i < 3; i++) g.fillRect(s.ombroF[0] + 6, s.ombroF[1] + 6 + i * 12, 3, 3);   // botões
    } }),
    bigorna: vendedor({ pele: '#6f5243', roupa: '#33302c', calca: '#25241f', comp: 0.1, largura: 1.3, braco: 9, cabelo: '#1a1a1a', extra(g, s) {
      g.fillStyle = '#5a4130'; g.fill(forma([soma(s.ombroF, -16, 2), soma(s.ombroF, 14, 2), soma(s.qF, 14, 40), soma(s.qB, -14, 40)], false));   // avental de couro
      g.fillStyle = '#2b2f36'; g.fill(forma([soma(s.cab, -14, -14), soma(s.cab, 14, -18), soma(s.cab, 16, -8), soma(s.cab, -12, -6)]));   // máscara de solda erguida
      g.fillStyle = '#A8DBA0'; g.fillRect(s.cab[0] - 2, s.cab[1] - 14, 10, 3);
    } }),
    tacita: vendedor({ pele: '#8a6a58', roupa: '#2c2640', calca: '#221d31', comp: 1, largura: 1.2, extra(g, s) {
      const c = s.cab;
      g.fillStyle = '#2c2640'; g.fill(forma([soma(c, -18, 22), soma(c, -20, -6), soma(c, -6, -22), soma(c, 12, -20), soma(c, 19, -6), soma(c, 10, -10), soma(c, -2, -4), soma(c, -4, 20)]));
      g.fillStyle = 'rgba(4,6,12,0.75)'; g.fill(forma([soma(c, -2, -8), soma(c, 12, -10), soma(c, 14, 6), soma(c, 2, 8)]));   // rosto na sombra do capuz
      g.fillStyle = '#AFA3F5'; g.fillRect(c[0] + 6, c[1] - 2, 4, 1.6);
    } }),
    concierge: vendedor({ pele: '#b08a72', roupa: '#dfe5ec', calca: '#c5cdd8', comp: 0.32, cabelo: '#2a2420', extra(g, s) {
      g.fillStyle = '#9aa6b6'; g.fill(forma([soma(s.ombroF, -2, -10), soma(s.ombroF, 3, -9), soma(s.ombroF, 8, 26), soma(s.ombroF, 3, 28)], false));   // lapela
      g.fillStyle = '#6F97D8'; g.fillRect(s.ombroF[0] - 6, s.ombroF[1] + 12, 8, 10);   // crachá da Vítrea
    } }),
    // Eco: cópia hostil do Faro, a sombra do jogador (lavanda escura, semitransparente)
    eco: { altura: 76, tinta: ['#3a3360', 0.78], alfa: 0.74, recorte: '#AFA3F5',
      desenhar(g, s, pose) { TIPOS.faro.desenhar(g, s, pose); },
      sobre(g, s, pose) {
        if (pose === 'rola') return;
        const c = s.cab; brilho(g, c[0] + 7.5, c[1] - 2, 9, '#AFA3F5', 0.7); g.fillStyle = '#E6E1FF'; g.fillRect(c[0] + 5, c[1] - 3, 5, 2);
      } },
  };

  // interferência: uma ou duas faixas da silhueta deslocadas de lado, com fantasma lavanda
  function interferencia(og, out, S, ox, oy, pose, fase) {
    let h0 = 0; for (const ch of pose) h0 = h0 * 31 + ch.charCodeAt(0);
    const r = G.rng(G.hash(h0, Math.round(fase * 16), 77));
    const n = 1 + (r() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const y = Math.round(oy - (60 + r() * 120) * S), h = Math.max(2, Math.round((6 + r() * 12) * S));
      const dx = Math.round((r() < 0.5 ? -1 : 1) * (7 + r() * 12) * S);
      const faixa = document.createElement('canvas'); faixa.width = out.width; faixa.height = h;
      const fg = faixa.getContext('2d'); fg.drawImage(out, 0, y, out.width, h, 0, 0, out.width, h);
      const fant = document.createElement('canvas'); fant.width = out.width; fant.height = h;
      const fa = fant.getContext('2d'); fa.drawImage(faixa, 0, 0); fa.globalCompositeOperation = 'source-in'; fa.fillStyle = 'rgba(175,163,245,0.6)'; fa.fillRect(0, 0, out.width, h);
      og.clearRect(0, y, out.width, h);
      og.drawImage(fant, dx + Math.sign(dx) * Math.max(2, 3 * S), y);
      og.drawImage(faixa, dx, y);
    }
  }

  // gente comum parada, de mãos à frente: base dos vendedores
  function vendedor(o) {
    return { altura: 72, desenhar(g, s) {
      const maoF = soma(s.ombroF, 18, 30), maoB = soma(s.ombroB, 22, 32), br = o.braco || 7;
      membro(g, s.qB, s.jB, s.tB, 9.5, 7.5, 6, o.calca); bota(g, s.tB, '#15130f', '#080706');
      membro(g, s.ombroB, ik(s.ombroB, maoB, 27, 25, 1), maoB, br, br - 1, br - 2, G.mistura(o.roupa, '#000000', 0.25)); mao(g, maoB, o.pele, 5.5);
      membro(g, s.qF, s.jF, s.tF, 9.5, 7.5, 6, o.calca); bota(g, s.tF, '#15130f', '#080706');
      casaco(g, s, o.roupa, o.comp, o.largura || 1);
      dobras(g, s, 2, 0.2);
      cabeca(g, s.cab, { pele: o.pele, cabelo: o.cabelo });
      o.extra(g, s);
      membro(g, s.ombroF, ik(s.ombroF, maoF, 27, 25, 1), maoF, br + 0.5, br - 0.5, br - 1.5, o.roupa); mao(g, maoF, o.pele, 5.5);
    } };
  }

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
  // Campos opcionais do tipo: largura (canvas mais largo, em unidades locais), tinta [cor, força]
  // por cima do desenho + sobre() desenhado depois dela, recorte (cor da luz de recorte),
  // alfa (sprite inteiro semitransparente), depois() (pós-processo no sprite pronto) e
  // sombra (raio ou [rx, ry] da sombra no chão, em unidades de mundo).
  function gerarSprite(tipo, pose, fase, olha, mira, escala) {
    const T = TIPOS[tipo], S = escala * T.altura / ALTURA;
    const LADO = 300, c = document.createElement('canvas');
    c.height = Math.max(8, Math.ceil(LADO * S)); c.width = Math.max(8, Math.ceil((T.largura || LADO) * S));
    const g = c.getContext('2d'), ox = c.width / 2, oy = c.height - 16 * S;
    const s = esqueleto(pose, fase, mira), luz = luzes = [];
    try {
      g.save(); g.translate(ox, oy); g.scale(S * olha, S); g.lineJoin = 'round'; g.lineCap = 'round';
      T.desenhar(g, s, pose); g.restore();
      if (T.tinta) {
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = T.tinta[1]; g.fillStyle = T.tinta[0];
        g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      if (T.sobre) { g.save(); g.translate(ox, oy); g.scale(S * olha, S); T.sobre(g, s, pose); g.restore(); }
    } finally { luzes = null; }
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
    rg.drawImage(c, 0, 0); rg.globalCompositeOperation = 'source-in'; rg.fillStyle = G.rgba(T.recorte || RECORTE, 0.8); rg.fillRect(0, 0, c.width, c.height);
    rg.globalCompositeOperation = 'destination-out'; rg.drawImage(c, -lx * px, -ly * px);
    g.globalCompositeOperation = 'lighter'; g.drawImage(rim, 0, 0);
    const borda = Math.max(1, 2.2 * S / 0.45);
    const out = document.createElement('canvas'); out.width = c.width + 6; out.height = c.height + 6;
    const og = out.getContext('2d');
    rg.globalCompositeOperation = 'copy'; rg.drawImage(c, 0, 0);
    rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#04060c'; rg.fillRect(0, 0, c.width, c.height);
    for (let a = 0; a < 8; a++) og.drawImage(rim, 3 + Math.cos(a * Math.PI / 4) * borda, 3 + Math.sin(a * Math.PI / 4) * borda);
    og.drawImage(c, 3, 3);
    if (luz.length) {
      og.globalCompositeOperation = 'lighter';
      for (const l of luz) { og.setTransform(1, 0, 0, 1, 3, 3); og.transform(l.m.a, l.m.b, l.m.c, l.m.d, l.m.e, l.m.f); l.fn(og); }
      og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'source-over';
    }
    if (T.depois) T.depois(og, out, S, ox + 3, oy + 3, pose, fase);
    if (T.alfa) { og.globalCompositeOperation = 'destination-in'; og.fillStyle = `rgba(0,0,0,${T.alfa})`; og.fillRect(0, 0, out.width, out.height); }
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
    const T = TIPOS[tipo], so = T.sombra ?? T.altura * 0.42;
    const rx = Array.isArray(so) ? so[0] : so, ry = Array.isArray(so) ? so[1] : so * 0.3;
    ctx.fillStyle = 'rgba(3,6,14,0.5)';
    ctx.beginPath(); ctx.ellipse(x - 4, y + 1, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
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

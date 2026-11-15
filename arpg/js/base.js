'use strict';
// Base do protótipo: utilidades, sorteio determinístico e tabelas de dados.
// Nada aqui toca no DOM, então o teste carrega este arquivo direto no Node.
(() => {
  const G = window.G = {};

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  G.rand = (a, b) => a + Math.random() * (b - a);

  // hash inteiro de (x, y, semente): a mesma quadra sempre nasce igual
  G.hash = (x, y, s = 0) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  // mulberry32: gerador pequeno e rápido, com semente
  G.rng = seed => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.pick = (r, arr) => arr[(r() * arr.length) | 0];

  G.SEMENTE = 7331;
  G.CHUNK = 640;     // uma quadra da cidade, em unidades de mundo
  G.LIMITE = 18;     // a cidade vai de -LIMITE a +LIMITE quadras em cada eixo
  G.K = 0.6;         // inclinação da câmera: altura vira deslocamento pra cima na tela

  // ── Bairros ─────────────────────────────────────────
  // centro em quadras; peso maior = bairro maior. Cores pensadas pra cada um
  // ser reconhecível só pela paleta.
  G.BAIRROS = {
    mercado: {
      nome: 'Mercado Baixo', nivel: [1, 5], centro: [0, 0], peso: 1.15,
      rua: '#0e0c17', calcada: '#1a1628', chao: '#141120', borda: '#3a2a55',
      frente: ['#1f1a33', '#261e3c', '#1c2034'], teto: ['#16132a', '#1b1730', '#141a2a'],
      neon: ['#ff2e88', '#00f0ff', '#ffd23f', '#b84dff'], janela: ['#ffd23f', '#ff7ab8', '#7af7ff'],
      nevoa: 'rgba(255,46,136,0.05)', chuva: 1, alt: [70, 170], dens: 0.72, prop: 'barraca',
      inimigos: { punk: 5, atirador: 3, drone: 2 },
    },
    docas: {
      nome: 'Docas', nivel: [5, 10], centro: [12, 2], peso: 1,
      rua: '#110e0a', calcada: '#1d1812', chao: '#17130e', borda: '#5a3a18',
      frente: ['#2a2016', '#30241a', '#241d17'], teto: ['#1e1811', '#231b13', '#1a150f'],
      neon: ['#ff8a00', '#ffd23f', '#00f0ff'], janela: ['#ffb347', '#ffd23f'],
      nevoa: 'rgba(255,130,30,0.07)', chuva: 0.6, alt: [40, 110], dens: 0.5, prop: 'container',
      inimigos: { punk: 3, atirador: 4, drone: 3 },
    },
    ferro: {
      nome: 'Ferro-Velho', nivel: [10, 15], centro: [1, 12], peso: 1,
      rua: '#0b100c', calcada: '#141b15', chao: '#111712', borda: '#2f5a2a',
      frente: ['#1c2419', '#212b1d', '#1a2018'], teto: ['#151c13', '#192116', '#131910'],
      neon: ['#5dff6e', '#c6ff3a', '#ff8a00'], janela: ['#9dff7a', '#e6ff6a'],
      nevoa: 'rgba(90,255,110,0.06)', chuva: 0.5, alt: [30, 90], dens: 0.45, prop: 'sucata',
      inimigos: { punk: 3, atirador: 2, drone: 5 },
    },
    subsolo: {
      nome: 'Subsolo', nivel: [15, 20], centro: [-12, 3], peso: 1,
      rua: '#0a0812', calcada: '#151024', chao: '#100c1c', borda: '#4a2a80',
      frente: ['#1b1430', '#211838', '#18122a'], teto: ['#120e22', '#161128', '#100c1e'],
      neon: ['#b84dff', '#ff2e88', '#5a7bff'], janela: ['#c48bff', '#ff7ab8'],
      nevoa: 'rgba(150,60,255,0.08)', chuva: 0.15, alt: [50, 120], dens: 0.65, prop: 'cano',
      inimigos: { punk: 4, atirador: 4, drone: 2 },
    },
    torres: {
      nome: 'Torres', nivel: [20, 30], centro: [0, -12], peso: 1,
      rua: '#0b0f17', calcada: '#162030', chao: '#121a26', borda: '#5a86b8',
      frente: ['#1a2433', '#1e2a3c', '#18202e'], teto: ['#141c29', '#18202f', '#111824'],
      neon: ['#e8f6ff', '#7ad7ff', '#4d8bff'], janela: ['#e8f6ff', '#9fdcff'],
      nevoa: 'rgba(150,210,255,0.06)', chuva: 0.8, alt: [140, 260], dens: 0.85, prop: 'pilar',
      inimigos: { punk: 2, atirador: 5, drone: 3 },
    },
  };

  // ── Inimigos ────────────────────────────────────────
  // valores de nível 1; o nível escala vida, dano e XP
  G.INIMIGOS = {
    punk:     { nome: 'Navalha',  r: 15, hp: 42, dano: 7, vel: 125, alcance: 30,  cd: 1.0, xp: 12, modo: 'perto' },
    atirador: { nome: 'Atirador', r: 14, hp: 30, dano: 7, vel: 95,  alcance: 300, cd: 1.7, xp: 15, modo: 'longe', proj: 430 },
    drone:    { nome: 'Drone',    r: 11, hp: 18, dano: 5, vel: 195, alcance: 22,  cd: 0.7, xp: 8,  modo: 'perto', voa: true },
  };

  // ── Habilidades (placeholder até o plano de design chegar) ──
  G.HAB = [
    { id: 'tiro',      nome: 'Pistola',   icone: '⦿', cd: 0.24, custo: 0,  teclas: ['Espaço'] },
    { id: 'rajada',    nome: 'Rajada',    icone: '⁂', cd: 4,    custo: 18, teclas: ['1', 'Q'] },
    { id: 'investida', nome: 'Investida', icone: '»', cd: 5,    custo: 12, teclas: ['2', 'E'] },
    { id: 'granada',   nome: 'Granada',   icone: '✹', cd: 8,    custo: 28, teclas: ['3', 'R'] },
  ];

  // ── Loot ────────────────────────────────────────────
  G.RARIDADES = [
    { id: 'comum',    nome: 'Comum',    cor: '#c9c9d9', peso: 70, mult: 1 },
    { id: 'incomum',  nome: 'Incomum',  cor: '#3dff8f', peso: 22, mult: 1.25 },
    { id: 'raro',     nome: 'Raro',     cor: '#2fb8ff', peso: 7,  mult: 1.6 },
    { id: 'lendario', nome: 'Lendário', cor: '#ffb300', peso: 1,  mult: 2.2 },
  ];
  G.NOMES = {
    arma: ['Pistola', 'Revólver', 'Smartgun', 'Agulheira'],
    jaqueta: ['Jaqueta', 'Sobretudo', 'Colete', 'Capa de Chuva'],
  };
  G.SUFIXOS = {
    comum: ['Remendada', 'de Camelô', 'Usada'],
    incomum: ['de Rua', 'Ajustada', 'Reforçada'],
    raro: ['Cromada', 'de Elite', 'Militar'],
    lendario: ['do Abismo', 'Fantasma', 'da Última Chuva'],
  };

  G.xpPara = n => Math.floor(60 * Math.pow(1.3, n - 1) + 40 * n);
  G.NIVEL_MAX = 50;
})();

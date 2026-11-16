'use strict';
// Base: utilidades, sorteio com semente e constantes do mundo.
// Nada aqui toca no DOM, então o teste carrega este arquivo direto no Node.
(() => {
  const G = window.G = window.G || {};

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // menor diferença entre dois ângulos, em -PI..PI
  G.difAng = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

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
  G.rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  G.mistura = (a, b, k) => {
    const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
    const c = s => Math.round(((p >> s) & 255) + (((q >> s) & 255) - ((p >> s) & 255)) * k);
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  };

  G.SEMENTE = 7331;
  G.M = 40;          // 1 metro do dossiê = 40 unidades de mundo
  G.CHUNK = 640;     // uma quadra da cidade (16 m)
  G.LIMITE = 18;     // a cidade vai de -LIMITE a +LIMITE quadras em cada eixo
  G.K = 0.6;         // inclinação da câmera: altura vira deslocamento pra cima na tela

  // Aurora: a paleta do arcade
  G.COR = {
    fundo: '#080D1C', fundo2: '#111D2C', menta: '#9BE7CE', lavanda: '#AFA3F5', ambar: '#E9B77C',
    coral: '#ED887F', texto: '#EDF4F0', suave: '#8E9AAF', verde: '#A8DBA0',
  };
})();

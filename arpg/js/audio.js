'use strict';
// Som 100% sintetizado (osciladores + ruído), igual ao resto do arcade.
(() => {
  const G = window.G;
  let AC = null, saida = null, ruido = null, chuvaG = null;
  let ligado = (() => { try { return localStorage.getItem('arpg-som') !== 'off'; } catch { return true; } })();

  function iniciar() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC = new Ctx();
    saida = AC.createGain(); saida.gain.value = ligado ? 0.5 : 0; saida.connect(AC.destination);
    const len = AC.sampleRate * 2;
    ruido = AC.createBuffer(1, len, AC.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // chuva: ruído em laço, filtrado, volume segue o bairro
    const src = AC.createBufferSource(); src.buffer = ruido; src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.4;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    chuvaG = AC.createGain(); chuvaG.gain.value = 0;
    src.connect(bp); bp.connect(lp); lp.connect(chuvaG); chuvaG.connect(saida); src.start();
  }

  const ok = () => AC && ligado;

  function tom(f0, f1, dur, tipo = 'square', vol = 0.15, t0 = 0) {
    if (!ok()) return;
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + t0;
    o.type = tipo; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(saida); o.start(t); o.stop(t + dur + 0.02);
  }

  function chiado(dur, vol = 0.2, corte = 2000, t0 = 0, tipo = 'lowpass') {
    if (!ok()) return;
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime + t0;
    s.buffer = ruido; f.type = tipo; f.frequency.value = corte;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(saida); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  G.som = {
    iniciar,
    get ligado() { return ligado; },
    alternar() {
      ligado = !ligado;
      try { localStorage.setItem('arpg-som', ligado ? 'on' : 'off'); } catch {}
      if (saida) saida.gain.value = ligado ? 0.5 : 0;
      return ligado;
    },
    suspender(s) { if (AC) s ? AC.suspend() : AC.resume(); },
    chuva(v) { if (chuvaG) chuvaG.gain.setTargetAtTime(v * 0.07, AC.currentTime, 0.8); },
    tiro()      { tom(900, 260, 0.07, 'square', 0.06); chiado(0.05, 0.08, 4000, 0, 'highpass'); },
    rajada()    { chiado(0.22, 0.3, 1800); tom(220, 60, 0.18, 'sawtooth', 0.1); },
    investida() { chiado(0.18, 0.18, 900, 0, 'bandpass'); tom(300, 1200, 0.14, 'sine', 0.08); },
    lancar()    { tom(500, 900, 0.1, 'triangle', 0.08); },
    explosao()  { chiado(0.6, 0.5, 700); tom(120, 30, 0.5, 'sine', 0.3); },
    acerto()    { tom(320 + Math.random() * 80, 120, 0.06, 'square', 0.05); },
    critico()   { tom(1400, 500, 0.08, 'square', 0.06); },
    dor()       { tom(180, 70, 0.16, 'sawtooth', 0.14); },
    inimigoTiro() { tom(600, 200, 0.08, 'sawtooth', 0.04); },
    morteInimigo() { chiado(0.2, 0.15, 1200); tom(400, 80, 0.2, 'triangle', 0.08); },
    moeda()     { tom(1300, 1800, 0.06, 'sine', 0.06); tom(1800, 2400, 0.06, 'sine', 0.05, 0.05); },
    item(rar)   {
      const base = [500, 600, 700, 880][rar] || 500;
      for (let i = 0; i <= rar + 1; i++) tom(base * (1 + i * 0.25), base * (1 + i * 0.25), 0.14, 'triangle', 0.07, i * 0.07);
    },
    nivel()     { [523, 659, 784, 1047].forEach((f, i) => tom(f, f, 0.22, 'triangle', 0.12, i * 0.09)); },
    morte()     { tom(300, 40, 1.2, 'sawtooth', 0.18); chiado(1, 0.2, 500); },
  };
})();

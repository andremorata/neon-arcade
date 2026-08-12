/* ══════════════════════════════════════════════════════
   NEON ARCADE — Núcleo compartilhado
   Áudio sintetizado (WebAudio), música procedural,
   partículas, overlay/HUD, best scores, utils.
   Uso: <script src="assets/js/neon-core.js"></script>
   ══════════════════════════════════════════════════════ */
'use strict';

window.Neon = (function () {

  // ── utils ──────────────────────────────────────────
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const choice = arr => arr[(Math.random() * arr.length) | 0];
  const $ = id => document.getElementById(id);
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';

  // ── best scores ────────────────────────────────────
  const best = {
    get(key) { return +localStorage.getItem('neon-best-' + key) || 0; },
    set(key, v) { localStorage.setItem('neon-best-' + key, v); return v; },
    update(key, v) { if (v > best.get(key)) best.set(key, v); return best.get(key); },
  };

  // ── DOM helpers ────────────────────────────────────
  function popEl(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function toast(text, el) {
    el = el || $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ── overlay ────────────────────────────────────────
  const overlay = {
    show(title, text, btn, cls = '', extra = '') {
      const t = $('overlayTitle'), x = $('overlayText'), s = $('overlaySub'), b = $('startBtn');
      if (t) { t.textContent = title; t.className = cls; }
      if (x) x.textContent = text;
      if (s) { s.style.display = extra ? 'block' : 'none'; s.innerHTML = extra; }
      if (b) b.textContent = btn;
      const o = $('overlay');
      if (o) o.classList.remove('hidden');
    },
    hide() {
      const o = $('overlay');
      if (o) o.classList.add('hidden');
      const fs = $('finalStats');
      if (fs) fs.style.display = 'none';
    },
    visible() {
      const o = $('overlay');
      return o && !o.classList.contains('hidden');
    },
  };

  // ── áudio (WebAudio, tudo sintetizado) ─────────────
  let AC = null, sndGain = null, musGain = null, noiseBuf = null;
  let musicTimer = null, musicStep = 0, musicNext = 0;
  let soundOn = localStorage.getItem('neon-sound') !== 'off';

  function ensureAudio() {
    if (!AC) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      AC = new Ctx();
      sndGain = AC.createGain(); sndGain.gain.value = 0.6; sndGain.connect(AC.destination);
      musGain = AC.createGain(); musGain.gain.value = 0.2; musGain.connect(AC.destination);
      const len = AC.sampleRate * 0.2;
      noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
  }

  const tone = (f0, f1, t0, dur, type, vol, out, attack) => {
    out = out || sndGain;
    const o = AC.createOscillator(), g = AC.createGain();
    const start = AC.currentTime + (t0 || 0);
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(1, f0), start);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol <= 0 ? 0.0001 : vol, start + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(out);
    o.start(start); o.stop(start + dur + 0.05);
  };

  const noise = (t0, dur, vol, out, cutoff) => {
    out = out || sndGain;
    if (!noiseBuf) return;
    const src = AC.createBufferSource(), g = AC.createGain(),
          f = AC.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = cutoff || 6000;
    const start = AC.currentTime + (t0 || 0);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(start); src.stop(start + dur + 0.05);
  };

  const sfx = {
    tick()        { if (!g()) return; tone(660, 0, 0, 0.05, 'sine', 0.12); },
    click()       { if (!g()) return; tone(880, 0, 0, 0.05, 'triangle', 0.15); },
    rotate()      { if (!g()) return; tone(520, 660, 0, 0.07, 'square', 0.08); },
    move()        { if (!g()) return; tone(300, 0, 0, 0.04, 'square', 0.05); },
    drop()        { if (!g()) return; tone(180, 90, 0, 0.08, 'triangle', 0.25); },
    lock()        { if (!g()) return; tone(140, 90, 0, 0.09, 'triangle', 0.2); },
    eat(streak)   { if (!g()) return; const b = 500 + Math.min(streak || 1, 10) * 40; tone(b, b * 1.5, 0, 0.09, 'triangle', 0.22); },
    golden()      { if (!g()) return; tone(1318, 0, 0, 0.08, 'square', 0.12); tone(1760, 0, 0.07, 0.12, 'square', 0.12); },
    boost()       { if (!g()) return; tone(300, 900, 0, 0.18, 'sawtooth', 0.12); tone(1200, 2400, 0.03, 0.12, 'sine', 0.1); },
    shoot()       { if (!g()) return; tone(900, 220, 0, 0.09, 'sawtooth', 0.12); },
    boom()        { if (!g()) return; noise(0, 0.3, 0.3, null, 900); tone(320, 50, 0, 0.5, 'sawtooth', 0.2); },
    hit()         { if (!g()) return; tone(240, 120, 0, 0.07, 'square', 0.15); },
    paddle()      { if (!g()) return; tone(340, 480, 0, 0.09, 'square', 0.14); },
    wall()        { if (!g()) return; tone(200, 160, 0, 0.05, 'square', 0.1); },
    goal()        { if (!g()) return; tone(392, 0, 0, 0.12, 'triangle', 0.2); tone(523, 0, 0.1, 0.16, 'triangle', 0.2); },
    flap()        { if (!g()) return; tone(500, 800, 0, 0.07, 'triangle', 0.14); },
    point()       { if (!g()) return; tone(988, 0, 0, 0.06, 'triangle', 0.16); tone(1319, 0, 0.06, 0.09, 'triangle', 0.16); },
    clear(n)      { if (!g()) return; const b = 440 + (n || 1) * 90; [0, 0.06, 0.12].forEach((d, i) => tone(b * (1 + i * 0.25), 0, d, 0.1, 'triangle', 0.2)); },
    merge(v)      { if (!g()) return; const m = Math.min(16, Math.log2(v || 2)); tone(523 * Math.pow(1.12, m), 0, 0, 0.07, 'triangle', 0.13); },
    correct(n)    { if (!g()) return; tone(523 * Math.pow(1.06, (n || 0) % 12), 0, 0, 0.09, 'triangle', 0.2); },
    wrong()       { if (!g()) return; tone(220, 110, 0, 0.25, 'sawtooth', 0.22); },
    flag()        { if (!g()) return; tone(240, 200, 0, 0.05, 'square', 0.08); },
    open()        { if (!g()) return; tone(300, 0, 0, 0.04, 'sine', 0.06); },
    whack()       { if (!g()) return; noise(0, 0.12, 0.22, null, 2000); tone(180, 60, 0, 0.12, 'triangle', 0.25); },
    sizzle()      { if (!g()) return; tone(900, 2600, 0, 0.3, 'sawtooth', 0.09); },
    beep()        { if (!g()) return; tone(784, 0, 0, 0.08, 'square', 0.1); },
    level()       { if (!g()) return; [523, 659, 784].forEach((f, i) => tone(f, 0, i * 0.08, 0.12, 'triangle', 0.18)); },
    record()      { if (!g()) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, 0, i * 0.09, 0.12, 'triangle', 0.2)); },
    death()       { if (!g()) return; noise(0, 0.35, 0.3, null, 700); tone(300, 45, 0, 0.55, 'sawtooth', 0.22); },
    pause()       { if (!g()) return; tone(440, 0, 0, 0.06, 'sine', 0.1); },
  };
  const g = () => soundOn && AC;

  // trilha synthwave procedural
  const MUSIC = {
    bass: [45, 45, 48, 45, 52, 45, 48, 52],
    lead: [57, 60, 64, 69, 64, 60, 57, 45],
    start() {
      if (!soundOn || !AC || musicTimer) return;
      musicStep = 0; musicNext = AC.currentTime + 0.08;
      musicTimer = setInterval(() => this.sched(), 100);
    },
    stop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    sched() {
      const spb = 60 / 112 / 2;
      while (musicNext < AC.currentTime + 0.3) {
        const s = musicStep, t = musicNext, bar = s % 8;
        if (s % 4 === 0) tone(130, 42, t - AC.currentTime, 0.16, 'sine', 0.5, musGain);
        if (s % 2 === 1) noise(t - AC.currentTime, 0.03, 0.05, musGain, 7000);
        tone(this.midi(this.bass[bar]), 0, t - AC.currentTime, 0.22, 'sawtooth', 0.1, musGain);
        if (s % 8 === 4) tone(this.midi(this.lead[bar % 8] + 12), 0, t - AC.currentTime + spb * 0.5, 0.3, 'triangle', 0.09, musGain);
        musicStep++;
        musicNext = t + spb;
      }
    },
    midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },
  };

  function setSound(on) {
    soundOn = on;
    localStorage.setItem('neon-sound', on ? 'on' : 'off');
    Array.from(document.querySelectorAll('.sound-toggle')).forEach(b => {
      b.textContent = on ? '🔊' : '🔇';
      b.classList.toggle('muted', !on);
    });
    if (!on) MUSIC.stop(); else if (AC) MUSIC.start();
  }

  function bindSoundToggle(btn) {
    btn = btn || $('soundToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      ensureAudio();
      if (!soundOn && AC && AC.state === 'suspended') AC.resume();
      setSound(!soundOn);
    });
  }

  const audio = {
    ensure: ensureAudio,
    get on() { return soundOn; },
    setOn: setSound,
    sfx,
    bindToggle: bindSoundToggle,
    music: MUSIC,
  };

  // ── partículas ─────────────────────────────────────
  class Particles {
    constructor() { this.list = []; }
    clear() { this.list.length = 0; }
    burst(x, y, color, count, speed = 140, size = 3.5) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
        const s = speed * rand(0.6, 1.3);
        this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, color, size * rand(0.7, 1.3));
      }
    }
    emit(x, y, vx, vy, color, size, life) {
      this.list.push({ x, y, vx, vy, color, size: size || 3, life: life || rand(0.5, 0.85), maxLife: 0.9 });
    }
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
        p.life -= dt;
        if (p.life <= 0) L.splice(i, 1);
      }
    }
    draw(ctx) {
      for (const p of this.list) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // ── canvas helpers ─────────────────────────────────
  function circle(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill !== undefined) ctx.fillStyle = fill;
    ctx.fill();
  }
  function glow(ctx, color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }

  // ── pausa ao trocar de aba ─────────────────────────
  function onHide(fn) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) fn();
    });
  }

  // ── inicialização de página padrão ─────────────────
  // Espera DOM pronto e aplica: fontes, sound toggle, best keys.
  function initPage() {
    bindSoundToggle();
    const tag = $('best');
    if (tag) tag.textContent = best.get(tag.dataset.key || 'none');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

  return {
    rand, clamp, choice, $, EMOJI,
    best, popEl, toast,
    overlay, audio,
    Particles, circle, glow, onHide,
    initPage,
  };
})();
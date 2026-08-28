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
  let musFilter = null, musDelay = null;
  let musicTimer = null, musicStep = 0, musicNext = 0, musIntensity = 0;
  let soundOn = localStorage.getItem('neon-sound') !== 'off';

  function ensureAudio() {
    if (!AC) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      AC = new Ctx();
      sndGain = AC.createGain(); sndGain.gain.value = 0.6; sndGain.connect(AC.destination);
      musGain = AC.createGain(); musGain.gain.value = 0.2; musGain.connect(AC.destination);
      // Corte compartilhado da trilha: abre conforme o jogo esquenta e despenca na morte.
      musFilter = AC.createBiquadFilter();
      musFilter.type = 'lowpass'; musFilter.frequency.value = 900; musFilter.Q.value = 0.7;
      musFilter.connect(musGain);
      // Eco com realimentacao, so pro arpejo.
      musDelay = AC.createDelay(1); musDelay.delayTime.value = 0.27;
      const fb = AC.createGain(); fb.gain.value = 0.33;
      musDelay.connect(fb); fb.connect(musDelay); musDelay.connect(musFilter);
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
    note(f)       { if (!g()) return; tone(f, 0, 0, 0.55, 'triangle', 0.24); tone(f * 2, 0, 0, 0.22, 'sine', 0.07); },
    level()       { if (!g()) return; [523, 659, 784].forEach((f, i) => tone(f, 0, i * 0.08, 0.12, 'triangle', 0.18)); },
    record()      { if (!g()) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, 0, i * 0.09, 0.12, 'triangle', 0.2)); },
    death()       { if (!g()) return; noise(0, 0.35, 0.3, null, 700); tone(300, 45, 0, 0.55, 'sawtooth', 0.22); },
    pause()       { if (!g()) return; tone(440, 0, 0, 0.06, 'sine', 0.1); },
  };
  const g = () => soundOn && AC;

  // ── trilha synthwave procedural ────────────────────
  // Progressao Am-F-C-G em la menor. Andamento e corte do filtro sobem com
  // music.intensity(k), que cada jogo alimenta com o proprio 0..1. Quem nao
  // chamar roda no piso, entao nenhum jogo precisa mudar pra funcionar.
  const CHORDS = [
    { root: 110.00, notes: [440.00, 523.25, 659.25] },  // Am
    { root:  87.31, notes: [349.23, 440.00, 523.25] },  // F
    { root: 130.81, notes: [392.00, 523.25, 659.25] },  // C
    { root:  98.00, notes: [392.00, 493.88, 587.33] },  // G
  ];
  const BASS = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 2, 0];  // 0 pausa · 1 tonica · 2 oitava
  const KICK = [0, 8, 11], CLAP = [4, 12], ARP = [2, 7, 10, 15];
  const bpm = () => 92 + musIntensity * 52;

  function mKick(t) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(musFilter);
    o.start(t); o.stop(t + 0.25);
  }
  function mNoise(t, dur, freq, q, vol, type) {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(musFilter);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function mBass(t, f, dur) {
    const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass'; lp.Q.value = 7;
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + dur);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musFilter);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function mArp(t, f) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(musDelay); g.connect(musFilter);
    o.start(t); o.stop(t + 0.4);
  }
  function mPad(t, ch, dur) {
    for (const f of ch.notes) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sawtooth'; o.frequency.value = f / 2;
      o.detune.value = rand(-7, 7);                 // desafina de leve, engorda o acorde
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musFilter);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  const MUSIC = {
    start() {
      if (!soundOn || !AC || musicTimer) return;
      const t = AC.currentTime;
      musicStep = 0; musicNext = t + 0.08;
      musFilter.frequency.cancelScheduledValues(t);
      musFilter.frequency.setValueAtTime(420, t);
      musGain.gain.cancelScheduledValues(t);
      musGain.gain.setValueAtTime(musGain.gain.value, t);
      musGain.gain.linearRampToValueAtTime(0.2, t + 1.2);
      musicTimer = setInterval(() => this.sched(), 50);
      this.sched();
    },
    stop(fade) {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (!AC) return;
      const t = AC.currentTime;
      musGain.gain.cancelScheduledValues(t);
      musGain.gain.setValueAtTime(musGain.gain.value, t);
      musGain.gain.linearRampToValueAtTime(0, t + (fade === undefined ? 0.25 : fade));
    },
    // Morte: derruba o corte e desliga junto com o jogador.
    down() {
      if (!AC || !musicTimer) return;
      const t = AC.currentTime;
      musFilter.frequency.cancelScheduledValues(t);
      musFilter.frequency.setValueAtTime(Math.max(200, musFilter.frequency.value), t);
      musFilter.frequency.exponentialRampToValueAtTime(150, t + 0.7);
      this.stop(0.8);
    },
    // 0..1: o quanto a partida esta pegando fogo. Mexe andamento e brilho.
    intensity(k) { musIntensity = clamp(+k || 0, 0, 1); },
    sched() {
      const spb = 60 / bpm() / 4;                  // um passo = semicolcheia
      const ate = AC.currentTime + 0.25;
      let guard = 0;
      while (musicNext < ate && guard++ < 48) {
        const s = musicStep, bar = (s >> 4) & 3, st = s & 15, ch = CHORDS[bar], t = musicNext;
        if (KICK.includes(st)) mKick(t);
        if (CLAP.includes(st)) mNoise(t, 0.16, 1800, 1.2, 0.22, 'bandpass');
        mNoise(t, st % 2 ? 0.045 : 0.028, 7500, 0.8, st % 2 ? 0.05 : 0.03, 'highpass');
        if (BASS[st]) mBass(t, ch.root * BASS[st], spb * 1.6);
        if (ARP.includes(st)) mArp(t, ch.notes[(st + bar) % 3]);
        if (st === 0 && bar % 2 === 0) mPad(t, ch, spb * 32);
        musicStep = (s + 1) & 63;
        musicNext = t + spb;
      }
      musFilter.frequency.setTargetAtTime(700 + musIntensity * 1600, AC.currentTime, 0.6);
    },
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

  // ── movimento reduzido ─────────────────────────────
  // O CSS ja zera as animacoes da pagina. Isto e pro canvas: tremida de tela
  // e flash de tela cheia nao passam por CSS, entao cada jogo consulta aqui
  // antes de disparar. Getter, nao valor: a preferencia muda sem recarregar.
  const reducedMQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const motion = { get reduced() { return reducedMQ.matches; } };

  // ── partículas ─────────────────────────────────────
  class Particles {
    constructor() { this.list = []; this.waves = []; this.floats = []; }
    clear() { this.list.length = 0; this.waves.length = 0; this.floats.length = 0; }
    // Anel que abre a partir do ponto. Marca impacto sem tapar o que esta atras.
    wave(x, y, color, r) { this.waves.push({ x, y, color, r: r || 90, life: 1 }); }
    // Texto que sobe e some. Serve pra "+30 x3" e pra nome de poder.
    float(x, y, text, color, size) { this.floats.push({ x, y, text, color, size: size || 15, life: 1 }); }
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
      for (let i = this.waves.length - 1; i >= 0; i--) {
        if ((this.waves[i].life -= dt * 2.2) <= 0) this.waves.splice(i, 1);
      }
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.y -= 36 * dt;
        if ((f.life -= dt * 1.25) <= 0) this.floats.splice(i, 1);
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
      for (const w of this.waves) {
        ctx.globalAlpha = w.life * 0.7;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 3 * w.life;
        ctx.shadowBlur = 16;
        ctx.shadowColor = w.color;
        ctx.beginPath();
        ctx.arc(w.x, w.y, (1 - w.life) * w.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.floats.length) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of this.floats) {
          ctx.globalAlpha = Math.min(1, f.life * 1.6);
          ctx.font = `700 ${f.size}px Orbitron, sans-serif`;
          ctx.shadowBlur = 12;
          ctx.shadowColor = f.color;
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // ── canvas na resolucao real da tela ───────────────
  // O width/height do HTML continua sendo o sistema de coordenadas do jogo.
  // Aqui so aumentamos o backing store e escalamos o contexto, entao nenhum
  // jogo precisa saber que isso existe. Toque tambem nao muda: os jogos mapeiam
  // por getBoundingClientRect().width, que e tamanho CSS.
  // ponytail: teto de 3x. O quadro nunca passa de 900px CSS (.stage max-width),
  // entao o backing store para em 2700px de largura no pior caso.
  function fitCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let applied = 0;
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return; // ainda sem layout
      const s = clamp((box.width * (window.devicePixelRatio || 1)) / W, 1, 3);
      if (Math.abs(s - applied) < 0.01) return;
      applied = s;
      canvas.width = Math.round(W * s);   // zera o contexto
      canvas.height = Math.round(H * s);
      ctx.setTransform(s, 0, 0, s, 0, 0); // volta pras coordenadas do jogo
    };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
    else window.addEventListener('resize', fit);
    return ctx;
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
  // Pausa ao esconder a aba E ao perder o foco da janela. So o visibilitychange
  // deixava o jogo rodando quando voce clicava em outra janela por cima.
  function onHide(fn) {
    document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
    window.addEventListener('blur', fn);
  }

  // ── formato do mundo por orientacao ────────────────
  // O jogo passa os dois tamanhos e recebe o que vale agora. Quem escreve
  // --arw/--arh e daqui, entao o breakpoint mora num lugar so, em vez de
  // repetido no <style> de cada jogo.
  // Girar o aparelho troca o formato do mundo. Recarrega em vez de esticar o
  // quadro: partida distorcida e pior do que partida perdida.
  const RETRATO = '(max-width: 560px) and (orientation: portrait)';
  function world(canvas, deitado, emPe) {
    const mq = window.matchMedia ? window.matchMedia(RETRATO) : { matches: false };
    if (mq.addEventListener) mq.addEventListener('change', () => location.reload());
    const [W, H] = mq.matches ? emPe : deitado;
    canvas.width = W;
    canvas.height = H;
    const stage = canvas.closest('.stage');
    if (stage) {
      stage.style.setProperty('--arw', String(W));   // setProperty pede string
      stage.style.setProperty('--arh', String(H));
    }
    return { W, H, retrato: !!mq.matches };
  }

  // ── dica de girar o telefone ───────────────────────
  // Em retrato todo jogo trava na largura da tela, entao o quadro de um jogo
  // deitado vira uma faixa fina. Girar troca 373x249 por 412x275 e ocupa a
  // tela toda. Quem decide e o jogador; isto so avisa, e o CSS so mostra em
  // celular em pe e antes da partida comecar.
  function addRotateHint() {
    const stage = document.querySelector('.stage');
    if (!stage || stage.querySelector('.rotate-hint')) return;
    const cs = getComputedStyle(stage);
    const arw = parseFloat(cs.getPropertyValue('--arw'));
    const arh = parseFloat(cs.getPropertyValue('--arh'));
    if (!(arw / arh >= 1.4)) return; // 4:3 pra baixo girar nao compensa
    const hint = document.createElement('div');
    hint.className = 'rotate-hint';
    hint.textContent = '↻ gire o telefone para um quadro maior';
    stage.appendChild(hint);
  }

  // ── inicialização de página padrão ─────────────────
  // Espera DOM pronto e aplica: fontes, sound toggle, best keys.
  function initPage() {
    bindSoundToggle();
    const cv = $('game');
    if (cv && cv.getContext) fitCanvas(cv);
    // O glitch do logo e uma copia do titulo em outra cor. attr() precisa do
    // dado no elemento, entao copia daqui em vez de repetir em 14 arquivos.
    const h1 = document.querySelector('.brand h1');
    if (h1) h1.dataset.glitch = h1.textContent.trim();
    addRotateHint();
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
    Particles, circle, glow, onHide, fitCanvas, motion, world,
    initPage,
  };
})();
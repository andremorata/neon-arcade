'use strict';
// Entrada unificada: teclado + mouse no PC, joystick virtual + botões no celular.
// O jogo só lê G.input; não sabe de onde veio o comando.
// PC (dossiê): WASD anda, Espaço ou botão esquerdo ataca, 1 a 4 habilidades, Q esquiva, E injetor.
(() => {
  const G = window.G;
  const I = G.input = {
    mx: 0, my: 0,          // movimento, comprimento até 1
    atacar: false,         // segurar = atira de novo quando a recarga deixa
    fila: [],              // ações deste quadro: 0..3 (habilidades), 'esquiva', 'injetor'
    mouse: { x: 0, y: 0, ativo: false },
    toque: false,
  };
  const teclas = new Set();
  const ACAO = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, KeyQ: 'esquiva', ShiftLeft: 'esquiva', KeyE: 'injetor', KeyI: 'painel', KeyC: 'painel', Tab: 'painel' };

  function modo(toque) {
    if (I.toque === toque) return;
    I.toque = toque;
    document.body.classList.toggle('toque', toque);
    document.body.classList.toggle('teclado', !toque);
  }

  function lerTeclado() {
    let x = 0, y = 0;
    if (teclas.has('KeyA') || teclas.has('ArrowLeft')) x--;
    if (teclas.has('KeyD') || teclas.has('ArrowRight')) x++;
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) y--;
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) y++;
    const m = Math.hypot(x, y) || 1;
    return [x / m, y / m];
  }

  let joyId = null, joyX = 0, joyY = 0, joyVX = 0, joyVY = 0, mouseAtira = false, botaoAtira = 0;
  const JOY_R = 56;

  I.atualizar = () => {
    if (joyId !== null) { I.mx = joyVX; I.my = joyVY; }
    else [I.mx, I.my] = lerTeclado();
    I.atacar = teclas.has('Space') || teclas.has('KeyJ') || mouseAtira || botaoAtira > 0;
  };
  I.soltarTudo = () => {
    teclas.clear(); joyId = null; joyVX = joyVY = 0; mouseAtira = false; botaoAtira = 0; I.fila.length = 0;
    const base = document.getElementById('joyBase'); if (base) base.classList.remove('ativo');
    document.querySelectorAll('.btn.apertado').forEach(b => b.classList.remove('apertado'));
  };

  I.ligar = (canvas, aoPausar) => {
    addEventListener('keydown', e => {
      if (e.code === 'Escape' || e.code === 'KeyP') { aoPausar(); return; }
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
      modo(false);
      if (!e.repeat && e.code in ACAO) I.fila.push(ACAO[e.code]);
      teclas.add(e.code);
    });
    addEventListener('keyup', e => teclas.delete(e.code));
    addEventListener('blur', I.soltarTudo);

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') { modo(false); if (e.button === 0) mouseAtira = true; if (e.button === 2) I.fila.push('esquiva'); }
    });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseAtira = false; });
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.ativo = true;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // joystick flutuante: nasce onde o polegar tocar na metade esquerda
    const zona = document.getElementById('joy'), base = document.getElementById('joyBase'), pino = document.getElementById('joyPino');
    zona.addEventListener('pointerdown', e => {
      modo(true);
      if (joyId !== null) return;
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY;
      try { zona.setPointerCapture(e.pointerId); } catch {}
      base.style.left = joyX + 'px'; base.style.top = joyY + 'px';
      base.classList.add('ativo'); pino.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    });
    zona.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - joyX, dy = e.clientY - joyY;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) {
        // a base segue o polegar quando ele passa do raio
        joyX += dx * (1 - JOY_R / d); joyY += dy * (1 - JOY_R / d);
        base.style.left = joyX + 'px'; base.style.top = joyY + 'px';
        dx = e.clientX - joyX; dy = e.clientY - joyY;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / JOY_R), a = Math.atan2(dy, dx);
      joyVX = m < 0.15 ? 0 : Math.cos(a) * m; joyVY = m < 0.15 ? 0 : Math.sin(a) * m;
      pino.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const solta = e => { if (e.pointerId !== joyId) return; joyId = null; joyVX = joyVY = 0; base.classList.remove('ativo'); };
    zona.addEventListener('pointerup', solta);
    zona.addEventListener('pointercancel', solta);

    document.getElementById('btnPersonagem').addEventListener('click', () => I.fila.push('painel'));
    document.querySelectorAll('#acoes .btn').forEach(btn => {
      const a = btn.dataset.acao, acao = /^\d$/.test(a) ? +a : a;
      btn.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') modo(true);
        e.preventDefault(); e.stopPropagation();
        try { btn.setPointerCapture(e.pointerId); } catch {}
        btn.classList.add('apertado');
        if (acao === 'ataque') botaoAtira++; else I.fila.push(acao);
      });
      const fim = () => {
        if (!btn.classList.contains('apertado')) return;
        btn.classList.remove('apertado');
        if (acao === 'ataque') botaoAtira = Math.max(0, botaoAtira - 1);
      };
      btn.addEventListener('pointerup', fim);
      btn.addEventListener('pointercancel', fim);
      btn.addEventListener('lostpointercapture', fim);
    });

    modo(matchMedia('(pointer: coarse)').matches);
  };
})();

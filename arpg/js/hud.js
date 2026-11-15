'use strict';
// HUD em DOM (barras, botões, minimapa). Texto só é reescrito quando muda.
(() => {
  const G = window.G, J = G.jogo;
  const $ = id => document.getElementById(id);
  let el, mini, mctx, relogioMini = 0, bannerT = 0;
  const ultimo = {};
  const trocar = (k, v, f) => { if (ultimo[k] !== v) { ultimo[k] = v; f(v); } };

  function iniciar() {
    el = {
      vida: $('vidaFill'), vidaTxt: $('vidaTxt'), energia: $('energiaFill'), nivel: $('nivel'), creditos: $('creditos'),
      xp: $('xpFill'), bairro: $('bairro'), bairroNome: $('bairroNome'), bairroNivel: $('bairroNivel'),
      alvo: $('alvo'), alvoNome: $('alvoNome'), alvoFill: $('alvoFill'), toasts: $('toasts'),
      habs: [...document.querySelectorAll('#habs .hab')],
    };
    el.habs.forEach((b, i) => {
      const h = G.HAB[i];
      b.querySelector('.icone').textContent = h.icone;
      b.querySelector('.tecla').textContent = h.teclas[0];
      b.setAttribute('aria-label', h.nome);
      b.title = `${h.nome} (${h.teclas.join(' / ')})`;
    });
    mini = $('mini'); mctx = mini.getContext('2d');
    G.avisar(aviso);
    G.aoMudarBairro = banner;
  }

  function aviso(txt, cor = '#fff', grande = false) {
    const d = document.createElement('div');
    d.className = 'aviso' + (grande ? ' grande' : '');
    d.textContent = txt; d.style.color = cor;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), grande ? 2600 : 2200);
  }

  function banner(bk) {
    const B = G.BAIRROS[bk];
    el.bairroNome.textContent = B.nome;
    el.bairroNivel.textContent = `Nível ${B.nivel[0]}–${B.nivel[1]}`;
    el.bairro.style.setProperty('--cor', B.neon[0]);
    el.bairro.classList.remove('mostra'); void el.bairro.offsetWidth; el.bairro.classList.add('mostra');
    bannerT = 3.2;
    G.som.chuva(B.chuva);
  }

  function minimapa() {
    const p = J.p, M = G.mundo, Cq = G.CHUNK;
    const w = mini.width, esc = w / (Cq * 2.6);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, w, w);
    mctx.save();
    mctx.beginPath(); mctx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); mctx.clip();
    mctx.fillStyle = 'rgba(5,4,12,0.85)'; mctx.fillRect(0, 0, w, w);
    mctx.setTransform(esc, 0, 0, esc, w / 2 - p.x * esc, w / 2 - p.y * esc);
    const pcx = M.quadraDe(p.x), pcy = M.quadraDe(p.y);
    for (let cy = pcy - 2; cy <= pcy + 2; cy++) for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
      const ch = M.chunk(cx, cy);
      if (ch.fora) continue;
      const B = G.BAIRROS[ch.bairro];
      mctx.globalAlpha = 0.22; mctx.fillStyle = B.neon[0];
      mctx.fillRect(ch.x + M.MEIA, ch.y + M.MEIA, Cq - M.RUA, Cq - M.RUA);
      mctx.globalAlpha = 0.9; mctx.fillStyle = '#0a0912';
      for (const b of ch.caixas) mctx.fillRect(b.x, b.y, b.w, b.d);
      if (ch.abrigo) { mctx.fillStyle = '#00f0ff'; mctx.fillRect(ch.abrigo.x - 40, ch.abrigo.y - 40, 80, 80); }
    }
    mctx.globalAlpha = 1;
    for (const e of J.inimigos) {
      mctx.fillStyle = e.elite ? '#ffb300' : '#ff3d5a';
      mctx.fillRect(e.x - 25, e.y - 25, 50, 50);
    }
    for (const l of J.loot) if (l.tipo === 'item') { mctx.fillStyle = G.RARIDADES[l.item.rar].cor; mctx.fillRect(l.x - 22, l.y - 22, 44, 44); }
    // seta do jogador
    mctx.translate(p.x, p.y); mctx.rotate(p.dir);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(110, 0); mctx.lineTo(-70, 70); mctx.lineTo(-40, 0); mctx.lineTo(-70, -70); mctx.closePath(); mctx.fill();
    mctx.restore();
    // seta apontando pro abrigo quando ele está fora do mapa
    const ax = Cq / 2 - p.x, ay = Cq / 2 - p.y, ad = Math.hypot(ax, ay);
    if (ad > Cq * 1.2) {
      const a = Math.atan2(ay, ax), r = w / 2 - 8;
      mctx.fillStyle = '#00f0ff';
      mctx.beginPath(); mctx.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 4, 0, Math.PI * 2); mctx.fill();
    }
  }

  function atualizar(dt) {
    const p = J.p;
    if (!p) return;
    trocar('vida', Math.ceil(p.hp) + '/' + p.hpMax, v => {
      el.vida.style.transform = `scaleX(${p.hp / p.hpMax})`; el.vidaTxt.textContent = v;
    });
    trocar('en', Math.round(p.en), v => { el.energia.style.transform = `scaleX(${v / p.enMax})`; });
    trocar('nivel', p.nivel, v => { el.nivel.textContent = v; });
    trocar('cred', p.creditos, v => { el.creditos.textContent = '¢ ' + v.toLocaleString('pt-BR'); });
    trocar('xp', Math.round((p.xp / G.xpPara(p.nivel)) * 200), v => { el.xp.style.transform = `scaleX(${v / 200})`; });
    el.habs.forEach((b, i) => {
      const h = G.HAB[i], cd = p.cds[i];
      trocar('cd' + i, Math.ceil(cd * 20), () => { b.style.setProperty('--cd', h.cd > 0.5 ? (cd / h.cd).toFixed(3) : 0); });
      trocar('sem' + i, p.en < h.custo, v => b.classList.toggle('sem', v));
    });
    const a = J.alvo;
    trocar('alvo', a ? a.T.nome + a.nivel + (a.elite ? 'e' : '') : '', v => {
      el.alvo.hidden = !v;
      if (a) {
        el.alvoNome.textContent = `${a.elite ? 'Elite · ' : ''}${a.T.nome} · nv ${a.nivel}`;
        el.alvoNome.style.color = a.nivel > p.nivel + 3 ? '#ff3d5a' : a.elite ? '#ffb300' : '#fff';
      }
    });
    if (a) trocar('alvoHp', Math.round((a.hp / a.hpMax) * 100), v => { el.alvoFill.style.transform = `scaleX(${v / 100})`; });
    if (bannerT > 0 && (bannerT -= dt) <= 0) el.bairro.classList.remove('mostra');
    if ((relogioMini -= dt) <= 0) { relogioMini = 0.1; minimapa(); }
  }

  G.hud = { iniciar, atualizar, aviso, banner, reiniciar() { for (const k in ultimo) delete ultimo[k]; } };
})();

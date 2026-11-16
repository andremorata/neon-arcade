'use strict';
// HUD em DOM, no layout do dossiê (1 a 9). Texto só é reescrito quando muda.
(() => {
  const G = window.G, J = G.jogo, COR = G.COR;
  const $ = id => document.getElementById(id);
  let el, mini, mctx, relogioMini = 0, bannerT = 0;
  const ultimo = {};
  const trocar = (k, v, f) => { if (ultimo[k] !== v) { ultimo[k] = v; f(v); } };

  const ICONE = {
    ataque: '<svg viewBox="0 0 24 24"><path d="M3 15l12-6M3 17l11-5"/><path d="M15 9l5-2 1 4-5 2z"/><path d="M8 16l-1 4"/></svg>',
    merc_varredura: '<svg viewBox="0 0 24 24"><path d="M4 12l15-7M4 12h16M4 12l15 7"/></svg>',
    merc_investida: '<svg viewBox="0 0 24 24"><path d="M4 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
    merc_granada: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5l3-2"/></svg>',
    merc_peito_aberto: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg>',
    esquiva: '<svg viewBox="0 0 24 24"><path d="M5 15a7 7 0 1 1 3 4"/><path d="M5 20v-5h5"/></svg>',
    injetor: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6M17 7l-9 9-3 1 1-3 9-9M4 20l3-3"/></svg>',
  };

  function iniciar() {
    el = {
      vida: $('vidaFill'), escudo: $('escudoFill'), vidaTxt: $('vidaTxt'), carga: $('cargaFill'), cargaTxt: $('cargaTxt'),
      nivel: $('nivel'), lascas: $('lascas'), ruido: $('ruidoNome'), xp: $('xpFill'),
      bairro: $('bairro'), bairroNome: $('bairroNome'), bairroNivel: $('bairroNivel'),
      alvo: $('alvo'), alvoNome: $('alvoNome'), alvoFill: $('alvoFill'), alvoDica: $('alvoDica'),
      bTitulo: $('biscateTitulo'), bTexto: $('biscateTexto'), bExtra: $('biscateExtra'), toasts: $('toasts'),
      btns: [...document.querySelectorAll('#acoes .btn')],
    };
    for (const b of el.btns) {
      const a = b.dataset.acao;
      if (a === 'ataque') { b.innerHTML = ICONE.ataque + '<span class="tecla">Espaço</span>'; b.title = 'Disparo Curto (Espaço / clique)'; }
      else if (a === 'esquiva') { b.innerHTML = ICONE.esquiva + '<span class="tecla">Q</span><span class="seg"></span>'; b.title = 'Rolamento (Q)'; }
      else if (a === 'injetor') { b.innerHTML = ICONE.injetor + '<span class="tecla">E</span><span class="num"></span>'; b.title = 'Injetor (E): cura 35%'; }
      else {
        const h = G.KIT.slots[+a];
        b.innerHTML = (ICONE[h.id] || '') + `<span class="tecla">${+a + 1}</span><span class="seg"></span><span class="trava"></span>`;
        b.title = `${h.nome} (${+a + 1}): ${h.efeito}`; b.setAttribute('aria-label', h.nome);
      }
    }
    mini = $('mini'); mctx = mini.getContext('2d');
    G.avisar(aviso);
    G.aoMudarBairro = banner;
  }

  function aviso(txt, cor = COR.texto, grande = false) {
    const d = document.createElement('div');
    d.className = 'aviso' + (grande ? ' grande' : '');
    d.textContent = txt; d.style.color = cor;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), grande ? 2600 : 2800);
  }

  function banner(bk) {
    const B = G.BAIRROS[bk];
    el.bairroNome.textContent = B.nome;
    el.bairroNivel.textContent = `Nível ${B.nivel[0]}–${B.nivel[1]}`;
    el.bairro.classList.remove('mostra'); void el.bairro.offsetWidth; el.bairro.classList.add('mostra');
    bannerT = 3.2;
    G.som.chuva(B.pal.chuva);
  }

  function minimapa() {
    const p = J.p, Mu = G.mundo, Cq = G.CHUNK;
    const w = mini.width, esc = w / (Cq * 2.6);
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, w, w);
    mctx.save(); mctx.beginPath(); mctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2); mctx.clip();
    mctx.fillStyle = 'rgba(13,21,36,0.92)'; mctx.fillRect(0, 0, w, w);
    mctx.setTransform(esc, 0, 0, esc, w / 2 - p.x * esc, w / 2 - p.y * esc);
    const pcx = Mu.quadraDe(p.x), pcy = Mu.quadraDe(p.y);
    for (let cy = pcy - 2; cy <= pcy + 2; cy++) for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
      const ch = Mu.chunk(cx, cy);
      if (ch.fora) continue;
      const pal = G.BAIRROS[ch.bairro].pal;
      mctx.fillStyle = G.mistura(pal.calcada, '#ffffff', 0.06); mctx.fillRect(ch.x + Mu.MEIA, ch.y + Mu.MEIA, Cq - Mu.RUA, Cq - Mu.RUA);
      mctx.fillStyle = G.mistura(pal.asfalto, '#000000', 0.3);
      for (const b of ch.caixas) mctx.fillRect(b.x, b.y, b.w, b.d);
      if (ch.abrigo) { mctx.fillStyle = COR.menta; mctx.beginPath(); mctx.arc(ch.abrigo.x, ch.abrigo.y, 60, 0, Math.PI * 2); mctx.fill(); }
      if (ch.zila) { mctx.fillStyle = COR.lavanda; mctx.beginPath(); mctx.arc(ch.zila.x, ch.zila.y, 50, 0, Math.PI * 2); mctx.fill(); }
    }
    for (const e of J.inimigos) { mctx.fillStyle = e.tipo === 'portao' ? COR.ambar : COR.coral; mctx.beginPath(); mctx.arc(e.x, e.y, e.tipo === 'portao' ? 44 : 30, 0, Math.PI * 2); mctx.fill(); }
    for (const l of J.loot) if (l.tipo === 'item') { mctx.fillStyle = G.raridade(l.item.rar).cor; mctx.fillRect(l.x - 24, l.y - 24, 48, 48); }
    mctx.translate(p.x, p.y); mctx.rotate(p.dir); mctx.fillStyle = COR.texto;
    mctx.beginPath(); mctx.moveTo(120, 0); mctx.lineTo(-70, 70); mctx.lineTo(-36, 0); mctx.lineTo(-70, -70); mctx.closePath(); mctx.fill();
    mctx.restore();
    // objetivo do biscate: ponto na borda quando está longe
    const b = G.biscate();
    if (b.alvo) {
      const dx = b.alvo.x - p.x, dy = b.alvo.y - p.y, d = Math.hypot(dx, dy), r = w / 2 - 8;
      const k = Math.min(1, (d * esc) / r);
      mctx.fillStyle = COR.ambar; mctx.beginPath(); mctx.arc(w / 2 + dx / d * r * k, w / 2 + dy / d * r * k, 6, 0, Math.PI * 2); mctx.fill();
    }
  }

  function atualizar(dt) {
    const p = J.p;
    if (!p) return;
    trocar('vida', Math.ceil(p.hp) + '/' + p.hpMax, v => { el.vida.style.transform = `scaleX(${p.hp / p.hpMax})`; el.vidaTxt.textContent = v.replace('/', ' / '); });
    trocar('escudo', Math.ceil(p.escudo), v => { el.escudo.style.transform = `scaleX(${Math.min(1, v / p.hpMax)})`; });
    trocar('carga', Math.round(p.carga), v => { el.carga.style.transform = `scaleX(${v / p.cargaMax})`; el.cargaTxt.textContent = v; });
    trocar('nivel', p.nivel, v => { el.nivel.textContent = v; });
    trocar('lascas', p.lascas, v => { el.lascas.textContent = 'ł ' + v.toLocaleString('pt-BR'); });
    trocar('xp', Math.round((p.xp / G.xpPara(p.nivel)) * 300), v => { el.xp.style.transform = `scaleX(${v / 300})`; });
    for (const b of el.btns) {
      const a = b.dataset.acao;
      if (a === 'ataque') continue;
      if (a === 'esquiva') { trocar('cdE', Math.ceil(p.cd.esquiva * 10), () => { b.style.setProperty('--cd', (p.cd.esquiva / G.KIT.esquiva.cooldown).toFixed(3)); }); continue; }
      if (a === 'injetor') { trocar('inj', p.injetor.cargas, v => { b.querySelector('.num').textContent = v; b.classList.toggle('sem', v === 0); }); continue; }
      const i = +a, h = G.KIT.slots[i], livre = G.liberado(i), cd = p.cd.s[i];
      trocar('trava' + i, livre, v => { b.classList.toggle('travada', !v); b.querySelector('.trava').textContent = v ? '' : 'NV ' + h.nivelDesbloqueio; });
      trocar('cd' + i, Math.ceil(cd * 10), () => {
        b.style.setProperty('--cd', (cd / h.cooldown).toFixed(3));
        b.querySelector('.seg').textContent = cd > 0 ? Math.ceil(cd) : '';
      });
      trocar('sem' + i, livre && p.carga < h.custo, v => b.classList.toggle('sem', v));
    }
    const a = J.alvo;
    trocar('alvo', a ? a.id + a.nivel : '', v => {
      el.alvo.hidden = !v;
      if (!a) return;
      const T = G.INIMIGOS[a.id];
      el.alvo.classList.toggle('elite', !!T.elite);
      el.alvoNome.textContent = `${T.nome.toUpperCase()}${T.elite ? ' · ELITE' : ''} · NV ${a.nivel}`;
      el.alvoNome.style.color = a.nivel >= p.nivel + 3 ? COR.coral : T.elite ? COR.ambar : COR.texto;
      el.alvoDica.textContent = a.id === 'portao' ? 'escudo: −60% de dano pela frente' : '';
    });
    if (a) trocar('alvoHp', Math.round((a.hp / a.hpMax) * 100), v => { el.alvoFill.style.transform = `scaleX(${v / 100})`; });
    const b = G.biscate();
    trocar('biscate', b.titulo + b.texto + b.extra, () => { el.bTitulo.textContent = 'BISCATE · ' + b.titulo; el.bTexto.textContent = b.texto; el.bExtra.textContent = b.extra; });
    if (bannerT > 0 && (bannerT -= dt) <= 0) el.bairro.classList.remove('mostra');
    if ((relogioMini -= dt) <= 0) { relogioMini = 0.1; minimapa(); }
  }

  function retrato() { G.figuras.retrato($('rosto')); }

  function equipado() {
    const p = J.p, box = $('equipado');
    const linha = (rot, it) => it
      ? `<div><b style="color:${G.raridade(it.rar).cor}">${it.nome}</b> <small>${rot} · nv ${it.nivel} · ${G.descreverItem(it)}</small></div>`
      : `<div><b>${rot}</b> <small>vazio</small></div>`;
    box.innerHTML = linha('Arma', p.equip.arma) + linha('Jaqueta', p.equip.jaqueta) +
      `<div><small>Inventário e troca de itens chegam na próxima fatia.</small></div>`;
  }

  G.hud = { iniciar, atualizar, aviso, banner, retrato, equipado, reiniciar() { for (const k in ultimo) delete ultimo[k]; } };
})();

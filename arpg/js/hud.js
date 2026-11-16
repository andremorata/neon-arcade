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
    merc_hora_extra: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
    mau_olhado: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    bate_estaca: '<svg viewBox="0 0 24 24"><rect x="6" y="9" width="10" height="9" rx="2"/><path d="M16 12h5M8 9V5h6v4"/></svg>',
    fio_de_prumo: '<svg viewBox="0 0 24 24"><path d="M4 20L18 6"/><path d="M14 4h6v6"/><circle cx="5" cy="19" r="2"/></svg>',
    dinamo_lombar: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    meio_segundo: '<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9"/></svg>',
    esquiva: '<svg viewBox="0 0 24 24"><path d="M5 15a7 7 0 1 1 3 4"/><path d="M5 20v-5h5"/></svg>',
    injetor: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6M17 7l-9 9-3 1 1-3 9-9M4 20l3-3"/></svg>',
    falar: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>',
  };

  function iniciar() {
    el = {
      vida: $('vidaFill'), escudo: $('escudoFill'), vidaTxt: $('vidaTxt'), carga: $('cargaFill'), cargaTxt: $('cargaTxt'),
      nivel: $('nivel'), lascas: $('lascas'), ruido: $('ruidoNome'), ruidoSeg: [...document.querySelectorAll('.ruido b')], extras: $('extras'), xp: $('xpFill'),
      bairro: $('bairro'), bairroNome: $('bairroNome'), bairroNivel: $('bairroNivel'),
      alvo: $('alvo'), alvoNome: $('alvoNome'), alvoFill: $('alvoFill'), alvoDica: $('alvoDica'),
      chefe: $('chefe'), chefeNome: $('chefeNome'), chefeFill: $('chefeFill'), chefeFase: $('chefeFase'),
      interagir: $('interagir'), badge: $('pontosBadge'), status: $('status'),
      bTitulo: $('biscateTitulo'), bTexto: $('biscateTexto'), bExtra: $('biscateExtra'), toasts: $('toasts'),
      btns: [...document.querySelectorAll('#acoes .btn')],
    };
    for (const b of el.btns) {
      const a = b.dataset.acao;
      if (a === 'ataque') { b.innerHTML = ICONE.ataque + '<span class="tecla">Espaço</span>'; b.title = 'Disparo Curto (Espaço / clique)'; }
      else if (a === 'esquiva') { b.innerHTML = ICONE.esquiva + '<span class="tecla">Q</span><span class="seg"></span>'; b.title = 'Rolamento (Q)'; }
      else if (a === 'injetor') { b.innerHTML = '<span class="ic"></span><span class="tecla">E</span><span class="num"></span>'; }
      else b.innerHTML = `<span class="ic"></span><span class="tecla">${+a + 1}</span><span class="seg"></span><span class="trava"></span>`;
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
    setTimeout(() => d.remove(), grande ? 2600 : 3200);
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
      for (const n of ch.npcs || []) { mctx.fillStyle = COR.lavanda; mctx.beginPath(); mctx.arc(n.x, n.y, 46, 0, Math.PI * 2); mctx.fill(); }
      if (ch.arena) { mctx.strokeStyle = COR.coral; mctx.lineWidth = 30; mctx.strokeRect(ch.arena.x, ch.arena.y, ch.arena.w, ch.arena.h); }
    }
    for (const e of J.inimigos) { mctx.fillStyle = e.chefe ? COR.coral : e.elite ? COR.ambar : e.id === 'eco' ? COR.lavanda : COR.coral; mctx.beginPath(); mctx.arc(e.x, e.y, e.chefe ? 70 : e.elite ? 44 : 30, 0, Math.PI * 2); mctx.fill(); }
    // Chiado no Ruído: de vez em quando, um ponto falso
    if (J.p.estagioRuim.id !== 'limpo' && Math.sin(J.t * 0.7) > 0.8) { mctx.fillStyle = COR.coral; mctx.beginPath(); mctx.arc(p.x + 500 * Math.cos(J.t), p.y + 400 * Math.sin(J.t * 1.3), 30, 0, Math.PI * 2); mctx.fill(); }
    for (const l of J.loot) if (l.tipo === 'item') { mctx.fillStyle = G.raridade(l.item.rar).cor; mctx.fillRect(l.x - 24, l.y - 24, 48, 48); }
    mctx.translate(p.x, p.y); mctx.rotate(p.dir); mctx.fillStyle = COR.texto;
    mctx.beginPath(); mctx.moveTo(120, 0); mctx.lineTo(-70, 70); mctx.lineTo(-36, 0); mctx.lineTo(-70, -70); mctx.closePath(); mctx.fill();
    mctx.restore();
    const b = G.biscate();
    if (b.alvo) {
      const dx = b.alvo.x - p.x, dy = b.alvo.y - p.y, d = Math.hypot(dx, dy) || 1, r = w / 2 - 8;
      const k = Math.min(1, (d * esc) / r);
      mctx.fillStyle = COR.ambar; mctx.beginPath(); mctx.arc(w / 2 + dx / d * r * k, w / 2 + dy / d * r * k, 6, 0, Math.PI * 2); mctx.fill();
    }
  }

  function atualizar(dt) {
    const p = J.p;
    if (!p) return;
    // Anestesia de Rua: abaixo de 30% a barra pisca e o número some
    const esconde = p.escondeVida && p.hp / p.hpMax < p.escondeVida;
    trocar('vida', esconde ? '??' : Math.ceil(p.hp) + '/' + p.hpMax, v => { el.vidaTxt.textContent = v.replace('/', ' / '); });
    trocar('vidaB', Math.round(p.hp / p.hpMax * 200), v => { el.vida.style.transform = `scaleX(${v / 200})`; });
    el.vida.parentElement.classList.toggle('pisca', !!esconde);
    trocar('escudo', Math.ceil(p.escudo), v => { el.escudo.style.transform = `scaleX(${Math.min(1, v / p.hpMax)})`; });
    trocar('carga', Math.round(p.carga) + '/' + Math.round(p.cargaMax), () => { el.carga.style.transform = `scaleX(${p.carga / p.cargaMax})`; el.cargaTxt.textContent = Math.round(p.carga); });
    trocar('nivel', p.nivel, v => { el.nivel.textContent = v; });
    trocar('lascas', p.lascas, v => { el.lascas.textContent = 'ł ' + Math.round(v).toLocaleString('pt-BR'); });
    trocar('xp', Math.round((p.xp / G.xpPara(p.nivel)) * 300), v => { el.xp.style.transform = `scaleX(${v / 300})`; });
    trocar('ruido', p.ruido + p.estagio.id, () => {
      el.ruido.textContent = p.estagio.nome.toUpperCase() + (p.ruido ? ' ' + p.ruido : '');
      G.ESTAGIOS.forEach((s, i) => { el.ruidoSeg[i].style.transform = `scaleX(${G.clamp((p.ruido - s.de) / (s.ate + 1 - s.de), 0, 1)})`; });
      document.body.dataset.ruido = p.estagioRuim.id;
    });
    trocar('extras', `${p.atencao}|${Math.round(p.divida)}|${p.pecas}|${p.buff.sangue}`, () => {
      const partes = [];
      if (p.pecas) partes.push(`⚙ ${p.pecas}`);
      if (p.atencao) partes.push(`<span class="coral">Atenção ${p.atencao}</span>`);
      if (p.divida) partes.push(`<span class="${p.divida > G.sistemas.limiteDivida(p) ? 'coral' : ''}">Dívida ł ${Math.round(p.divida).toLocaleString('pt-BR')}</span>`);
      if (p.buff.sangue) partes.push(`<span class="ambar">Sangue ×${p.buff.sangue}</span>`);
      el.extras.innerHTML = partes.join(' · ');
    });
    trocar('pontos', p.pontos, v => { el.badge.hidden = !v; el.badge.textContent = v; });

    for (const b of el.btns) {
      const a = b.dataset.acao;
      if (a === 'ataque') continue;
      if (a === 'esquiva') { trocar('cdE', Math.ceil(p.cd.esquiva * 10), () => { b.style.setProperty('--cd', (p.cd.esquiva / G.KIT.esquiva.cooldown).toFixed(3)); }); continue; }
      if (a === 'injetor') {
        const falar = J.perto ? 'falar' : 'inj';
        trocar('injIc', falar, v => { b.querySelector('.ic').innerHTML = v === 'falar' ? ICONE.falar : ICONE.injetor; b.classList.toggle('falar', v === 'falar'); b.title = v === 'falar' ? 'Falar (E)' : 'Injetor (E): cura 35%'; });
        trocar('inj', J.perto ? -1 : p.injetor.cargas, v => { b.querySelector('.num').textContent = v < 0 ? '' : v; b.classList.toggle('sem', v === 0); });
        continue;
      }
      const i = +a, id = p.slots[i], h = id && G.sistemas.habilidade(id);
      trocar('slot' + i, id || '', () => {
        b.querySelector('.ic').innerHTML = (id && ICONE[id]) || '';
        b.classList.toggle('travada', !id);
        b.querySelector('.trava').textContent = id ? '' : '—';
        b.title = h ? `${h.nome} (${i + 1}): ${h.efeito}` : 'Vazio · escolha no personagem (I)';
      });
      if (!h) continue;
      const cd = G.cdHabilidade(id), tot = h.cooldown * Math.max(0.3, 1 - p.recarga);
      trocar('cd' + i, Math.ceil(cd * 10), () => { b.style.setProperty('--cd', (cd / tot).toFixed(3)); b.querySelector('.seg').textContent = cd > 0 ? Math.ceil(cd) : ''; });
      trocar('sem' + i, p.carga < (p.buff.horaExtra > 0 ? 0 : h.custo) || p.travadas[i] > 0, v => b.classList.toggle('sem', v));
      trocar('trv' + i, p.travadas[i] > 0, v => { b.classList.toggle('presa', v); });
    }

    trocar('perto', J.perto ? J.perto.id : '', v => {
      el.interagir.hidden = !v;
      if (v) el.interagir.innerHTML = `<b>E</b> · Falar com ${G.NPCS[v].nome}`;
    });

    const c = J.chefe;
    trocar('chefe', c ? c.id : '', v => { el.chefe.hidden = !v; if (v) el.chefeNome.textContent = G.INIMIGOS[v].nome.toUpperCase() + ' · LÍDER DOS GOTEIRAS'; });
    if (c) trocar('chefeHp', Math.round(c.hp / c.hpMax * 200) + (J.alagada ? 'a' : ''), () => {
      el.chefeFill.style.transform = `scaleX(${Math.max(0, c.hp / c.hpMax)})`;
      el.chefeFase.textContent = J.alagada ? 'Fase 2 · as calhas abriram: fuja das faixas' : 'Fase 1 · corrente e reforços';
    });

    const a = J.alvo;
    const surto = J.surto > 0;
    trocar('alvo', a && !a.chefe && !surto ? a.id + a.nivel : '', v => {
      el.alvo.hidden = !v;
      if (!v) return;
      const T = G.INIMIGOS[a.id];
      el.alvo.classList.toggle('elite', !!T.elite);
      el.alvoNome.textContent = `${T.nome.toUpperCase()}${T.elite ? ' · ELITE' : ''} · NV ${a.nivel}`;
      el.alvoNome.style.color = a.nivel >= p.nivel + 3 ? COR.coral : T.elite ? COR.ambar : COR.texto;
    });
    if (a && !surto) trocar('alvoHp', Math.round(a.hp) + '/' + (a.escudoEnergia | 0), () => {
      el.alvoFill.style.transform = `scaleX(${Math.max(0, a.hp / a.hpMax)})`;
      const dica = { portao: 'escudo: −60% de dano pela frente', guarda_limpida: `escudo de energia ${a.escudoEnergia | 0}`, drone_aureola: 'cura os aliados: derrube primeiro', sentinela_coro: 'trava suas habilidades: atordoe', vigia_cordame: 'chama reforço em 4 s' }[a.id] || '';
      el.alvoDica.textContent = (p.mostraVida ? `${Math.max(0, Math.ceil(a.hp))} / ${a.hpMax}  ` : '') + dica;
    });
    const b = G.biscate();
    trocar('biscate', b.titulo + b.texto + b.extra, () => { el.bTitulo.textContent = 'BISCATE · ' + b.titulo; el.bTexto.textContent = b.texto; el.bExtra.textContent = b.extra; });
    if (bannerT > 0 && (bannerT -= dt) <= 0) el.bairro.classList.remove('mostra');
    if ((relogioMini -= dt) <= 0) { relogioMini = 0.1; minimapa(); }
  }

  function retrato() { G.figuras.retrato($('rosto')); }
  function equipado() {
    const p = J.p, box = $('equipado');
    const its = G.SLOTS_EQUIP.map(k => p.equip[k]).filter(Boolean);
    box.innerHTML = its.map(it => `<div><b style="color:${G.raridade(it.rar).cor}">${it.nome}</b> <small>nv ${it.nivel} · ${G.descreverItem(it)}</small></div>`).join('') +
      '<div><small>Mochila, atributos, habilidades e implantes: tecla I ou o botão ⚙.</small></div>';
  }

  G.hud = { iniciar, atualizar, aviso, banner, retrato, equipado, reiniciar() { for (const k in ultimo) delete ultimo[k]; } };
})();

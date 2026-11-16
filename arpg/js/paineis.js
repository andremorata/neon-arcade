'use strict';
// Janelas por cima do jogo: o personagem (equipamento, atributos, habilidades, implantes)
// e a loja de cada vendedor. O jogo fica pausado enquanto uma janela está aberta.
(() => {
  const G = window.G, J = G.jogo, COR = G.COR, S = () => G.sistemas;
  const $ = id => document.getElementById(id);
  let aba = null, modo = null, npc = null, selecao = null, aoFechar = () => {};
  const ł = v => 'ł ' + Math.round(v).toLocaleString('pt-BR');
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const aviso = (t, c) => G.hud.aviso(t, c);
  const multMercado = p => (['estatica', 'afinado'].includes(p.estagioRuim.id) ? 1.15 : 1);

  // ── peças de HTML ───────────────────────────────────
  function cartaoItem(it, botoes = '', extra = '') {
    if (!it) return '';
    const R = G.raridade(it.rar), esp = G.ESPACOS.find(e => e.id === it.slot);
    const ap = it.aprimoramento ? ` +${it.aprimoramento}` : '';
    const lend = it.lendario ? `<p class="lend">${esc(G.poderLendario(it))}</p>` : '';
    return `<div class="cartao"><b style="color:${R.cor}">${esc(it.nome)}${ap}</b>
      <small>${esc(esp ? esp.nome : it.slot)} · ${R.nome} · nv ${it.nivel}</small>
      <p>${esc(G.descreverItem(it)) || '<i>sem bônus</i>'}</p>${lend}${extra}<div class="bts">${botoes}</div></div>`;
  }
  const bt = (acao, txt, extra = '', desligado = false) => `<button class="bt" data-acao="${acao}" ${extra} ${desligado ? 'disabled' : ''}>${txt}</button>`;
  const comparar = (p, it) => {
    const slot = it.slot === 'modulo' ? (p.equip.modulo1 ? 'modulo1' : 'modulo1') : it.slot;
    const d = Math.round(G.poderItem(it) - G.poderItem(p.equip[slot]));
    return `<small class="${d > 0 ? 'melhor' : d < 0 ? 'pior' : ''}">${d > 0 ? '▲ melhor' : d < 0 ? '▼ pior' : '= igual'} que o equipado</small>`;
  };

  // ── personagem ──────────────────────────────────────
  const ABAS_PERSONAGEM = [['equip', 'Equipamento'], ['atrib', 'Atributos'], ['habs', 'Habilidades'], ['impl', 'Implantes']];
  const TELAS = {
    equip(p) {
      const eq = G.SLOTS_EQUIP.map(k => {
        const it = p.equip[k], nome = k.startsWith('modulo') ? 'Módulo' : G.ESPACOS.find(e => e.id === k).nome;
        return it ? cartaoItem(it, bt('tirar', 'Tirar', `data-slot="${k}"`)) : `<div class="cartao vazio"><small>${nome}</small><p>vazio</p></div>`;
      }).join('');
      const mo = p.mochila.map((it, i) => cartaoItem(it, bt('equipar', 'Equipar', `data-i="${i}"`) + bt('largar', 'Largar', `data-i="${i}"`), comparar(p, it))).join('');
      return `<h3>Equipado</h3><div class="grade">${eq}</div>
        <h3>Mochila · ${p.mochila.length}/${G.MOCHILA_MAX}</h3><div class="grade">${mo || '<p class="dica">Vazia. Itens que você pega vêm pra cá.</p>'}</div>`;
    },
    atrib(p) {
      const linhas = G.ATRIBUTOS.map(a => `<div class="linha"><b>${a.nome}</b><span class="num">${p.atr[a.id]}</span>
        <small>${esc(a.efeito)}</small>${bt('ponto', '+', `data-id="${a.id}"`, p.pontos <= 0)}</div>`).join('');
      const v = (n, t) => `<div><small>${n}</small><b>${t}</b></div>`;
      return `<h3>Pontos livres: ${p.pontos}</h3><div class="lista">${linhas}</div>
        <h3>Resumo</h3><div class="resumo">
        ${v('Vida', p.hpMax)}${v('Carga', `${Math.round(p.cargaMax)} · ${p.cargaRegen.toFixed(1)}/s`)}
        ${v('Crítico', `${Math.round(p.critico * 100)}% · ×${p.danoCritico.toFixed(2)}`)}${v('Armadura', Math.round(p.armadura))}
        ${v('Dano', `+${Math.round(((1 + p.potencia) * (1 + p.danoBonus) * (1 + p.bonusRuido) * p.danoAtributo - 1) * 100)}%`)}
        ${v('Recarga', `−${Math.round(p.recarga * 100)}%`)}${v('Velocidade', `+${Math.round(p.velMov * 100)}%`)}
        ${v('Redução de dano', `${Math.round(p.reducaoDano * 100)}%`)}</div>`;
    },
    habs(p) {
      const disp = S().disponiveis(p);
      const slots = p.slots.map((id, i) => {
        const h = id && S().habilidade(id);
        return `<button class="slot ${selecao === i ? 'sel' : ''}" data-acao="slot" data-i="${i}"><small>Tecla ${i + 1}</small><b>${h ? esc(h.nome) : 'vazio'}</b></button>`;
      }).join('');
      const lista = disp.map(id => {
        const h = S().habilidade(id);
        return `<div class="cartao"><b>${esc(h.nome)}</b><small>${h.implante ? 'implante' : 'Mercenário'} · recarga ${h.cooldown}s · custo ${h.custo}</small>
          <p>${esc(h.efeito)}</p><div class="bts">${bt('pôr', selecao != null ? `Pôr na tecla ${selecao + 1}` : 'Escolha uma tecla acima', `data-id="${id}"`, selecao == null)}</div></div>`;
      }).join('');
      const pas = G.ARQUETIPO.habilidades.filter(h => h.tipo === 'passiva' && p.nivel >= h.nivelDesbloqueio)
        .map(h => `<div class="cartao"><b>${esc(h.nome)}</b><small>passiva</small><p>${esc(h.efeito)}</p></div>`).join('');
      return `<h3>Teclas 1 a 4</h3><div class="slots">${slots}</div>
        <h3>Disponíveis</h3><div class="grade">${lista}</div>${pas ? `<h3>Passivas</h3><div class="grade">${pas}</div>` : ''}`;
    },
    impl(p) {
      const esp = G.ESPACOS_IMPLANTE.map(e => {
        const id = p.implantes[e.id], m = id && G.IMPLANTES[id], livre = p.nivel >= e.nivelDesbloqueio;
        if (m) return `<div class="cartao"><small>${e.nome}</small><b>${esc(m.nome)}</b><small>${m.origem === 'lacrado' ? 'lacrado' : 'sem lacre'} · Ruído ${m.custo.ruido}</small><p>${esc(m.efeito)}</p></div>`;
        return `<div class="cartao vazio"><small>${e.nome}</small><p>${livre ? 'vazio · instale com a Dona Zilá ou na Vítrea' : `abre no nível ${e.nivelDesbloqueio}`}</p></div>`;
      }).join('');
      const est = G.ESTAGIOS.map(s => `<div class="cartao ${p.estagio.id === s.id ? 'sel' : ''}"><b>${s.nome}</b><small>${s.de}–${s.ate}</small><p>${esc(s.efeito)}</p></div>`).join('');
      const at = G.DADOS.atencao.niveis[p.atencao];
      return `<h3>Espaços</h3><div class="grade">${esp}</div>
        <h3>Ruído ${p.ruido}${p.calmante > 0 ? ` · calmante ${Math.ceil(p.calmante / 60)} min` : ''}</h3><div class="grade">${est}</div>
        <h3>Atenção ${p.atencao} · ${at.nome}</h3><p class="dica">${esc(at.efeito)}</p>
        <h3>Dívida ${ł(p.divida)} · limite ${ł(S().limiteDivida(p))}</h3>`;
    },
  };

  // ── lojas ───────────────────────────────────────────
  const LOJAS = {
    nicanor: [['comprar', 'Comprar'], ['vender', 'Vender'], ['injetor', 'Injetor']],
    zila: [['implantes', 'Implantes'], ['remover', 'Remover'], ['calmante', 'Calmante']],
    iara: [['caixa', 'Caixa lacrada']],
    bigorna: [['desmontar', 'Desmontar'], ['aprimorar', 'Aprimorar'], ['trocar', 'Trocar afixo']],
    tacita: [['atributos', 'Atributos'], ['suborno', 'Atenção'], ['modulos', 'Módulos']],
    concierge: [['lacrados', 'Implantes'], ['divida', 'Dívida']],
  };
  const FALAS = {
    nicanor: 'Seu Nicanor: “Tudo que eu tenho é seu, desde que você pague.”',
    zila: 'Dona Zilá: “Cada peça que eu costuro empresta um pedaço da sua cabeça. Escolhe bem.”',
    iara: 'Capitã Iara: “Caixa lacrada não se abre na frente de ninguém. Abre em casa.”',
    bigorna: 'Mestre Bigorna: “Sucata é só peça esperando cabeça.”',
    tacita: 'Tácita: “…”',
    concierge: 'Concierge: “A Vítrea financia o seu melhor.”',
  };
  function lojaTela(p, id, a) {
    const m = multMercado(p);
    switch (id + ':' + a) {
      case 'nicanor:comprar': {
        const its = S().estoqueNicanor(p);
        return `<div class="grade">${its.map((it, i) => cartaoItem(it, bt('comprar', 'Comprar ' + ł(G.precoCompra(it) * m), `data-i="${i}"`, p.lascas < G.precoCompra(it) * m), comparar(p, it))).join('') || '<p class="dica">Estoque vazio. Gira a cada biscate.</p>'}</div>`;
      }
      case 'nicanor:vender':
        return `<div class="grade">${p.mochila.map((it, i) => cartaoItem(it, bt('vender', 'Vender ' + ł(G.precoVenda(it)), `data-i="${i}"`))).join('') || '<p class="dica">Nada na mochila.</p>'}</div>`;
      case 'nicanor:injetor': {
        const falta = G.INJETOR.cargas - p.injetor.cargas, preco = S().precoInjetor(p) * m;
        return `<p>Injetor: ${p.injetor.cargas}/${G.INJETOR.cargas} cargas. Cada carga cura ${Math.round(G.INJETOR.cura * 100)}% da Vida.</p>${bt('injetor', `Recarregar 1 · ${ł(preco)}`, '', !falta || p.lascas < preco)}`;
      }
      case 'zila:implantes': case 'concierge:lacrados': {
        const origem = id === 'zila' ? 'sem_lacre' : 'lacrado';
        const mult = id === 'zila' ? m : p.atencao >= 2 ? 1.2 : 1;
        const lista = G.DADOS.implantes.filter(x => x.origem === origem && x.id !== 'diapasao');
        return `<div class="grade">${lista.map(x => {
          const esp = G.ESPACOS_IMPLANTE.find(e => e.id === x.espaco), livre = p.nivel >= esp.nivelDesbloqueio, preco = Math.round(x.custo.lascas * mult);
          const atual = p.implantes[x.espaco], ja = atual === x.id;
          const bts = ja ? '<small>instalado</small>' : !livre ? `<small>${esp.nome} abre no nível ${esp.nivelDesbloqueio}</small>`
            : bt('instalar', `${atual ? 'Trocar' : 'Instalar'} · ${ł(preco)}`, `data-id="${x.id}"`, p.lascas < preco) + (origem === 'lacrado' && x.custo.financiavel ? bt('financiar', 'Financiar', `data-id="${x.id}"`) : '');
          return `<div class="cartao"><b>${esc(x.nome)}</b><small>${esp.nome} · ${x.tipo} · Ruído +${x.custo.ruido}${x.custo.atencao ? ` · Atenção +${x.custo.atencao} nos portais` : ''}</small><p>${esc(x.efeito)}</p><div class="bts">${bts}</div></div>`;
        }).join('')}</div><p class="dica">Ruído atual ${p.ruido} · ${p.estagio.nome}. Trocar descarta o implante antigo.</p>`;
      }
      case 'zila:remover': {
        const inst = G.ESPACOS_IMPLANTE.filter(e => p.implantes[e.id]);
        return `<div class="grade">${inst.map(e => { const x = G.IMPLANTES[p.implantes[e.id]]; return `<div class="cartao"><b>${esc(x.nome)}</b><small>${e.nome}</small><div class="bts">${bt('remover', `Remover · volta ${ł(x.custo.lascas * 0.3)}`, `data-esp="${e.id}"`)}</div></div>`; }).join('') || '<p class="dica">Nenhum implante instalado.</p>'}</div>`;
      }
      case 'zila:calmante':
        return `<p>Calmante: −15 de Ruído por 5 minutos.${p.calmante > 0 ? ` Ainda faz efeito por ${Math.ceil(p.calmante / 60)} min.` : ''}</p>${bt('calmante', 'Tomar · ł 120', '', p.lascas < 120)}`;
      case 'iara:caixa':
        return `<p>Item sorteado no seu nível: 25% de chance de raro e 2% de lendário.</p>${bt('caixa', `Comprar caixa · ${ł(S().precoCaixa(p))}`, '', p.lascas < S().precoCaixa(p))}`;
      case 'bigorna:desmontar':
        return `<div class="grade">${p.mochila.map((it, i) => cartaoItem(it, bt('desmontar', `Desmontar · +${G.raridade(it.rar).pecas} peças`, `data-i="${i}"`))).join('') || '<p class="dica">Nada na mochila.</p>'}</div>`;
      case 'bigorna:aprimorar': case 'bigorna:trocar': {
        const refs = [...G.SLOTS_EQUIP.filter(k => p.equip[k]).map(k => ({ ref: `data-eq="${k}"`, it: p.equip[k] })), ...p.mochila.map((it, i) => ({ ref: `data-i="${i}"`, it }))];
        return `<div class="grade">${refs.map(({ ref, it }) => {
          if (a === 'aprimorar') { const c = S().custoAprimorar(it); return cartaoItem(it, it.aprimoramento >= 5 ? '<small>no máximo</small>' : bt('aprimorar', `+1 · ${c} peças`, ref, p.pecas < c)); }
          const c = S().custoTroca(it);
          return cartaoItem(it, Object.keys(it.afixos).map(k => bt('trocar', `Trocar ${k.replace('_', ' ')} · ${c} peças`, `${ref} data-afixo="${k}"`, p.pecas < c)).join('') || '<small>sem afixo</small>');
        }).join('') || '<p class="dica">Nada pra mexer.</p>'}</div>`;
      }
      case 'tacita:atributos':
        return `<p>Devolve todos os pontos de atributo pra você distribuir de novo.</p>${bt('redistribuir', `Redistribuir · ${ł(S().precoRedistribuir(p))}`, '', p.lascas < S().precoRedistribuir(p))}`;
      case 'tacita:suborno':
        return `<p>Atenção ${p.atencao}: ${esc(G.DADOS.atencao.niveis[p.atencao].nome)}.</p>${bt('subornar', `Baixar 1 · ${ł(S().precoSuborno(p))}`, '', !p.atencao || p.lascas < S().precoSuborno(p))}`;
      case 'tacita:modulos': {
        if (!p.modulosTacita || p.modulosTacita.nivel !== p.nivel) p.modulosTacita = { nivel: p.nivel, itens: [0, 1, 2].map(() => G.gerarItem(p.nivel, 1, Math.random, { slot: 'modulo' })) };
        return `<div class="grade">${p.modulosTacita.itens.map((it, i) => cartaoItem(it, bt('modulo', 'Comprar ' + ł(G.precoCompra(it)), `data-i="${i}"`, p.lascas < G.precoCompra(it)))).join('') || '<p class="dica">Volte no próximo nível.</p>'}</div>`;
      }
      case 'concierge:divida': {
        const lim = S().limiteDivida(p);
        return `<p>Dívida com a Fiança Áurea: ${ł(p.divida)}. Limite: ${ł(lim)}. Juros de 3% a cada biscate.</p>
          <p class="dica">Acima do limite, Cobradores vêm atrás de você. Acima de 2× o limite, os implantes lacrados travam.</p>
          ${bt('pagar', `Pagar 25% · ${ł(Math.ceil(p.divida * 0.25))}`, '', !p.divida || p.lascas < 1)}${bt('quitar', `Quitar · ${ł(p.divida)}`, '', !p.divida || p.lascas < p.divida)}`;
      }
    }
    return '';
  }

  // ── ações ───────────────────────────────────────────
  function agir(el) {
    const p = J.p, a = el.dataset.acao, i = el.dataset.i != null ? +el.dataset.i : null;
    const ref = el.dataset.eq ? { equip: el.dataset.eq } : { i };
    const m = multMercado(p);
    switch (a) {
      case 'equipar': S().equipar(p, i); break;
      case 'tirar': if (!S().desequipar(p, el.dataset.slot)) aviso('Mochila cheia', COR.coral); break;
      case 'largar': { const it = p.mochila.splice(i, 1)[0]; if (it) J.loot.push({ tipo: 'item', item: it, x: p.x + 30, y: p.y + 10, vx: 0, vy: 0, t: -2, z: 0, vz: 0 }); break; }
      case 'ponto': S().gastarPonto(p, el.dataset.id); break;
      case 'slot': selecao = selecao === i ? null : i; break;
      case 'pôr': if (selecao != null) { S().trocarSlot(p, selecao, el.dataset.id); selecao = null; } break;
      case 'comprar': { const r = S().comprar(p, i, m); if (r !== 'ok') aviso(r === 'mochila' ? 'Mochila cheia' : 'Lascas não bastam', COR.coral); break; }
      case 'vender': aviso(`Vendido por ${ł(S().vender(p, ref))}`, COR.ambar); G.som.moeda(); break;
      case 'injetor': { const preco = S().precoInjetor(p) * m; if (p.lascas >= preco && p.injetor.cargas < G.INJETOR.cargas) { p.lascas -= preco; p.injetor.cargas++; G.som.injetor(); } break; }
      case 'instalar': case 'financiar': {
        const x = G.IMPLANTES[el.dataset.id], mult = x.origem === 'sem_lacre' ? m : p.atencao >= 2 ? 1.2 : 1;
        const r = S().instalar(p, x.id, { financiar: a === 'financiar', multPreco: mult });
        if (r === 'ok') { aviso(`${x.nome} instalado · Ruído ${S().ruido(p)}`, COR.lavanda); G.som.escudo(); G.som.dor(); }
        else aviso(r === 'lascas' ? 'Lascas não bastam' : 'Não dá pra instalar agora', COR.coral);
        break;
      }
      case 'remover': aviso(`Implante removido · +${ł(S().remover(p, el.dataset.esp))}`, COR.lavanda); break;
      case 'calmante': if (S().calmante(p)) aviso('Calmante: −15 de Ruído por 5 minutos', COR.lavanda); break;
      case 'caixa': { const r = S().caixaLacrada(p); if (typeof r === 'object') { aviso(`Caixa: ${r.nome}`, G.raridade(r.rar).cor); G.som.item(G.indiceRaridade(r.rar)); } else aviso(r === 'mochila' ? 'Mochila cheia' : 'Lascas não bastam', COR.coral); break; }
      case 'desmontar': aviso(`+${S().desmontar(p, ref)} peças`, COR.suave); G.som.metal(); break;
      case 'aprimorar': if (S().aprimorar(p, ref)) { aviso('Aprimorado', COR.ambar); G.som.metal(); } break;
      case 'trocar': if (S().trocarAfixo(p, ref, el.dataset.afixo)) { aviso('Afixo trocado', COR.ambar); G.som.metal(); } break;
      case 'redistribuir': if (S().redistribuir(p)) aviso('Pontos devolvidos', COR.menta); break;
      case 'subornar': if (S().subornar(p)) aviso(`Atenção ${p.atencao}`, COR.menta); break;
      case 'modulo': { const it = p.modulosTacita.itens[i], c = G.precoCompra(it); if (p.lascas >= c && S().guardar(p, it)) { p.lascas -= c; p.modulosTacita.itens.splice(i, 1); } break; }
      case 'pagar': aviso(`Pagou ${ł(S().pagar(p, Math.ceil(p.divida * 0.25)))}`, COR.ambar); break;
      case 'quitar': aviso(`Pagou ${ł(S().pagar(p, p.divida))}`, COR.ambar); break;
    }
    G.recalcular();
    desenhar();
  }

  // ── abrir, desenhar, fechar ─────────────────────────
  function desenhar() {
    const p = J.p;
    const abas = modo === 'personagem' ? ABAS_PERSONAGEM : LOJAS[npc];
    $('abas').innerHTML = (modo === 'loja' ? `<b class="quem">${esc(G.NPCS[npc].nome)}</b>` : '') +
      abas.map(([k, n]) => `<button class="aba ${k === aba ? 'sel' : ''}" data-aba="${k}">${n}${k === 'atrib' && p.pontos ? ` (${p.pontos})` : ''}</button>`).join('');
    $('saldo').textContent = `${ł(p.lascas)} · ⚙ ${p.pecas}`;
    let html = modo === 'personagem' ? TELAS[aba](p) : lojaTela(p, npc, aba);
    if (modo === 'loja' && npc === 'concierge' && p.atencao > 2) html = `<p>${esc(FALAS.concierge)}</p><p class="dica">A Concierge não atende quem tem Atenção acima de 2. Fale com a Tácita, no Subsolo.</p>`;
    $('conteudo').innerHTML = html;
  }
  function abrir(m, opcao) {
    modo = m; selecao = null;
    if (m === 'personagem') aba = opcao || aba || 'equip';
    else { npc = opcao; aba = LOJAS[npc][0][0]; aviso(FALAS[npc], COR.lavanda); }
    if (m === 'personagem' && !ABAS_PERSONAGEM.some(x => x[0] === aba)) aba = 'equip';
    desenhar();
    $('janela').hidden = false;
  }
  function fechar() { $('janela').hidden = true; modo = null; aoFechar(); }

  $('abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) { aba = b.dataset.aba; selecao = null; desenhar(); } });
  $('conteudo').addEventListener('click', e => { const b = e.target.closest('[data-acao]'); if (b && !b.disabled) agir(b); });
  $('fechar').addEventListener('click', fechar);
  addEventListener('keydown', e => { if (modo && (e.code === 'Escape' || e.code === 'KeyI' || e.code === 'Tab' || (e.code === 'KeyE' && modo === 'loja'))) { e.preventDefault(); e.stopImmediatePropagation(); fechar(); } }, true);

  G.paineis = { abrir, fechar, aberto: () => !!modo, ligar(f) { aoFechar = f; } };
})();

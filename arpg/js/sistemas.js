'use strict';
// Sistemas do personagem: atributos, mochila e equipamento, implantes, Ruído, Atenção,
// dívida e as habilidades escolhidas pras teclas 1 a 4. Tudo sem DOM: o teste roda isto.
(() => {
  const G = window.G, D = G.DADOS;
  const IMPL = {};
  for (const m of D.implantes) IMPL[m.id] = m;
  G.IMPLANTES = IMPL;
  G.ESPACOS_IMPLANTE = D.espacosDeImplante;
  G.ESTAGIOS = D.ruido.estagios;
  const MOCHILA_MAX = 24;
  const SLOTS_EQUIP = ['arma', 'jaqueta', 'luvas', 'botas', 'modulo1', 'modulo2'];
  G.SLOTS_EQUIP = SLOTS_EQUIP;
  G.MOCHILA_MAX = MOCHILA_MAX;
  const espacoDe = s => (s.startsWith('modulo') ? 'modulo' : s);
  const merc = () => G.ARQUETIPO;

  // ── estado inicial / save antigo ──
  function preparar(p, s = {}) {
    p.atrib = s.atrib || Object.fromEntries(G.ATRIBUTOS.map(a => [a.id, a.inicial]));
    p.pontos = s.pontos ?? 3 * ((s.nivel || 1) - 1);
    p.mochila = s.mochila || [];
    const eq = s.equip || {};
    p.equip = Object.fromEntries(SLOTS_EQUIP.map(k => [k, eq[k] || null]));
    p.implantes = s.implantes || Object.fromEntries(G.ESPACOS_IMPLANTE.map(e => [e.id, null]));
    p.pecas = s.pecas || 0;
    p.ruidoHist = s.ruidoHist || 0;
    p.calmante = s.calmante || 0;
    p.atencao = s.atencao || 0;
    p.divida = s.divida || 0;
    p.chefes = s.chefes || {};
    p.estoque = s.estoque || null;
    p.slots = s.slots || [null, null, null, null];
    for (const it of [...p.mochila, ...Object.values(p.equip)]) if (it) { it.afixos = it.afixos || {}; it.aprimoramento = it.aprimoramento || 0; it.trocas = it.trocas || 0; }
    ajustarSlots(p);
  }
  const salvar = p => ({ atrib: p.atrib, pontos: p.pontos, mochila: p.mochila, equip: p.equip, implantes: p.implantes, pecas: p.pecas,
    ruidoHist: p.ruidoHist, calmante: p.calmante, atencao: p.atencao, divida: p.divida, chefes: p.chefes, estoque: p.estoque, slots: p.slots });

  // ── contas ──
  function soma(p, afixo) {
    let v = 0;
    for (const k of SLOTS_EQUIP) { const it = p.equip[k]; if (it && it.afixos[afixo]) v += it.afixos[afixo]; }
    return v;
  }
  function principal(it, campo) { return it && it[campo] ? it[campo] * (1 + 0.1 * (it.aprimoramento || 0)) : 0; }
  const implantes = p => Object.values(p.implantes).filter(Boolean).map(id => IMPL[id]);
  const temImplante = (p, id) => Object.values(p.implantes).includes(id);
  const lendario = (p, id) => SLOTS_EQUIP.some(k => p.equip[k] && p.equip[k].lendario === id);

  function atributos(p) {
    const at = { ...p.atrib };
    for (const k of SLOTS_EQUIP) { const it = p.equip[k]; if (it && it.afixos.atributo && it.atributo) at[it.atributo] += it.afixos.atributo; }
    return at;
  }

  function ruido(p) {
    const at = atributos(p);
    let v = implantes(p).reduce((a, m) => a + m.custo.ruido, 0) + p.ruidoHist;
    v -= Math.min(20, Math.max(0, at.mente - 5)) + soma(p, 'tolerancia_ruido');
    if (p.calmante > 0) v -= 15;
    return G.clamp(Math.round(v), 0, 100);
  }
  const estagioDe = v => G.ESTAGIOS.find(e => v >= e.de && v <= e.ate) || G.ESTAGIOS[0];

  // recalcula tudo que o combate usa
  function calcular(p, contexto = {}) {
    const at = p.atr = atributos(p);
    const imp = implantes(p), pas = k => imp.reduce((a, m) => a + ((m.passivo && m.passivo[k]) || 0), 0);
    p.hpMax = Math.round(G.vidaMax(p.nivel, at.corpo, soma(p, 'vida') + pas('vida')));
    p.cargaMax = G.CARGA_MAX + (at.mente - 5) + soma(p, 'carga_max');
    p.cargaRegen = G.CARGA_REGEN + 0.1 * (at.mente - 5) + soma(p, 'carga_regen');
    p.potencia = principal(p.equip.arma, 'potencia');
    p.armadura = ['jaqueta', 'luvas', 'botas'].reduce((a, k) => a + principal(p.equip[k], 'armadura'), 0) + soma(p, 'armadura');
    p.critico = G.CRITICO.chanceBase + 0.005 * (at.reflexo - 5) + soma(p, 'chance_critica') / 100 + pas('chanceCritica');
    p.critLonge = pas('chanceCriticaLonge');
    p.danoCritico = G.CRITICO.multiplicador + soma(p, 'dano_critico') / 100;
    p.velAtaque = soma(p, 'vel_ataque') / 100;
    p.recarga = soma(p, 'recarga') / 100 - pas('recarga');
    p.recargaEsquiva = Math.min(0.25, 0.005 * Math.max(0, at.reflexo - 5));
    p.velMov = soma(p, 'vel_movimento') / 100 + pas('velocidade');
    p.rouboVida = soma(p, 'roubo_vida') / 100;
    p.lascasBonus = soma(p, 'lascas') / 100;
    p.duracao = 1 + 0.015 * (at.tecnica - 5);
    p.danoAtributo = 1 + 0.02 * (at.corpo - 5);
    p.danoBonus = pas('danoBonus');
    let reduz = 1;
    for (const h of G.KIT.passivas) if (h.id === 'merc_couro_grosso' && p.nivel >= h.nivelDesbloqueio) reduz *= 1 - h.base.reducaoDano;
    if (p.nivel >= 23) reduz *= 1 - 0.05;   // Couro Curtido
    reduz *= 1 - pas('reducaoDano');
    p.reducaoDano = 1 - reduz;
    p.chanceQueimar = temImplante(p, 'mao_de_solda') ? IMPL.mao_de_solda.passivo : null;
    p.desvio = temImplante(p, 'reflexo_emprestado') ? IMPL.reflexo_emprestado.passivo.intervalo : 0;
    p.visaoParedes = pas('visaoParedes') * G.M;
    p.mostraVida = temImplante(p, 'mira_vitrea_m2');
    p.escondeVida = temImplante(p, 'anestesia_de_rua') ? IMPL.anestesia_de_rua.passivo.escondeVidaAbaixo : 0;
    p.lend = new Set(SLOTS_EQUIP.map(k => p.equip[k] && p.equip[k].lendario).filter(Boolean));
    if (p.lend.has('capa_de_enchente') && contexto.chuva > 0.3) { p.velMov += 0.15; p.recargaEsquiva += 0.3; }
    // Ruído: o bônus vem do valor real; os efeitos ruins, do valor menos 15 com o Módulo Surdo
    p.ruido = ruido(p);
    p.estagio = estagioDe(p.ruido);
    p.estagioRuim = estagioDe(Math.max(0, p.ruido - (p.lend.has('modulo_surdo') ? 15 : 0)));
    p.bonusRuido = p.estagio.bonusDano;
    if (p.estagio.id === 'afinado') p.recarga += 0.25;
    p.hp = Math.min(p.hp ?? p.hpMax, p.hpMax);
    p.carga = Math.min(p.carga ?? p.cargaMax, p.cargaMax);
  }

  // ── habilidades nas teclas 1 a 4 ──
  // o conjunto ativo sai das habilidades do arquétipo e dos implantes ativos instalados
  function disponiveis(p) {
    const lista = merc().habilidades.filter(h => (h.categoria === 'habilidade' || h.categoria === 'suprema') && p.nivel >= h.nivelDesbloqueio).map(h => h.id);
    for (const m of implantes(p)) if (m.tipo === 'ativo' && m.id !== 'diapasao') lista.push(m.id);
    return lista;
  }
  function ajustarSlots(p) {
    const ok = new Set(disponiveis(p));
    p.slots = p.slots.map(id => (id && ok.has(id) ? id : null));
    for (const id of ok) if (!p.slots.includes(id)) { const i = p.slots.indexOf(null); if (i >= 0) p.slots[i] = id; }
  }
  function trocarSlot(p, i, id) {
    if (id && !disponiveis(p).includes(id)) return false;
    const j = p.slots.indexOf(id);
    if (j >= 0) p.slots[j] = p.slots[i];
    p.slots[i] = id;
    return true;
  }
  // descrição uniforme de uma habilidade (do arquétipo ou de implante)
  function habilidade(id) {
    const h = merc().habilidades.find(x => x.id === id);
    if (h) return h;
    const m = IMPL[id];
    return m && { id: m.id, nome: m.nome, efeito: m.efeito, cooldown: m.habilidade.cooldown, custo: m.habilidade.custo, base: m.habilidade.base, escala: m.habilidade.escala, implante: true };
  }

  // ── atributos ──
  function gastarPonto(p, id) { if (p.pontos <= 0 || !(id in p.atrib)) return false; p.atrib[id]++; p.pontos--; return true; }
  const precoRedistribuir = p => Math.round(500 * p.nivel / 5);
  function redistribuir(p) {
    const preco = precoRedistribuir(p);
    if (p.lascas < preco) return false;
    p.lascas -= preco;
    for (const a of G.ATRIBUTOS) { p.pontos += p.atrib[a.id] - a.inicial; p.atrib[a.id] = a.inicial; }
    return true;
  }

  // ── mochila e equipamento ──
  function guardar(p, it) { if (p.mochila.length >= MOCHILA_MAX) return false; p.mochila.push(it); return true; }
  function equipar(p, i) {
    const it = p.mochila[i];
    if (!it) return false;
    let alvo = it.slot;
    if (alvo === 'modulo') alvo = !p.equip.modulo1 ? 'modulo1' : !p.equip.modulo2 ? 'modulo2' : 'modulo1';
    const velho = p.equip[alvo];
    p.equip[alvo] = it;
    if (velho) p.mochila[i] = velho; else p.mochila.splice(i, 1);
    return true;
  }
  function desequipar(p, slot) {
    const it = p.equip[slot];
    if (!it || !guardar(p, it)) return false;
    p.equip[slot] = null;
    return true;
  }
  const item = (p, ref) => (ref.equip ? p.equip[ref.equip] : p.mochila[ref.i]);
  function tirar(p, ref) { if (ref.equip) { const it = p.equip[ref.equip]; p.equip[ref.equip] = null; return it; } return p.mochila.splice(ref.i, 1)[0]; }
  function vender(p, ref, mult = 1) { const it = item(p, ref); if (!it) return 0; const v = Math.round(G.precoVenda(it) * mult); tirar(p, ref); p.lascas += v; return v; }
  function desmontar(p, ref) { const it = item(p, ref); if (!it) return 0; const v = G.raridade(it.rar).pecas; tirar(p, ref); p.pecas += v; return v; }
  const custoAprimorar = it => 10 * ((it.aprimoramento || 0) + 1) * (G.indiceRaridade(it.rar) + 1);
  function aprimorar(p, ref) {
    const it = item(p, ref);
    if (!it || it.aprimoramento >= 5) return false;
    const c = custoAprimorar(it);
    if (p.pecas < c) return false;
    p.pecas -= c; it.aprimoramento++;
    return true;
  }
  const custoTroca = it => 25 * Math.pow(2, it.trocas || 0);
  function trocarAfixo(p, ref, afixo, sortear = Math.random) {
    const it = item(p, ref);
    if (!it || !(afixo in it.afixos)) return false;
    const c = custoTroca(it);
    if (p.pecas < c) return false;
    p.pecas -= c; it.trocas = (it.trocas || 0) + 1;
    delete it.afixos[afixo];
    if (afixo === 'atributo') delete it.atributo;
    G.rolarAfixo(it, sortear, false, afixo);
    return true;
  }

  // ── implantes ──
  const espacoLivre = (p, espaco) => p.nivel >= G.ESPACOS_IMPLANTE.find(e => e.id === espaco).nivelDesbloqueio;
  function instalar(p, id, { financiar = false, multPreco = 1 } = {}) {
    const m = IMPL[id];
    if (!m || !espacoLivre(p, m.espaco)) return 'espaco';
    const preco = Math.round(m.custo.lascas * multPreco);
    if (financiar) { if (!m.custo.financiavel) return 'financiamento'; p.divida += preco; }
    else { if (p.lascas < preco) return 'lascas'; p.lascas -= preco; }
    p.implantes[m.espaco] = id;
    ajustarSlots(p);
    return 'ok';
  }
  function remover(p, espaco) {
    const id = p.implantes[espaco];
    if (!id) return 0;
    const volta = Math.round(IMPL[id].custo.lascas * 0.3);
    p.implantes[espaco] = null; p.lascas += volta;
    ajustarSlots(p);
    return volta;
  }
  function calmante(p) { if (p.lascas < 120) return false; p.lascas -= 120; p.calmante = 300; return true; }

  // ── Atenção e dívida ──
  // portais de varredura nas Docas e nas Torres pegam implante sem lacre
  function passarPortal(p) {
    const soma = implantes(p).filter(m => m.origem === 'sem_lacre').reduce((a, m) => a + m.custo.atencao, 0);
    if (!soma) return 0;
    const antes = p.atencao;
    p.atencao = Math.min(5, p.atencao + soma);
    return p.atencao - antes;
  }
  const precoSuborno = p => 400 * p.atencao;
  function subornar(p) { const c = precoSuborno(p); if (p.atencao <= 0 || p.lascas < c) return false; p.lascas -= c; p.atencao--; return true; }
  const limiteDivida = p => 1500 + 400 * p.nivel;
  function juros(p) { if (p.divida > 0) p.divida = Math.round(p.divida * (1 + D.divida.juros)); }
  function pagar(p, valor) { const v = Math.min(valor, p.divida, p.lascas); p.divida -= v; p.lascas -= v; return v; }
  // um implante lacrado trava com dívida acima de 2× o limite
  const lacradoTravado = p => p.divida > 2 * limiteDivida(p);

  // ── lojas ──
  function estoqueNicanor(p, sortear = Math.random) {
    if (!p.estoque || p.estoque.biscate !== p.biscate.i || p.estoque.nivel !== p.nivel) {
      const itens = [];
      for (let i = 0; i < 6; i++) itens.push(G.gerarItem(p.nivel, 0, sortear, { pesos: { comum: 0.7, incomum: 0.3, raro: 0, lendario: 0 } }));
      p.estoque = { biscate: p.biscate.i, nivel: p.nivel, itens };
    }
    return p.estoque.itens;
  }
  function comprar(p, i, mult = 1) {
    const it = p.estoque && p.estoque.itens[i];
    if (!it) return 'nada';
    const preco = Math.round(G.precoCompra(it) * mult);
    if (p.lascas < preco) return 'lascas';
    if (!guardar(p, it)) return 'mochila';
    p.lascas -= preco; p.estoque.itens.splice(i, 1);
    return 'ok';
  }
  const precoInjetor = p => 20 * p.nivel;
  const precoCaixa = p => 150 * p.nivel;
  function caixaLacrada(p, sortear = Math.random) {
    const preco = precoCaixa(p);
    if (p.lascas < preco) return 'lascas';
    if (p.mochila.length >= MOCHILA_MAX) return 'mochila';
    p.lascas -= preco;
    const it = G.gerarItem(p.nivel, 0, sortear, { pesos: { comum: 0.5, incomum: 0.23, raro: 0.25, lendario: 0.02 } });
    guardar(p, it);
    return it;
  }

  G.sistemas = {
    preparar, salvar, calcular, ruido, estagioDe, disponiveis, ajustarSlots, trocarSlot, habilidade, temImplante, lendario,
    gastarPonto, redistribuir, precoRedistribuir, guardar, equipar, desequipar, item, vender, desmontar, aprimorar, custoAprimorar,
    trocarAfixo, custoTroca, espacoLivre, instalar, remover, calmante, passarPortal, subornar, precoSuborno, limiteDivida, juros,
    pagar, lacradoTravado, estoqueNicanor, comprar, precoInjetor, precoCaixa, caixaLacrada, espacoDe,
  };
})();

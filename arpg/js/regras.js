'use strict';
// Regras do jogo tiradas de G.DADOS (js/dados.js). Aqui os números do dossiê viram
// valores de mundo: metros em unidades, fórmulas em funções. Sem DOM: o teste roda isto.
(() => {
  const G = window.G, D = G.DADOS, M = G.M;
  const F = D.formulas;

  // ── Bairros: geometria da cidade aqui, cor e nível no dossiê ──
  const GEO = {
    mercado: { id: 'mercado_baixo', centro: [0, 0], peso: 1.15, alt: [70, 170], dens: 0.72, prop: 'barraca',
      placas: ['PASTEL', 'CONSERTO', 'FEIRA', 'LASCA', 'CHAVEIRO', 'BAR', 'XEROX', 'PENSÃO'] },
    docas: { id: 'docas', centro: [12, 2], peso: 1, alt: [40, 110], dens: 0.5, prop: 'container',
      placas: ['CORDAME', 'ESTIVA', 'FRIGORÍFICO', 'BAR DO CAIS', 'GALPÃO 7'] },
    ferro: { id: 'ferro_velho', centro: [1, 12], peso: 1, alt: [30, 90], dens: 0.45, prop: 'sucata',
      placas: ['SUCATA', 'SOLDA', 'PEÇAS', 'COMPRO COBRE'] },
    subsolo: { id: 'subsolo', centro: [-12, 3], peso: 1, alt: [50, 120], dens: 0.65, prop: 'cano',
      placas: ['LINHA 4', 'SAÍDA', 'CORO', 'SILÊNCIO'] },
    torres: { id: 'torres', centro: [0, -12], peso: 1, alt: [140, 260], dens: 0.85, prop: 'pilar',
      placas: ['VÍTREA', 'FIANÇA ÁUREA', 'RECEPÇÃO'] },
  };
  G.BAIRROS = {};
  for (const [k, geo] of Object.entries(GEO)) {
    const b = D.bairros.find(x => x.id === geo.id);
    G.BAIRROS[k] = Object.assign({ chave: k, nome: b.nome, nivel: b.niveis, pal: b.paleta, clima: b.clima }, geo);
  }

  // ── Jogador ──
  const merc = D.arquetipos.find(a => a.id === 'mercenario');
  const hab = id => merc.habilidades.find(h => h.id === id);
  G.ARQUETIPO = merc;
  G.KIT = {
    basico: hab('merc_disparo_curto'),
    esquiva: hab('merc_rolamento'),
    // os quatro espaços das teclas 1 a 4, na ordem de desbloqueio
    slots: [hab('merc_varredura'), hab('merc_investida'), hab('merc_granada'), hab('merc_peito_aberto')],
    passivas: [hab('merc_couro_grosso')],
  };
  G.NIVEL_MAX = F.jogador.nivelMaximo;
  G.xpPara = n => Math.round(100 * Math.pow(n, 1.5));
  G.vidaMax = (nivel, corpo = 5, extra = 0) => merc.vidaBase + 14 * (nivel - 1) + 8 * (corpo - 5) + extra;
  G.CARGA_MAX = merc.cargaBase;
  G.CARGA_REGEN = 6;
  G.VELOCIDADE = F.jogador.velocidade * M;
  G.CRITICO = F.critico;
  G.INJETOR = F.injetor;

  // dano de uma habilidade no nível do jogador, antes de arma e crítico
  G.danoBase = (h, nivel, campo = 'dano') => {
    const por = (h.escala && h.escala.porNivel && h.escala.porNivel[campo]) || 0;
    return h.base[campo] + por * (nivel - 1);
  };

  // ── Inimigos ──
  G.INIMIGOS = {};
  for (const i of D.inimigos) G.INIMIGOS[i.id] = i;
  G.inimigoNoNivel = (id, nivel) => {
    const i = G.INIMIGOS[id], n = nivel - 1;
    return {
      vida: Math.round(i.vida * Math.pow(1.16, n)),
      dano: i.dano * Math.pow(1.11, n),
      xp: Math.round(i.xp * Math.pow(1.10, n)),
      alcance: i.alcance * M, velocidade: i.velocidade * M,
      intervalo: i.intervaloAtaque, aviso: i.telegrafo,
    };
  };
  // porta de nível: inimigo bem acima do jogador apanha menos e bate mais
  G.portaDeNivel = (nivelInimigo, nivelJogador) => {
    const d = nivelInimigo - nivelJogador;
    return {
      danoCausado: d >= 3 ? Math.max(0.25, 1 - 0.15 * (d - 2)) : 1,
      danoRecebido: d >= 3 ? 1 + 0.2 * (d - 2) : 1,
      xp: d <= -5 ? 0.25 : 1,
    };
  };
  G.reducaoArmadura = (armadura, nivelInimigo) => armadura / (armadura + 50 + 10 * nivelInimigo);

  // ── Loot (só o que o protótipo usa) ──
  const P = D.prototipo;
  G.RARIDADES = D.raridades.filter(r => P.raridades.includes(r.id));
  G.AFIXOS = D.afixos.filter(a => P.afixos.includes(a.id));
  G.ESPACOS = D.espacosDeEquipamento.filter(e => P.espacosDeEquipamento.includes(e.id));
  G.NOMES_ITEM = {
    arma: ['Escopeta Serrada', 'Doze de Cano Curto', 'Bacamarte', 'Pump de Feira'],
    jaqueta: ['Sobretudo', 'Jaqueta de Couro', 'Capa de Lona', 'Colete de Estiva'],
  };
  const sorteiaRaridade = (sortear, min = 0) => {
    const rs = G.RARIDADES.slice(min), total = rs.reduce((a, r) => a + r.chance, 0);
    let s = sortear() * total;
    for (const r of rs) if ((s -= r.chance) < 0) return r;
    return rs[rs.length - 1];
  };
  G.gerarItem = (nivel, minRar = 0, sortear = Math.random) => {
    const rar = sorteiaRaridade(sortear, minRar);
    const slot = sortear() < 0.5 ? 'arma' : 'jaqueta';
    const it = { slot, rar: rar.id, nivel, afixos: {} };
    const nomes = G.NOMES_ITEM[slot];
    it.nome = nomes[(sortear() * nomes.length) | 0];
    if (slot === 'arma') it.potencia = +(0.06 * nivel * rar.multPotencia).toFixed(3);
    else it.armadura = Math.round(4 * nivel * rar.multPotencia);
    const cabem = G.AFIXOS.filter(a => a.onde.includes(slot));
    const n = rar.afixos[0] + Math.floor(sortear() * (rar.afixos[1] - rar.afixos[0] + 1));
    for (let i = 0; i < n && cabem.length; i++) {
      const a = cabem.splice((sortear() * cabem.length) | 0, 1)[0];
      const v = a.min + sortear() * (a.max - a.min) + (a.porNivel || 0) * (nivel - 1);
      it.afixos[a.id] = Math.round(v);
      if (i === 0) it.nome += ' ' + a.nome;
    }
    return it;
  };
  // pra decidir se troca: quanto o item rende, numa conta só
  G.poderItem = it => {
    if (!it) return 0;
    const a = it.afixos || {};
    return (it.potencia || 0) * 100 + (it.armadura || 0) * 0.8 + (a.vida || 0) * 0.5 +
      (a.vel_ataque || 0) * 1.2 + (a.chance_critica || 0) * 1.5 + (a.recarga || 0) * 1.2;
  };
  G.raridade = id => D.raridades.find(r => r.id === id);
  G.precoVenda = it => Math.ceil(G.raridade(it.rar).venda * (1 + it.nivel * 0.25));

  // ── Biscates do Ato I, em ordem ──
  G.BISCATES = [
    { id: 'zila', titulo: 'QUEM VOLTOU DIFERENTE', texto: 'Ache a barraca de Dona Zilá', alvo: 'zila' },
    { id: 'portao', titulo: 'QUEM VOLTOU DIFERENTE', texto: 'Derrube um Portão dos Goteiras', abates: 'portao', meta: 1 },
    { id: 'rua', titulo: 'QUEM VOLTOU DIFERENTE', texto: 'Limpe a rua: 25 Goteiras', abates: 'goteira', meta: 25 },
    { id: 'nivel5', titulo: 'QUEM VOLTOU DIFERENTE', texto: 'Chegue ao nível 5 e volte à Dona Zilá', alvo: 'zila', nivel: 5 },
  ];
  G.ZILA_QUADRA = [2, -1];   // ateliê nos fundos da feira
})();

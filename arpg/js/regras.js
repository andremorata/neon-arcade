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

  // ── Loot ──
  G.RARIDADES = D.raridades;
  G.AFIXOS = D.afixos;
  G.ESPACOS = D.espacosDeEquipamento;
  G.LENDARIOS = D.lendarios;
  G.ATRIBUTOS = D.atributos;
  G.NOMES_ITEM = {
    arma: ['Escopeta Serrada', 'Doze de Cano Curto', 'Bacamarte', 'Pump de Feira'],
    jaqueta: ['Sobretudo', 'Jaqueta de Couro', 'Capa de Lona', 'Colete de Estiva'],
    luvas: ['Luvas de Couro', 'Luvas de Estiva', 'Mitenes Remendadas'],
    botas: ['Coturno', 'Botas de Borracha', 'Tênis de Corrida'],
    modulo: ['Módulo de Sinal', 'Placa Recondicionada', 'Chip de Feira'],
  };
  // valor principal de cada espaço: potência na arma, armadura nas roupas
  const PRINCIPAL = { arma: n => ({ potencia: 0.06 * n }), jaqueta: n => ({ armadura: 4 * n }), luvas: n => ({ armadura: 2 * n }), botas: n => ({ armadura: 2 * n }), modulo: () => ({}) };
  const sorteiaRaridade = (sortear, min = 0, pesos) => {
    const rs = G.RARIDADES.slice(min), ch = r => (pesos && pesos[r.id] != null ? pesos[r.id] : r.chance);
    const total = rs.reduce((a, r) => a + ch(r), 0);
    let s = sortear() * total;
    for (const r of rs) if ((s -= ch(r)) < 0) return r;
    return rs[rs.length - 1];
  };
  G.gerarItem = (nivel, minRar = 0, sortear = Math.random, opcoes = {}) => {
    const rar = opcoes.rar ? G.raridade(opcoes.rar) : sorteiaRaridade(sortear, minRar, opcoes.pesos);
    const espacos = opcoes.espacos || ['arma', 'jaqueta', 'luvas', 'botas', 'modulo'];
    const slot = opcoes.slot || espacos[(sortear() * espacos.length) | 0];
    const it = { slot, rar: rar.id, nivel, afixos: {}, aprimoramento: 0, trocas: 0 };
    const nomes = G.NOMES_ITEM[slot];
    it.nome = nomes[(sortear() * nomes.length) | 0];
    const base = PRINCIPAL[slot](nivel);
    if (base.potencia) it.potencia = +(base.potencia * rar.multPotencia).toFixed(3);
    if (base.armadura) it.armadura = Math.round(base.armadura * rar.multPotencia);
    if (rar.poderUnico) {
      const l = G.LENDARIOS.find(x => x.espaco === slot);
      if (l) { it.lendario = l.id; it.nome = l.nome; }
    }
    const n = rar.afixos[0] + Math.floor(sortear() * (rar.afixos[1] - rar.afixos[0] + 1)) + (slot === 'modulo' ? 1 : 0);
    for (let i = 0; i < n; i++) if (!G.rolarAfixo(it, sortear, i === 0 && !it.lendario)) break;
    return it;
  };
  // sorteia um afixo que caiba no espaço e ainda não esteja no item
  G.rolarAfixo = (it, sortear = Math.random, batiza = false, exceto) => {
    const cabem = G.AFIXOS.filter(a => a.onde.includes(it.slot) && !(a.id in it.afixos) && a.id !== exceto);
    if (!cabem.length) return false;
    const a = cabem[(sortear() * cabem.length) | 0];
    let v = a.min + sortear() * (a.max - a.min) + (a.porNivel || 0) * (it.nivel - 1);
    v = a.unidade === '/s' ? +v.toFixed(1) : Math.round(v);
    it.afixos[a.id] = v;
    let sufixo = a.nome;
    if (a.id === 'atributo') {
      const at = G.ATRIBUTOS[(sortear() * G.ATRIBUTOS.length) | 0];
      it.atributo = at.id; sufixo = 'de ' + at.nome;
    }
    if (batiza) it.nome += ' ' + sufixo;
    return true;
  };
  // pra comparar itens: quanto o item rende, numa conta só
  G.poderItem = it => {
    if (!it) return 0;
    const a = it.afixos || {}, ap = 1 + 0.1 * (it.aprimoramento || 0);
    return (it.potencia || 0) * 100 * ap + (it.armadura || 0) * 0.8 * ap + (a.vida || 0) * 0.5 + (a.armadura || 0) * 0.8 +
      (a.vel_ataque || 0) * 1.2 + (a.chance_critica || 0) * 1.5 + (a.dano_critico || 0) * 0.4 + (a.recarga || 0) * 1.2 +
      (a.carga_max || 0) * 0.3 + (a.carga_regen || 0) * 4 + (a.vel_movimento || 0) * 1 + (a.roubo_vida || 0) * 4 +
      (a.lascas || 0) * 0.3 + (a.atributo || 0) * 3 + (a.tolerancia_ruido || 0) * 1 + (it.lendario ? 40 : 0);
  };
  G.raridade = id => D.raridades.find(r => r.id === id);
  G.indiceRaridade = id => D.raridades.findIndex(r => r.id === id);
  G.precoVenda = it => Math.ceil(G.raridade(it.rar).venda * (1 + it.nivel * 0.25) * (1 + 0.3 * (it.aprimoramento || 0)));
  G.precoCompra = it => G.precoVenda(it) * 4;

  // ── Biscates do Ato I, em ordem ──
  const T1 = 'QUEM VOLTOU DIFERENTE';
  G.BISCATES = [
    { id: 'zila', titulo: T1, texto: 'Ache a barraca de Dona Zilá', alvo: 'zila' },
    { id: 'portao', titulo: T1, texto: 'Derrube um Portão dos Goteiras', abates: 'portao', meta: 1 },
    { id: 'rua', titulo: T1, texto: 'Limpe a rua: 25 Goteiras', abates: 'goteira', meta: 25 },
    { id: 'nivel5', titulo: T1, texto: 'Chegue ao nível 5 e volte à Dona Zilá', alvo: 'zila', nivel: 5 },
    { id: 'implante', titulo: T1, texto: 'Instale seu primeiro implante com a Dona Zilá', condicao: 'implante' },
    { id: 'calha', titulo: T1, texto: 'Derrube o Calha no Pátio das Calhas', alvo: 'arena', chefe: 'calha' },
    { id: 'iara', titulo: 'MARÉ SECA', texto: 'Procure a Capitã Iara na balsa das Docas', alvo: 'iara' },
  ];

  // ── Gente com quem dá pra falar, e onde ──
  G.NPCS = {};
  for (const v of D.vendedores) G.NPCS[v.id] = Object.assign({}, v);
  G.NPCS.nicanor.quadra = [0, 0];
  G.NPCS.zila.quadra = [2, -1];
  G.NPCS.iara.quadra = GEO.docas.centro;
  G.NPCS.bigorna.quadra = GEO.ferro.centro;
  G.NPCS.tacita.quadra = GEO.subsolo.centro;
  G.NPCS.concierge.quadra = GEO.torres.centro;
  G.ZILA_QUADRA = G.NPCS.zila.quadra;
  G.ARENA_QUADRA = [-2, 2];   // Pátio das Calhas, onde o Calha espera
})();

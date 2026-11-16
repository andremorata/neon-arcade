'use strict';
// Jogador, inimigos, tiros, loot e biscates. Toda a regra de combate mora aqui;
// os números vêm de regras.js, que lê o dossiê.
(() => {
  const G = window.G, M = G.M, C = G.CHUNK, KIT = G.KIT;
  const J = G.jogo = {
    p: null, inimigos: [], projs: [], fx: [], loot: [], textos: [], parts: [],
    t: 0, tremor: 0, alvo: null, bairro: null, estadoQuadra: new Map(),
  };
  let aviso = () => {};
  G.avisar = f => { aviso = f; };
  const MAX_PARTS = () => (G.input.toque ? 200 : 380);

  // ── Jogador ─────────────────────────────────────────
  function novoJogador(s = {}) {
    const p = {
      x: s.x ?? C / 2, y: s.y ?? C / 2 + 80, r: 15, dir: -Math.PI / 2, olha: 1,
      nivel: s.nivel || 1, xp: s.xp || 0, lascas: s.lascas || 0,
      equip: s.equip || { arma: null, jaqueta: null },
      biscate: s.biscate || { i: 0, cont: 0 },
      injetor: { cargas: s.injetor ?? G.INJETOR.cargas, abates: 0 },
      hp: 1, hpMax: 1, carga: G.CARGA_MAX, cargaMax: G.CARGA_MAX,
      cd: { basico: 0, esquiva: 0, s: [0, 0, 0, 0] },
      rola: 0, rolaDir: 0, investe: 0, investeDir: 0, investeHit: null, cura: 0, curaPorSeg: 0, escudo: 0, escudoT: 0,
      inv: 0, flash: 0, semDano: 9, morto: false, passo: 0, atirou: 0, mira: 0,
    };
    recalcular(p); p.hp = p.hpMax;
    return p;
  }
  function stat(p, afixo) {
    let v = 0;
    for (const k in p.equip) if (p.equip[k] && p.equip[k].afixos) v += p.equip[k].afixos[afixo] || 0;
    return v;
  }
  function recalcular(p) {
    p.hpMax = G.vidaMax(p.nivel, 5, stat(p, 'vida'));
    p.potencia = (p.equip.arma && p.equip.arma.potencia) || 0;
    p.armadura = (p.equip.jaqueta && p.equip.jaqueta.armadura) || 0;
    p.velAtaque = stat(p, 'vel_ataque') / 100;
    p.critico = G.CRITICO.chanceBase + stat(p, 'chance_critica') / 100;
    p.recarga = stat(p, 'recarga') / 100;
    p.hp = Math.min(p.hp, p.hpMax);
  }
  const liberado = (p, i) => p.nivel >= KIT.slots[i].nivelDesbloqueio;

  G.iniciarJogo = save => {
    J.p = novoJogador(save);
    for (const k of ['inimigos', 'projs', 'fx', 'loot', 'textos', 'parts']) J[k].length = 0;
    J.estadoQuadra.clear(); J.alvo = null; J.bairro = null; J.t = 0;
  };
  G.salvavel = () => {
    const p = J.p;
    return { v: 2, nivel: p.nivel, xp: p.xp, lascas: p.lascas, equip: p.equip, biscate: p.biscate,
      injetor: p.injetor.cargas, x: Math.round(p.x), y: Math.round(p.y) };
  };

  // ── Efeitos ─────────────────────────────────────────
  function particulas(x, y, n, cor, vel = 220, vida = 0.5, tam = 3, z = 14) {
    const max = MAX_PARTS();
    for (let i = 0; i < n && J.parts.length < max; i++) {
      const a = Math.random() * Math.PI * 2, v = vel * (0.3 + Math.random());
      J.parts.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: Math.random() * vel * 0.5, vida: vida * (0.5 + Math.random() * 0.7), max: vida, cor, tam });
    }
  }
  function texto(x, y, txt, cor, grande) { J.textos.push({ x: x + G.rand(-8, 8), y, txt, cor, t: 0, vida: grande ? 1.1 : 0.8, grande }); }
  const tremer = v => { J.tremor = Math.max(J.tremor, v); };

  // ── Mira automática ─────────────────────────────────
  // primeiro o mais perto dentro de 60° da direção do movimento, depois o mais perto em geral;
  // no PC, o inimigo mais perto do cursor ganha
  function mouseMundo() {
    const m = G.input.mouse;
    return m.ativo && !G.input.toque && G.render ? G.render.telaParaMundo(m.x, m.y) : null;
  }
  function mirar(p, alcance) {
    const a2 = alcance * alcance, mm = mouseMundo();
    const vivos = J.inimigos.filter(e => !e.morto && G.d2(e.x, e.y, p.x, p.y) < a2);
    if (mm) {
      let melhor = null, md = 70 * 70;
      for (const e of vivos) { const d = G.d2(e.x, e.y - 30, mm.x, mm.y); if (d < md) { md = d; melhor = e; } }
      if (melhor) return melhor;
    }
    const mov = Math.hypot(G.input.mx, G.input.my) > 0.2 ? Math.atan2(G.input.my, G.input.mx) : null;
    let melhor = null, ms = Infinity, melhorCone = null, mc = Infinity;
    for (const e of vivos) {
      const d = Math.sqrt(G.d2(e.x, e.y, p.x, p.y)) * (e === J.alvo ? 0.75 : 1);
      if (d >= ms && d >= mc) continue;
      if (!G.mundo.visao(p.x, p.y, e.x, e.y)) continue;
      if (d < ms) { ms = d; melhor = e; }
      if (mov != null && Math.abs(G.difAng(Math.atan2(e.y - p.y, e.x - p.x), mov)) < Math.PI / 3 && d < mc) { mc = d; melhorCone = e; }
    }
    return melhorCone || melhor;
  }
  function anguloPara(p, alvo) {
    if (alvo) return Math.atan2(alvo.y - p.y, alvo.x - p.x);
    const mm = mouseMundo();
    if (mm) return Math.atan2(mm.y - p.y, mm.x - p.x);
    return p.dir;
  }

  // ── Habilidades ─────────────────────────────────────
  const danoJogador = (p, h, campo) => G.danoBase(h, p.nivel, campo) * (1 + p.potencia);
  function tiro(x, y, ang, vel, dano, alcance, dono, extra) {
    J.projs.push(Object.assign({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, dano, vida: alcance / vel, dono, r: 6 }, extra));
  }
  function olharPara(p, ang) { p.dir = ang; if (Math.abs(Math.cos(ang)) > 0.15) p.olha = Math.cos(ang) > 0 ? 1 : -1; p.mira = ang; p.atirou = 0.35; }

  function basico(p) {
    const h = KIT.basico;
    if (p.cd.basico > 0) return;
    const alvo = mirar(p, h.base.alcance * M), ang = anguloPara(p, alvo);
    olharPara(p, ang);
    p.cd.basico = h.cooldown / (1 + p.velAtaque);
    const bx = p.x + Math.cos(ang) * 30, by = p.y + Math.sin(ang) * 18;
    tiro(bx, by, ang + G.rand(-0.025, 0.025), 950, danoJogador(p, h), h.base.alcance * M, 'p', { carga: h.base.cargaPorAcerto, empurra: 50, cor: '#FFF0D8' });
    J.fx.push({ tipo: 'clarao', x: bx, y: by, t: 0, dur: 0.08, raio: 26 });
    G.som.tiro();
  }

  function esquiva(p) {
    const h = KIT.esquiva;
    if (p.cd.esquiva > 0 || p.rola > 0) return;
    const m = Math.hypot(G.input.mx, G.input.my);
    p.rolaDir = m > 0.2 ? Math.atan2(G.input.my, G.input.mx) : p.dir;
    p.rola = 0.3; p.inv = h.base.invulneravel + 0.05; p.cd.esquiva = h.cooldown;
    if (Math.abs(Math.cos(p.rolaDir)) > 0.15) p.olha = Math.cos(p.rolaDir) > 0 ? 1 : -1;
    G.som.investida();
  }

  function injetar(p) {
    if (p.injetor.cargas <= 0 || p.cura > 0 || p.hp >= p.hpMax) return;
    p.injetor.cargas--;
    p.cura = G.INJETOR.duracao; p.curaPorSeg = p.hpMax * G.INJETOR.cura / G.INJETOR.duracao;
    particulas(p.x, p.y, 14, '#A8DBA0', 90, 0.8, 3, 40);
    G.som.injetor();
  }

  function usar(p, i) {
    const h = KIT.slots[i];
    if (!h || p.morto || !liberado(p, i)) return false;
    if (p.cd.s[i] > 0 || p.carga < h.custo) { if (p.carga < h.custo) G.som.falha(); return false; }
    const cd = h.cooldown * (1 - p.recarga);
    switch (h.id) {
      case 'merc_varredura': {
        const alc = h.base.alcance * M, alvo = mirar(p, alc + 40), ang = anguloPara(p, alvo);
        olharPara(p, ang);
        const meio = (h.base.cone * Math.PI / 180) / 2, dano = danoJogador(p, h);
        for (const e of J.inimigos) {
          if (e.morto) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > alc + e.r || Math.abs(G.difAng(Math.atan2(dy, dx), ang)) > meio + 0.1) continue;
          if (!G.mundo.visao(p.x, p.y, e.x, e.y)) continue;
          ferirInimigo(e, dano, { kx: dx / d * 380, ky: dy / d * 380, de: p });
        }
        J.fx.push({ tipo: 'cone', x: p.x, y: p.y, ang, meio, alc, t: 0, dur: 0.22 });
        tremer(5); G.som.rajada();
        break;
      }
      case 'merc_investida': {
        const alvo = mirar(p, 260), m = Math.hypot(G.input.mx, G.input.my);
        const ang = alvo ? anguloPara(p, alvo) : m > 0.2 ? Math.atan2(G.input.my, G.input.mx) : p.dir;
        olharPara(p, ang); p.atirou = 0;
        p.investe = 0.3; p.investeDir = ang; p.investeHit = new Set(); p.inv = Math.max(p.inv, 0.1);
        G.som.investida();
        break;
      }
      case 'merc_granada': {
        const alc = h.base.alcance * M, alvo = mirar(p, alc), ang = anguloPara(p, alvo);
        olharPara(p, ang);
        let tx = alvo ? alvo.x : p.x + Math.cos(ang) * 220, ty = alvo ? alvo.y : p.y + Math.sin(ang) * 220;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d > alc) { tx = p.x + (tx - p.x) * alc / d; ty = p.y + (ty - p.y) * alc / d; }
        J.fx.push({ tipo: 'granada', x0: p.x, y0: p.y, x1: tx, y1: ty, x: p.x, y: p.y, z: 0, t: 0, voo: 0.45,
          atraso: h.base.atraso, dur: 0.45 + h.base.atraso, dano: danoJogador(p, h), raio: h.base.raio * M,
          dps: G.danoBase(h, p.nivel, 'danoPorSegundo'), sangra: h.base.duracao });
        G.som.lancar();
        break;
      }
      case 'merc_peito_aberto': {
        p.escudo = G.danoBase(h, p.nivel, 'escudo'); p.escudoT = h.base.duracao;
        for (const e of J.inimigos) if (!e.morto && G.d2(e.x, e.y, p.x, p.y) < (h.base.raio * M) ** 2) { acordar(e); e.provocado = h.base.provocacao; }
        J.fx.push({ tipo: 'anel', x: p.x, y: p.y, t: 0, dur: 0.5, raio: h.base.raio * M, cor: G.COR.ambar });
        G.som.escudo();
        break;
      }
      default: return false;
    }
    p.cd.s[i] = cd; p.carga -= h.custo;
    return true;
  }

  // ── Dano ────────────────────────────────────────────
  function ferirInimigo(e, v, o = {}) {
    if (e.morto) return;
    const p = J.p;
    v *= G.portaDeNivel(e.nivel, p.nivel).danoCausado;
    // escudo do Portão: 60% a menos se vier de frente
    if (e.tipo === 'portao' && o.de) {
      const de = Math.atan2(o.de.y - e.y, o.de.x - e.x);
      if (Math.abs(G.difAng(de, e.ang)) < Math.PI / 3) { v *= 0.4; o.bloqueio = true; }
    }
    const crit = !o.semCritico && Math.random() < p.critico;
    if (crit) v *= G.CRITICO.multiplicador;
    v = Math.max(1, Math.round(v));
    e.hp -= v; e.flash = 0.12;
    const peso = e.tipo === 'portao' ? 0.25 : 1;
    e.kx += (o.kx || 0) * peso; e.ky += (o.ky || 0) * peso;
    if (o.atordoa) e.atordoado = Math.max(e.atordoado, o.atordoa * (e.tipo === 'portao' ? 0.5 : 1));
    if (o.sangra) e.sangra = o.sangra;
    if (!o.semRecuo && e.tipo !== 'portao') e.recuo = 0.18;
    acordar(e);
    if (o.bloqueio) { texto(e.x, e.y - 100, v + ' ⛨', G.COR.suave); particulas(e.x - 20, e.y - 50, 5, '#c9d2e0', 160, 0.25, 2); G.som.metal(); }
    else {
      texto(e.x, e.y - 100, crit ? v + '!' : String(v), crit ? G.COR.ambar : G.COR.texto, crit);
      particulas(e.x, e.y - 40, crit ? 7 : 4, '#7a2a2a', 140, 0.35, 2.5, 40);
      crit ? G.som.critico() : G.som.acerto();
    }
    if (e.hp <= 0) matar(e);
  }

  function ferirJogador(v, de) {
    const p = J.p;
    if (p.inv > 0 || p.morto) return;
    v *= G.portaDeNivel(de ? de.nivel : p.nivel, p.nivel).danoRecebido;
    v *= 1 - G.reducaoArmadura(p.armadura, de ? de.nivel : p.nivel);
    if (p.nivel >= KIT.passivas[0].nivelDesbloqueio) v *= 1 - KIT.passivas[0].base.reducaoDano;
    if (p.escudo > 0) { const a = Math.min(p.escudo, v); p.escudo -= a; v -= a; }
    v = Math.round(v);
    if (v <= 0) { G.som.metal(); return; }
    p.hp -= v; p.flash = 0.18; p.semDano = 0;
    texto(p.x, p.y - 100, '-' + v, G.COR.coral);
    tremer(Math.min(9, 3 + v / 4));
    G.som.dor();
    if (p.hp <= 0) {
      p.hp = 0; p.morto = true;
      particulas(p.x, p.y, 30, '#7a2a2a', 200, 0.9, 3, 40);
      G.som.morte();
      if (G.aoMorrer) G.aoMorrer();
    }
  }

  function matar(e) {
    e.morto = true;
    const p = J.p;
    const st = G.inimigoNoNivel(e.tipo === 'portao' ? 'portao' : e.id, e.nivel);
    ganharXP(Math.round(st.xp * G.portaDeNivel(e.nivel, p.nivel).xp));
    particulas(e.x, e.y - 40, e.tipo === 'portao' ? 30 : 16, '#c7cbe0', 160, 0.6, 2.5, 50);
    G.som.morteInimigo();
    if (e.tipo === 'portao') tremer(7);
    J.fx.push({ tipo: 'queda', x: e.x, y: e.y, tipo2: e.tipo, olha: e.olha, t: 0, dur: 1.2 });
    const est = J.estadoQuadra.get(e.quadra);
    if (est && --est.vivos <= 0) est.volta = J.t + 120;
    // lascas sempre; item às vezes, e sempre no Portão
    const [a, b] = G.INIMIGOS[e.id].lascas, total = G.randInt(a, b) * (1 + 0.5 * (e.nivel - 1));
    const n = Math.min(4, Math.max(1, Math.round(total / 6)));
    for (let i = 0; i < n; i++) soltar(e.x, e.y, { tipo: 'lasca', valor: Math.max(1, Math.round(total / n)) });
    if (e.tipo === 'portao' || Math.random() < 0.12) soltar(e.x, e.y, { tipo: 'item', item: G.gerarItem(e.nivel, e.tipo === 'portao' ? 1 : 0) });
    // injetor recarrega a cada 20 abates
    if (++p.injetor.abates >= 20) { p.injetor.abates = 0; if (p.injetor.cargas < G.INJETOR.cargas) { p.injetor.cargas++; aviso('Injetor recarregado', G.COR.verde); } }
    progredirBiscate(e.tipo === 'portao' ? 'portao' : 'goteira');
    if (e.tipo === 'portao') progredirBiscate('goteira');
  }

  function ganharXP(v) {
    const p = J.p;
    if (p.nivel >= G.NIVEL_MAX) return;
    p.xp += v;
    while (p.xp >= G.xpPara(p.nivel) && p.nivel < G.NIVEL_MAX) {
      p.xp -= G.xpPara(p.nivel); p.nivel++;
      recalcular(p); p.hp = p.hpMax; p.carga = p.cargaMax;
      aviso('NÍVEL ' + p.nivel, G.COR.ambar, true);
      KIT.slots.forEach((h, i) => { if (h.nivelDesbloqueio === p.nivel) aviso(`Nova habilidade: ${h.nome} (tecla ${i + 1})`, G.COR.menta); });
      for (const h of KIT.passivas) if (h.nivelDesbloqueio === p.nivel) aviso(`Passiva: ${h.nome}. ${h.efeito}`, G.COR.menta);
      J.fx.push({ tipo: 'anel', x: p.x, y: p.y, t: 0, dur: 0.7, raio: 140, cor: G.COR.ambar });
      G.som.nivel();
    }
  }

  // ── Loot ────────────────────────────────────────────
  function soltar(x, y, obj) {
    const a = Math.random() * Math.PI * 2, v = G.rand(50, 140);
    J.loot.push(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, z: 10, vz: 200 }, obj));
  }
  function pegar(l) {
    const p = J.p;
    if (l.tipo === 'lasca') { p.lascas += l.valor; G.som.moeda(); return; }
    const it = l.item, R = G.raridade(it.rar), i = G.RARIDADES.indexOf(R);
    G.som.item(i);
    // sem inventário ainda: equipa se render mais, senão vende na hora
    if (G.poderItem(it) > G.poderItem(p.equip[it.slot])) {
      p.equip[it.slot] = it; recalcular(p);
      aviso(`Equipado: ${it.nome} · ${descreverItem(it)}`, R.cor);
    } else {
      const preco = G.precoVenda(it);
      p.lascas += preco;
      aviso(`${it.nome} vendido por ${preco} lascas`, R.cor);
    }
  }
  function descreverItem(it) {
    const partes = [];
    if (it.potencia) partes.push(`+${Math.round(it.potencia * 100)}% dano`);
    if (it.armadura) partes.push(`${it.armadura} armadura`);
    const nomes = { vida: 'vida', vel_ataque: '% vel. ataque', chance_critica: '% crítico', recarga: '% recarga' };
    for (const [k, v] of Object.entries(it.afixos || {})) partes.push(k === 'vida' ? `+${v} vida` : `+${v}${nomes[k]}`);
    return partes.join(' · ');
  }
  G.descreverItem = descreverItem;

  // ── Biscates ────────────────────────────────────────
  function biscateAtual() { return G.BISCATES[J.p.biscate.i] || null; }
  function concluirBiscate() {
    const p = J.p, b = biscateAtual();
    const premio = G.randInt(80, 150) * p.nivel;
    p.lascas += premio;
    if (b.id === 'zila') aviso('Dona Zilá: “Implante custa caro e cobra mais caro ainda. Volta quando aguentar o tranco.”', G.COR.lavanda);
    if (b.id === 'nivel5') aviso('Dona Zilá: “Agora sim. Senta aí que eu costuro.” · Implantes chegam na próxima fatia.', G.COR.lavanda);
    aviso(`Biscate concluído · +${premio} lascas`, G.COR.ambar);
    p.biscate = { i: p.biscate.i + 1, cont: 0 };
    G.som.nivel();
  }
  function progredirBiscate(abate) {
    const b = biscateAtual();
    if (!b || !b.abates || b.abates !== abate) return;
    if (++J.p.biscate.cont >= b.meta) concluirBiscate();
  }
  function checarLugar(p) {
    const b = biscateAtual();
    if (!b || !b.alvo) return;
    const l = G.mundo.lugar(b.alvo);
    if (G.d2(p.x, p.y, l.x, l.y) < 90 * 90) {
      if (b.nivel && p.nivel < b.nivel) {
        if (!J.avisouZila || J.t - J.avisouZila > 8) { J.avisouZila = J.t; aviso(`Dona Zilá: “Ainda não, nível ${b.nivel}.”`, G.COR.lavanda); }
        return;
      }
      concluirBiscate();
    }
  }
  G.biscate = () => {
    const b = biscateAtual(), p = J.p;
    if (!b) return { titulo: 'FIM DA FATIA', texto: 'Explore a cidade. Os outros bairros já estão abertos.', extra: '' };
    let extra = '';
    if (b.alvo) { const l = G.mundo.lugar(b.alvo); extra = `${Math.round(Math.hypot(l.x - p.x, l.y - p.y) / M)} m`; }
    else extra = `${p.biscate.cont} / ${b.meta}`;
    return { titulo: b.titulo, texto: b.texto, extra, alvo: b.alvo ? G.mundo.lugar(b.alvo) : null };
  };

  // ── Inimigos ────────────────────────────────────────
  const TIPO_DE = { goteira_faca: 'faca', goteira_atirador: 'atirador', portao: 'portao' };
  function criarInimigo(id, nivel, x, y, quadra) {
    const st = G.inimigoNoNivel(id, nivel), tipo = TIPO_DE[id];
    return {
      id, tipo, nivel, x, y, hx: x, hy: y, r: tipo === 'portao' ? 22 : 15, hp: st.vida, hpMax: st.vida, st,
      dano: st.dano, vel: st.velocidade, cd: Math.random() * st.intervalo, estado: 'parado', flash: 0, kx: 0, ky: 0,
      prep: 0, prepMax: 0, quadra, fase: Math.random(), olha: -1, ang: Math.PI, anel: Math.random() * Math.PI * 2,
      atordoado: 0, sangra: null, recuo: 0, golpeT: 0, carga: 0, investida: 0, morto: false, pack: 0, lado: Math.random() < 0.5 ? 1 : -1,
    };
  }
  function acordar(e) {
    if (e.estado === 'caca') return;
    e.estado = 'caca';
    for (const o of J.inimigos) if (!o.morto && o.pack === e.pack && o.estado === 'parado') o.estado = 'caca';
  }

  let proxPack = 1;
  function povoar(ch) {
    if (ch.fora || ch.seguro || ch.zila) return;
    let est = J.estadoQuadra.get(ch.chave);
    if (!est) { est = { vivos: 0, volta: 0 }; J.estadoQuadra.set(ch.chave, est); }
    if (est.vivos > 0 || J.t < est.volta) return;
    const B = G.BAIRROS[ch.bairro], p = J.p;
    const r = G.rng((G.hash(ch.cx, ch.cy, 7) + Math.floor(J.t)) >>> 0);
    const dist = Math.hypot(ch.cx, ch.cy);
    // uma turma por quadra no máximo; às vezes a rua está vazia e tenta de novo depois
    const nPacks = dist < 2 || r() < 0.65 ? 1 : 0;
    for (let k = 0; k < nPacks; k++) {
      const pt = G.mundo.pontoLivre(ch, 24, r);
      if (!pt || G.d2(pt.x, pt.y, p.x, p.y) < 420 * 420) continue;
      // no Mercado o nível sobe devagar conforme se afasta do abrigo; nos outros, a faixa do bairro
      const nivel = ch.bairro === 'mercado'
        ? G.clamp(1 + Math.floor(dist / 1.6), B.nivel[0], B.nivel[1])
        : B.nivel[0] + Math.floor(r() * (B.nivel[1] - B.nivel[0] + 1));
      const pack = proxPack++, perto = dist < 2;
      const ids = [];
      const facas = perto ? 2 + ((r() * 2) | 0) : 4 + ((r() * 3) | 0);
      for (let i = 0; i < facas; i++) ids.push('goteira_faca');
      for (let i = 0, n = perto ? (r() < 0.4 ? 1 : 0) : (r() * 3) | 0; i < n; i++) ids.push('goteira_atirador');
      if (!perto && nivel >= 2 && r() < 0.3) ids.push('portao');
      for (const id of ids) {
        const e = criarInimigo(id, nivel, pt.x + G.rand(-50, 50), pt.y + G.rand(-50, 50), ch.chave);
        e.pack = pack; G.mundo.colidir(e);
        J.inimigos.push(e); est.vivos++;
      }
    }
    if (!est.vivos) est.volta = J.t + 45;
  }

  const AGGRO = 340, CORRENTE = 900;
  function pensar(e, dt) {
    const p = J.p, st = e.st;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 1800) return;
    e.cd -= dt; e.flash -= dt; e.fase += dt; e.recuo -= dt; e.golpeT -= dt;
    if (e.provocado > 0) e.provocado -= dt;
    if (e.sangra) {
      e.sangra.t -= dt; e.sangra.acum = (e.sangra.acum || 0) + e.sangra.dps * dt;
      if (e.sangra.acum >= 1) { const v = Math.floor(e.sangra.acum); e.sangra.acum -= v; e.hp -= v; if (Math.random() < 0.3) particulas(e.x, e.y - 30, 1, '#7a2a2a', 40, 0.4, 2, 30); if (e.hp <= 0) { matar(e); return; } }
      if (e.sangra.t <= 0) e.sangra = null;
    }
    if (e.kx || e.ky) {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const k = Math.exp(-9 * dt); e.kx *= k; e.ky *= k;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 4) e.kx = e.ky = 0;
    }
    if (e.atordoado > 0) { e.atordoado -= dt; e.prep = 0; e.investida = 0; return; }
    let vx = 0, vy = 0;
    const longeDeCasa = G.d2(e.x, e.y, e.hx, e.hy) > CORRENTE * CORRENTE;
    const abrigado = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)).seguro;
    const angP = Math.atan2(dy, dx);
    const alcance = st.alcance + e.r + p.r;

    if (e.estado === 'parado') {
      if (!p.morto && d < AGGRO && G.mundo.visao(e.x, e.y, p.x, p.y)) acordar(e);
      vx = Math.cos(e.fase * 0.7) * 0.12; vy = Math.sin(e.fase * 0.5) * 0.12;
    } else if (e.estado === 'caca') {
      if (p.morto || (longeDeCasa && !(e.provocado > 0)) || abrigado) { e.estado = 'volta'; e.prep = 0; }
      else if (e.investida > 0) {
        // investida do Portão: reta, rápida, acerta uma vez
        e.investida -= dt;
        const v = 6 * M / 0.4;
        e.x += Math.cos(e.ang) * v * dt; e.y += Math.sin(e.ang) * v * dt;
        if (!e.acertouInvestida && G.d2(e.x, e.y, p.x, p.y) < (e.r + p.r + 12) ** 2) { e.acertouInvestida = true; ferirJogador(e.dano * 28 / 22, e); }
        return;
      } else if (e.prep > 0) {
        e.prep -= dt;
        if (e.prep <= 0) desferir(e, d, angP);
      } else if (e.tipo === 'faca') {
        e.ang = angP;
        if (d < alcance) { if (e.cd <= 0) { e.prep = e.prepMax = st.aviso; e.aviso = 'circulo'; } }
        else {
          // cerca: cada um mira num ponto do anel em volta do jogador
          const tx = p.x + Math.cos(e.anel) * (alcance * 0.8), ty = p.y + Math.sin(e.anel) * (alcance * 0.8);
          const hx = tx - e.x, hy = ty - e.y, hd = Math.hypot(hx, hy) || 1;
          vx = hx / hd; vy = hy / hd;
        }
      } else if (e.tipo === 'atirador') {
        const ve = G.mundo.visao(e.x, e.y, p.x, p.y);
        e.ang = angP;
        if (d > st.alcance || !ve) { vx = dx / d; vy = dy / d; }
        else if (d < 3 * M) { vx = -dx / d; vy = -dy / d; }
        else if (d > 7 * M) { vx = dx / d * 0.6; vy = dy / d * 0.6; }
        else {
          vx = -dy / d * e.lado * 0.5; vy = dx / d * e.lado * 0.5;
          if (Math.random() < dt * 0.4) e.lado *= -1;
          if (e.cd <= 0) { e.prep = e.prepMax = st.aviso; e.aviso = 'linha'; }
        }
      } else {
        // Portão: anda devagar de escudo na frente; golpe em arco de perto, investida de longe
        e.ang += G.difAng(angP, e.ang) * Math.min(1, dt * 3);
        e.carga -= dt;
        if (d < alcance && e.cd <= 0) { e.prep = e.prepMax = st.aviso; e.aviso = 'arco'; e.ang = angP; }
        else if (e.carga <= 0 && d > 3 * M && d < 7 * M && G.mundo.visao(e.x, e.y, p.x, p.y)) { e.prep = e.prepMax = 1; e.aviso = 'investida'; e.ang = angP; e.carga = 6; }
        else if (d >= alcance) { vx = Math.cos(e.ang); vy = Math.sin(e.ang); }
      }
    } else {
      const hx = e.hx - e.x, hy = e.hy - e.y, hd = Math.hypot(hx, hy);
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.3 * dt);
      if (hd < 30) { e.estado = 'parado'; e.hp = e.hpMax; }
      else { vx = hx / hd; vy = hy / hd; }
    }
    const lento = e.prep > 0 ? 0.1 : 1;
    e.x += vx * e.vel * lento * dt; e.y += vy * e.vel * lento * dt;
    e.andando = Math.hypot(vx, vy) > 0.3;
    const olhar = e.estado === 'caca' ? Math.cos(angP) : vx;
    if (Math.abs(olhar) > 0.15) e.olha = olhar > 0 ? 1 : -1;
  }

  function desferir(e, d, angP) {
    const p = J.p, st = e.st, alcance = st.alcance + e.r + p.r;
    e.cd = st.intervalo; e.golpeT = 0.25;
    if (e.aviso === 'circulo') { if (d < alcance + 12) ferirJogador(e.dano, e); G.som.faca(); }
    else if (e.aviso === 'linha') {
      tiro(e.x + Math.cos(e.ang) * 20, e.y + Math.sin(e.ang) * 12, e.ang, 560, e.dano, st.alcance + 60, 'e', { cor: G.COR.coral, de: e });
      G.som.inimigoTiro(); e.cd = st.intervalo * G.rand(0.85, 1.2);
    } else if (e.aviso === 'arco') {
      if (d < alcance + 14 && Math.abs(G.difAng(angP, e.ang)) < Math.PI / 3) ferirJogador(e.dano, e);
      tremer(4); G.som.metal();
    } else if (e.aviso === 'investida') { e.investida = 0.4; e.acertouInvestida = false; G.som.investida(); }
  }

  function separar() {
    const L = J.inimigos;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.morto) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.morto) continue;
        const dx = b.x - a.x, dy = b.y - a.y, r = a.r + b.r, dd = dx * dx + dy * dy;
        if (dd >= r * r || dd < 1e-6) continue;
        const d = Math.sqrt(dd), k = (r - d) / d * 0.5;
        a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
      }
    }
  }

  // ── Atualização ─────────────────────────────────────
  function atualizarJogador(p, dt) {
    const I = G.input;
    p.cd.basico = Math.max(0, p.cd.basico - dt); p.cd.esquiva = Math.max(0, p.cd.esquiva - dt);
    for (let i = 0; i < 4; i++) p.cd.s[i] = Math.max(0, p.cd.s[i] - dt);
    p.inv -= dt; p.flash -= dt; p.atirou -= dt; p.semDano += dt;
    if (p.escudoT > 0 && (p.escudoT -= dt) <= 0) p.escudo = 0;
    if (p.morto) { I.fila.length = 0; return; }
    p.carga = Math.min(p.cargaMax, p.carga + G.CARGA_REGEN * dt);
    if (p.cura > 0) { p.cura -= dt; p.hp = Math.min(p.hpMax, p.hp + p.curaPorSeg * dt); }
    const abrigo = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)).seguro;
    if (abrigo) {
      p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.25 * dt);
      if (p.injetor.cargas < G.INJETOR.cargas && !J.avisouAbrigo) { p.injetor.cargas = G.INJETOR.cargas; J.avisouAbrigo = true; aviso('Abrigo: Injetor reabastecido', G.COR.verde); }
    } else J.avisouAbrigo = false;

    if (p.rola > 0) {
      p.rola -= dt;
      const v = KIT.esquiva.base.distancia * M / 0.3;
      p.x += Math.cos(p.rolaDir) * v * dt; p.y += Math.sin(p.rolaDir) * v * dt;
    } else if (p.investe > 0) {
      p.investe -= dt;
      const h = KIT.slots[1], v = h.base.distancia * M / 0.3;
      p.x += Math.cos(p.investeDir) * v * dt; p.y += Math.sin(p.investeDir) * v * dt;
      for (const e of J.inimigos) {
        if (e.morto || p.investeHit.has(e)) continue;
        if (G.d2(e.x, e.y, p.x, p.y) < (e.r + p.r + 12) ** 2) {
          p.investeHit.add(e);
          const emp = h.base.empurrao * M / 0.22;
          ferirInimigo(e, danoJogador(p, h), { kx: Math.cos(p.investeDir) * emp, ky: Math.sin(p.investeDir) * emp, atordoa: h.base.atordoamento, de: p });
          tremer(4);
        }
      }
    } else {
      const sp = G.VELOCIDADE * Math.min(1, Math.hypot(I.mx, I.my));
      p.x += I.mx * sp * dt; p.y += I.my * sp * dt;
      p.passo = sp > 1 ? p.passo + dt * 1.6 * sp / G.VELOCIDADE : 0;
      if (sp > 1) { p.dir = Math.atan2(I.my, I.mx); if (p.atirou <= 0 && Math.abs(I.mx) > 0.15) p.olha = I.mx > 0 ? 1 : -1; }
    }
    G.mundo.colidir(p);

    while (I.fila.length) {
      const a = I.fila.shift();
      if (a === 'esquiva') esquiva(p);
      else if (a === 'injetor') injetar(p);
      else if (p.rola <= 0 && p.investe <= 0) usar(p, a);
    }
    if (I.atacar && p.rola <= 0 && p.investe <= 0) basico(p);
    J.alvo = mirar(p, KIT.basico.base.alcance * M);
    checarLugar(p);
  }

  function atualizarProjs(dt) {
    const p = J.p;
    for (const pr of J.projs) {
      pr.vida -= dt;
      const passo = Math.hypot(pr.vx, pr.vy) * dt, n = Math.max(1, Math.ceil(passo / 10));
      for (let s = 0; s < n && pr.vida > 0; s++) {
        pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
        if (G.mundo.bloqueado(pr.x, pr.y)) { pr.vida = 0; particulas(pr.x, pr.y, 4, '#d9d2c0', 120, 0.2, 2, 30); break; }
        if (pr.dono === 'p') {
          for (const e of J.inimigos) {
            if (e.morto || G.d2(e.x, e.y, pr.x, pr.y) > (e.r + pr.r) ** 2) continue;
            const v = Math.hypot(pr.vx, pr.vy);
            ferirInimigo(e, pr.dano, { kx: pr.vx / v * pr.empurra, ky: pr.vy / v * pr.empurra, de: p, semRecuo: false });
            if (pr.carga) p.carga = Math.min(p.cargaMax, p.carga + pr.carga);
            pr.vida = 0; break;
          }
        } else if (!p.morto && G.d2(p.x, p.y, pr.x, pr.y) < (p.r + pr.r) ** 2) { ferirJogador(pr.dano, pr.de); pr.vida = 0; }
      }
    }
  }

  function atualizarFx(dt) {
    for (const f of J.fx) {
      f.t += dt;
      if (f.tipo !== 'granada') continue;
      const k = Math.min(1, f.t / f.voo);
      f.x = G.lerp(f.x0, f.x1, k); f.y = G.lerp(f.y0, f.y1, k); f.z = Math.sin(k * Math.PI) * 90;
      if (f.t >= f.dur && !f.explodiu) {
        f.explodiu = true;
        for (const e of J.inimigos) {
          if (e.morto) continue;
          const d = Math.hypot(e.x - f.x, e.y - f.y);
          if (d > f.raio + e.r) continue;
          ferirInimigo(e, f.dano * (1 - 0.4 * Math.min(1, d / f.raio)), { kx: (e.x - f.x) / (d || 1) * 300, ky: (e.y - f.y) / (d || 1) * 300,
            de: { x: f.x, y: f.y }, sangra: { dps: f.dps, t: f.sangra } });
        }
        particulas(f.x, f.y, 26, '#F2C38B', 300, 0.5, 3, 10);
        particulas(f.x, f.y, 18, '#5a5f6a', 120, 1.2, 6, 20);
        J.fx.push({ tipo: 'clarao', x: f.x, y: f.y, t: 0, dur: 0.3, raio: 220 });
        J.fx.push({ tipo: 'anel', x: f.x, y: f.y, t: 0, dur: 0.35, raio: f.raio, cor: G.COR.ambar });
        tremer(10); G.som.explosao();
      }
    }
  }

  function atualizarLoot(dt) {
    const p = J.p;
    for (const l of J.loot) {
      l.t += dt;
      if (l.z > 0 || l.vz > 0) {
        l.vz -= 900 * dt; l.z = Math.max(0, l.z + l.vz * dt); l.x += l.vx * dt; l.y += l.vy * dt;
        if (l.z === 0) l.vz = 0;
        continue;
      }
      if (p.morto || l.t < 0.4) continue;
      const d = Math.hypot(p.x - l.x, p.y - l.y), ima = l.tipo === 'lasca' ? 140 : 60;
      if (d < 22) { pegar(l); l.pego = true; }
      else if (d < ima) { const v = 480 * dt / d; l.x += (p.x - l.x) * v; l.y += (p.y - l.y) * v; }
    }
  }

  // pose de cada personagem pra figuras.js
  function poses() {
    const p = J.p;
    p.fig = p.rola > 0 ? { pose: 'rola', fase: 1 - p.rola / 0.3 }
      : p.investe > 0 ? { pose: 'investe' }
      : p.atirou > 0 ? { pose: 'atira', mira: p.mira }
      : p.passo > 0 ? { pose: 'anda', fase: p.passo % 1, mira: 0.7 }
      : { pose: 'parado', mira: 0.7 };
    p.fig.olha = p.olha; p.fig.flash = p.flash > 0 ? p.flash * 3 : 0;
    p.fig.alfa = p.inv > 0 && p.rola <= 0 && p.investe <= 0 && Math.floor(J.t * 16) % 2 ? 0.55 : null;
    for (const e of J.inimigos) {
      let pose = 'parado', fase = 0;
      if (e.recuo > 0) pose = 'recua';
      else if (e.investida > 0) pose = 'investe';
      else if (e.prep > 0) { pose = e.tipo === 'atirador' ? 'atira' : 'golpe'; fase = 0.3 * (1 - e.prep / e.prepMax); }
      else if (e.golpeT > 0) { pose = e.tipo === 'atirador' ? 'atira' : 'golpe'; fase = 0.9; }
      else if (e.andando) { pose = e.tipo === 'faca' && e.estado === 'caca' ? 'corre' : 'anda'; fase = (e.fase * (pose === 'corre' ? 1.8 : 1.2)) % 1; }
      else if (e.tipo === 'atirador' && e.estado === 'caca') pose = 'atira';
      e.fig = { pose, fase, olha: e.olha, mira: e.ang, flash: e.flash > 0 ? e.flash * 5 : 0 };
    }
  }

  function compactar(arr, vivo) { let j = 0; for (let i = 0; i < arr.length; i++) if (vivo(arr[i])) arr[j++] = arr[i]; arr.length = j; }

  let relogioPoda = 0;
  G.atualizar = dt => {
    const p = J.p;
    J.t += dt;
    J.tremor = Math.max(0, J.tremor - 40 * dt);
    G.input.atualizar();
    const pcx = G.mundo.quadraDe(p.x), pcy = G.mundo.quadraDe(p.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) povoar(G.mundo.chunk(pcx + dx, pcy + dy));
    if ((relogioPoda -= dt) <= 0) {
      relogioPoda = 2;
      G.mundo.podar(pcx, pcy);
      for (const e of J.inimigos) {
        if (e.morto || G.d2(e.x, e.y, p.x, p.y) < 2400 * 2400) continue;
        e.morto = true;
        const est = J.estadoQuadra.get(e.quadra);
        if (est) { est.vivos = Math.max(0, est.vivos - 1); if (!est.vivos) est.volta = 0; }
      }
    }
    atualizarJogador(p, dt);
    for (const e of J.inimigos) if (!e.morto) { pensar(e, dt); if (!e.morto) G.mundo.colidir(e); }
    separar();
    atualizarProjs(dt);
    atualizarFx(dt);
    atualizarLoot(dt);
    for (const q of J.parts) {
      q.vida -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vz -= 500 * dt; q.z = Math.max(0, q.z + q.vz * dt);
      const k = Math.exp(-3 * dt); q.vx *= k; q.vy *= k;
    }
    for (const t of J.textos) t.t += dt;
    compactar(J.inimigos, e => !e.morto);
    compactar(J.projs, q => q.vida > 0);
    compactar(J.fx, f => f.t < f.dur || (f.tipo === 'granada' && !f.explodiu));
    compactar(J.loot, l => !l.pego && l.t < 90);
    compactar(J.parts, q => q.vida > 0);
    compactar(J.textos, t => t.t < t.vida);
    if (J.alvo && J.alvo.morto) J.alvo = null;
    poses();
    const b = G.mundo.bairroNoPonto(p.x, p.y);
    if (b !== J.bairro) { J.bairro = b; if (G.aoMudarBairro) G.aoMudarBairro(b); }
  };

  G.reerguer = () => {
    const p = J.p, perda = Math.floor(p.lascas * 0.1);
    p.lascas -= perda;
    p.x = C / 2; p.y = C / 2 + 80; p.hp = p.hpMax; p.carga = p.cargaMax; p.morto = false; p.inv = 2;
    p.cd.basico = p.cd.esquiva = 0; p.cd.s.fill(0); p.rola = p.investe = 0;
    for (const e of J.inimigos) if (e.estado === 'caca') e.estado = 'volta';
    J.projs.length = 0;
    return perda;
  };

  G.liberado = i => J.p && liberado(J.p, i);
  G.combate = { usar, basico, esquiva, injetar, ferirInimigo, ferirJogador, criarInimigo, mirar, ganharXP, recalcular };
})();

'use strict';
// Jogador, habilidades, dano, loot, XP, biscates e o laço de atualização.
// A IA dos inimigos fica em inimigos.js; os números, em regras.js e sistemas.js.
(() => {
  const G = window.G, M = G.M, C = G.CHUNK, KIT = G.KIT, S = () => G.sistemas;
  const J = G.jogo = {
    p: null, inimigos: [], projs: [], fx: [], loot: [], textos: [], parts: [], rastros: [],
    t: 0, tremor: 0, alvo: null, bairro: null, estadoQuadra: new Map(), lentidao: 0, surto: 0, marca: null,
    perto: null, chefe: null,
  };
  let aviso = () => {};
  G.avisar = f => { aviso = f; };
  const MAX_PARTS = () => (G.input.toque ? 200 : 380);

  // ── Jogador ─────────────────────────────────────────
  function novoJogador(s = {}) {
    const p = {
      x: s.x ?? C / 2, y: s.y ?? C / 2 + 80, r: 15, dir: -Math.PI / 2, olha: 1,
      nivel: s.nivel || 1, xp: s.xp || 0, lascas: s.lascas || 0,
      biscate: s.biscate || { i: 0, cont: 0 },
      injetor: { cargas: s.injetor ?? G.INJETOR.cargas, abates: 0 },
      cd: { basico: 0, esquiva: 0, s: {} }, travadas: [0, 0, 0, 0],
      rola: 0, rolaDir: 0, investe: 0, investeDir: 0, investeHit: null, puxa: 0, puxaAlvo: null,
      cura: 0, curaPorSeg: 0, escudo: 0, escudoT: 0, atordoado: 0, ressaca: 0,
      buff: { horaExtra: 0, dinamo: 0, sangue: 0, sangueT: 0 }, disparos: 0, desvioPronto: 0,
      inv: 0, flash: 0, semDano: 9, morto: false, passo: 0, atirou: 0, mira: 0, kx: 0, ky: 0,
    };
    S().preparar(p, s);
    recalcular(p); p.hp = p.hpMax; p.carga = p.cargaMax;
    return p;
  }
  function recalcular(p) {
    const B = G.BAIRROS[J.bairro || 'mercado'];
    S().calcular(p, { chuva: B.pal.chuva });
  }
  const baixo = p => p.nivel >= 14 && p.hp / p.hpMax < 0.3;   // Último Pente
  const velAtaque = p => p.velAtaque + (p.buff.horaExtra > 0 ? 0.4 : 0) + (p.buff.dinamo > 0 ? 0.3 : 0) + (baixo(p) ? 0.2 : 0);
  const multDano = p => (1 + p.potencia) * (1 + p.danoBonus) * (1 + p.bonusRuido) * (p.buff.horaExtra > 0 ? 1.25 : 1) * (1 + 0.04 * p.buff.sangue);
  const custoZero = p => p.buff.horaExtra > 0;

  G.iniciarJogo = save => {
    J.p = null; J.bairro = null;
    for (const k of ['inimigos', 'projs', 'fx', 'loot', 'textos', 'parts', 'rastros']) J[k].length = 0;
    J.estadoQuadra.clear(); J.alvo = null; J.t = 0; J.lentidao = 0; J.surto = 0; J.marca = null; J.chefe = null;
    J.combate = 0; J.proxSurto = G.rand(60, 90); J.cobradorT = 0; J.portalT = -999;
    J.p = novoJogador(save);
  };
  G.salvavel = () => {
    const p = J.p;
    return Object.assign({ v: 2, nivel: p.nivel, xp: p.xp, lascas: p.lascas, biscate: p.biscate,
      injetor: p.injetor.cargas, x: Math.round(p.x), y: Math.round(p.y) }, S().salvar(p));
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
  function tiro(x, y, ang, vel, dano, alcance, dono, extra) {
    J.projs.push(Object.assign({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, dano, vida: alcance / vel, dono, r: 6 }, extra));
  }

  // ── Mira automática ─────────────────────────────────
  function mouseMundo() {
    const m = G.input.mouse;
    return m.ativo && !G.input.toque && G.render ? G.render.telaParaMundo(m.x, m.y) : null;
  }
  function mirar(p, alcance, filtro) {
    const a2 = alcance * alcance, mm = mouseMundo();
    const vivos = J.inimigos.filter(e => !e.morto && !e.amigo && G.d2(e.x, e.y, p.x, p.y) < a2 && (!filtro || filtro(e)));
    if (mm) {
      let melhor = null, md = 70 * 70;
      for (const e of vivos) { const d = G.d2(e.x, e.y - 30, mm.x, mm.y); if (d < md) { md = d; melhor = e; } }
      if (melhor) return melhor;
    }
    // tocar num elite ou chefe trava a mira nele
    if (J.travaMira && !J.travaMira.morto && vivos.includes(J.travaMira)) return J.travaMira;
    const mov = Math.hypot(G.input.mx, G.input.my) > 0.2 ? Math.atan2(G.input.my, G.input.mx) : null;
    let melhor = null, ms = Infinity, melhorCone = null, mc = Infinity;
    for (const e of vivos) {
      const d = Math.sqrt(G.d2(e.x, e.y, p.x, p.y)) * (e === J.alvo ? 0.75 : 1) * (e.tipo === 'aureola' ? 0.6 : 1);
      if (d >= ms && d >= mc) continue;
      if (!e.voa && !G.mundo.visao(p.x, p.y, e.x, e.y)) continue;
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
  function olharPara(p, ang) { p.dir = ang; if (Math.abs(Math.cos(ang)) > 0.15) p.olha = Math.cos(ang) > 0 ? 1 : -1; p.mira = ang; p.atirou = 0.35; }
  const danoHab = (p, h, campo = 'dano') => {
    const attr = h.escala && h.escala.atributo === 'corpo' ? p.danoAtributo : 1;
    return G.danoBase(h, p.nivel, campo) * multDano(p) * attr;
  };

  // ── Ataque básico e esquiva ─────────────────────────
  function basico(p) {
    const h = KIT.basico;
    if (p.cd.basico > 0) return;
    const alvo = mirar(p, h.base.alcance * M), ang = anguloPara(p, alvo);
    olharPara(p, ang);
    p.cd.basico = h.cooldown / (1 + velAtaque(p));
    const bx = p.x + Math.cos(ang) * 30, by = p.y + Math.sin(ang) * 18;
    // Sete-Vidas: todo 7º disparo atravessa a linha inteira com +200%
    const setimo = p.lend.has('sete_vidas') && ++p.disparos % 7 === 0;
    tiro(bx, by, ang + G.rand(-0.025, 0.025), 950, danoHab(p, h) * (setimo ? 3 : 1), h.base.alcance * M, 'p',
      { carga: h.base.cargaPorAcerto, empurra: 50, cor: setimo ? '#E9B77C' : '#FFF0D8', basico: true, perfura: setimo, acertados: setimo ? new Set() : null });
    J.fx.push({ tipo: 'clarao', x: bx, y: by, t: 0, dur: 0.08, raio: 26 });
    G.som.tiro();
  }
  function esquiva(p) {
    const h = KIT.esquiva;
    if (p.cd.esquiva > 0 || p.rola > 0 || p.atordoado > 0) return;
    const m = Math.hypot(G.input.mx, G.input.my);
    p.rolaDir = m > 0.2 ? Math.atan2(G.input.my, G.input.mx) : p.dir;
    p.rola = 0.3; p.inv = h.base.invulneravel + 0.05; p.cd.esquiva = h.cooldown * (1 - Math.min(0.6, p.recargaEsquiva));
    if (Math.abs(Math.cos(p.rolaDir)) > 0.15) p.olha = Math.cos(p.rolaDir) > 0 ? 1 : -1;
    G.som.investida();
  }
  function fimDaEsquiva(p) {
    if (p.lend.has('luvas_da_estivadora')) {
      const dano = (40 + 5 * (p.nivel - 1)) * multDano(p);
      for (const e of J.inimigos) if (!e.morto && G.d2(e.x, e.y, p.x, p.y) < (2 * M + e.r) ** 2) ferirInimigo(e, dano, { de: p, kx: (e.x - p.x) * 3, ky: (e.y - p.y) * 3 });
      J.fx.push({ tipo: 'anel', x: p.x, y: p.y, t: 0, dur: 0.3, raio: 2 * M, cor: G.COR.ambar }); tremer(4);
    }
  }
  function injetar(p) {
    if (p.injetor.cargas <= 0 || p.cura > 0 || p.hp >= p.hpMax) return;
    p.injetor.cargas--;
    const cura = G.INJETOR.cura * (p.estagioRuim.id === 'afinado' ? 0.5 : 1);
    p.cura = G.INJETOR.duracao; p.curaPorSeg = p.hpMax * cura / G.INJETOR.duracao;
    particulas(p.x, p.y, 14, '#A8DBA0', 90, 0.8, 3, 40);
    G.som.injetor();
  }

  // ── Habilidades das teclas 1 a 4 ────────────────────
  G.cdHabilidade = id => (J.p && J.p.cd.s[id]) || 0;
  function usar(p, i) {
    const id = p.slots[i];
    if (!id || p.morto || p.atordoado > 0) return false;
    if (p.travadas[i] > 0) { aviso('Habilidade travada pelo Coro', G.COR.lavanda); G.som.falha(); return false; }
    const h = S().habilidade(id), custo = custoZero(p) ? 0 : h.custo;
    if ((p.cd.s[id] || 0) > 0) return false;
    if (p.carga < custo) { G.som.falha(); return false; }
    const b = h.base, dur = p.duracao;
    switch (id) {
      case 'merc_varredura': {
        const alc = b.alcance * M, alvo = mirar(p, alc + 40), ang = anguloPara(p, alvo);
        olharPara(p, ang);
        const meio = (b.cone * Math.PI / 180) / 2, dano = danoHab(p, h);
        for (const e of J.inimigos) {
          if (e.morto || e.amigo) continue;
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (d > alc + e.r || Math.abs(G.difAng(Math.atan2(dy, dx), ang)) > meio + 0.1) continue;
          if (!e.voa && !G.mundo.visao(p.x, p.y, e.x, e.y)) continue;
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
        p.investe = 0.3; p.investeDir = ang; p.investeHit = new Set(); p.investeH = h; p.inv = Math.max(p.inv, 0.1);
        G.som.investida();
        break;
      }
      case 'merc_granada': {
        const alc = b.alcance * M, alvo = mirar(p, alc), ang = anguloPara(p, alvo);
        olharPara(p, ang);
        let tx = alvo ? alvo.x : p.x + Math.cos(ang) * 220, ty = alvo ? alvo.y : p.y + Math.sin(ang) * 220;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d > alc) { tx = p.x + (tx - p.x) * alc / d; ty = p.y + (ty - p.y) * alc / d; }
        J.fx.push({ tipo: 'granada', x0: p.x, y0: p.y, x1: tx, y1: ty, x: p.x, y: p.y, z: 0, t: 0, voo: 0.45,
          atraso: b.atraso, dur: 0.45 + b.atraso, dano: danoHab(p, h), raio: b.raio * M,
          dps: G.danoBase(h, p.nivel, 'danoPorSegundo'), sangra: b.duracao * dur });
        G.som.lancar();
        break;
      }
      case 'merc_peito_aberto': {
        p.escudo = G.danoBase(h, p.nivel, 'escudo') * p.danoAtributo; p.escudoT = b.duracao * dur;
        for (const e of J.inimigos) if (!e.morto && G.d2(e.x, e.y, p.x, p.y) < (b.raio * M) ** 2) { G.inimigos.acordar(e); e.provocado = b.provocacao * dur; }
        J.fx.push({ tipo: 'anel', x: p.x, y: p.y, t: 0, dur: 0.5, raio: b.raio * M, cor: G.COR.ambar });
        G.som.escudo();
        break;
      }
      case 'merc_hora_extra':
        p.buff.horaExtra = b.duracao * dur;
        aviso('HORA EXTRA', G.COR.ambar, true); G.som.nivel();
        break;
      case 'mau_olhado': {
        const alvo = mirar(p, b.alcance * M);
        if (!alvo) { G.som.falha(); return false; }
        J.marca = { e: alvo, t: b.duracao * dur, vuln: b.vulnerabilidade };
        G.inimigos.acordar(alvo); G.som.escudo();
        break;
      }
      case 'bate_estaca': {
        const alvo = mirar(p, b.alcance * M + 40), ang = anguloPara(p, alvo);
        olharPara(p, ang);
        if (alvo) {
          const emp = b.empurrao * M / 0.25;
          alvo.escudoEnergia = 0;
          ferirInimigo(alvo, danoHab(p, h), { de: p, kx: Math.cos(ang) * emp, ky: Math.sin(ang) * emp, atordoa: 0.4, quebraEscudo: true });
        }
        J.fx.push({ tipo: 'clarao', x: p.x + Math.cos(ang) * 40, y: p.y + Math.sin(ang) * 24, t: 0, dur: 0.15, raio: 60 });
        tremer(7); G.som.metal();
        break;
      }
      case 'fio_de_prumo': {
        const alc = b.alcance * M, alvo = mirar(p, alc);
        if (alvo && !alvo.elite && !alvo.chefe) {
          // puxa o inimigo comum até você
          olharPara(p, anguloPara(p, alvo));
          alvo.puxado = { x: p.x + Math.cos(p.dir) * 40, y: p.y + Math.sin(p.dir) * 24, t: 0.25 };
          ferirInimigo(alvo, danoHab(p, h), { de: p, atordoa: 0.3 });
        } else {
          // ou puxa você até o ponto: o alvo forte, o cursor ou pra frente
          const ang = anguloPara(p, alvo), dist = alvo ? Math.max(0, Math.hypot(alvo.x - p.x, alvo.y - p.y) - 50) : alc * 0.8;
          olharPara(p, ang);
          p.puxa = 0.3; p.puxaAlvo = { x: p.x + Math.cos(ang) * dist, y: p.y + Math.sin(ang) * dist }; p.inv = Math.max(p.inv, 0.2);
        }
        J.fx.push({ tipo: 'cabo', x: p.x, y: p.y, x1: alvo ? alvo.x : p.x + Math.cos(p.dir) * alc * 0.8, y1: alvo ? alvo.y : p.y + Math.sin(p.dir) * alc * 0.8, t: 0, dur: 0.25 });
        G.som.investida();
        break;
      }
      case 'dinamo_lombar':
        p.buff.dinamo = b.duracao * dur; p.buff.dinamoRessaca = b.ressaca;
        G.som.injetor();
        break;
      case 'meio_segundo':
        J.lentidao = b.duracao * dur; J.lentidaoForca = b.lentidaoMundo;
        aviso('MEIO SEGUNDO', G.COR.lavanda, true); G.som.escudo();
        break;
      default: return false;
    }
    p.cd.s[id] = h.cooldown * Math.max(0.3, 1 - p.recarga);
    p.carga -= custo;
    return true;
  }

  // ── Dano ────────────────────────────────────────────
  function ferirInimigo(e, v, o = {}) {
    if (e.morto || e.amigo) return;
    const p = J.p;
    v *= G.portaDeNivel(e.nivel, p.nivel).danoCausado;
    if (J.marca && J.marca.e === e) v *= 1 + J.marca.vuln;
    if (e.tipo === 'portao' && o.de && !o.quebraEscudo) {
      const de = Math.atan2(o.de.y - e.y, o.de.x - e.x);
      if (Math.abs(G.difAng(de, e.ang)) < Math.PI / 3) { v *= 0.4; o.bloqueio = true; }
    }
    const longe = o.de && G.d2(o.de.x, o.de.y, e.x, e.y) > (5 * M) ** 2;
    const crit = !o.semCritico && Math.random() < p.critico + (longe ? p.critLonge : 0);
    if (crit) v *= p.danoCritico;
    v = Math.max(1, Math.round(v));
    // escudo de energia da Guarda segura primeiro
    if (e.escudoEnergia > 0) { const a = Math.min(e.escudoEnergia, v); e.escudoEnergia -= a; v -= a; e.semDano = 0; if (!v) { texto(e.x, e.y - 100, 'escudo', G.COR.suave); G.som.metal(); return; } }
    e.hp -= v; e.flash = 0.12; e.semDano = 0;
    const peso = e.elite || e.chefe ? 0.25 : e.voa ? 1.3 : 1;
    e.kx += (o.kx || 0) * peso; e.ky += (o.ky || 0) * peso;
    if (o.atordoa) { e.atordoado = Math.max(e.atordoado, o.atordoa * p.duracao * (e.elite || e.chefe ? 0.5 : 1)); e.prep = 0; }
    if (o.sangra) e.sangra = o.sangra;
    if (o.queima) e.queima = o.queima;
    if (!o.semRecuo && !e.elite && !e.chefe) e.recuo = 0.18;
    if (p.rouboVida + (baixo(p) ? 0.05 : 0) > 0 && !o.dot) p.hp = Math.min(p.hpMax, p.hp + v * (p.rouboVida + (baixo(p) ? 0.05 : 0)));
    G.inimigos.acordar(e);
    if (o.bloqueio) { texto(e.x, e.y - 100, v + ' ⛨', G.COR.suave); particulas(e.x - 20, e.y - 50, 5, '#c9d2e0', 160, 0.25, 2); G.som.metal(); }
    else if (!o.dot) {
      texto(e.x, e.y - 100, crit ? v + '!' : String(v), crit ? G.COR.ambar : G.COR.texto, crit);
      particulas(e.x, e.y - 40, crit ? 7 : 4, e.maquina ? '#c9b48a' : '#7a2a2a', 140, 0.35, 2.5, 40);
      crit ? G.som.critico() : G.som.acerto();
    }
    if (e.hp <= 0) matar(e);
  }

  function ferirJogador(v, de, o = {}) {
    const p = J.p;
    if (p.inv > 0 || p.morto) return false;
    // Reflexo Emprestado: o CORAL desvia por você, um golpe a cada 12 s
    if (p.desvio && J.t >= p.desvioPronto && !o.area) {
      p.desvioPronto = J.t + p.desvio;
      texto(p.x, p.y - 100, 'desviou', G.COR.lavanda); p.inv = 0.2;
      return false;
    }
    v *= G.portaDeNivel(de ? de.nivel : p.nivel, p.nivel).danoRecebido;
    v *= 1 - G.reducaoArmadura(p.armadura, de ? de.nivel : p.nivel);
    v *= 1 - p.reducaoDano;
    if (p.escudo > 0) { const a = Math.min(p.escudo, v); p.escudo -= a; v -= a; }
    v = Math.round(v);
    if (v <= 0) { G.som.metal(); return false; }
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
    return true;
  }

  function matar(e) {
    if (e.morto) return;
    e.morto = true;
    const p = J.p;
    if (J.marca && J.marca.e === e) {
      // a marca do Mau-Olhado pula pro inimigo mais perto
      let prox = null, md = (9 * M) ** 2;
      for (const o of J.inimigos) if (!o.morto && o !== e) { const d = G.d2(o.x, o.y, e.x, e.y); if (d < md) { md = d; prox = o; } }
      J.marca = prox ? { ...J.marca, e: prox } : null;
    }
    if (e.semRecompensa) { particulas(e.x, e.y - 40, 16, '#AFA3F5', 160, 0.6, 2.5, 50); return; }
    ganharXP(Math.round(e.xp * G.portaDeNivel(e.nivel, p.nivel).xp));
    particulas(e.x, e.y - 40, e.elite || e.chefe ? 30 : 16, e.maquina ? '#c9b48a' : '#c7cbe0', 160, 0.6, 2.5, 50);
    G.som.morteInimigo();
    if (e.elite || e.chefe) tremer(7);
    J.fx.push({ tipo: 'queda', x: e.x, y: e.y, maior: e.elite || e.chefe, t: 0, dur: 1.2 });
    const est = J.estadoQuadra.get(e.quadra);
    if (est && --est.vivos <= 0) est.volta = J.t + 120;
    // Sangue Quente: cada abate dá dano por uns segundos
    if (p.nivel >= 8) { p.buff.sangue = Math.min(p.nivel >= 26 ? 6 : 5, p.buff.sangue + 1); p.buff.sangueT = 5; }
    const def = G.INIMIGOS[e.id];
    if (def && def.lascas) {
      const [a, b] = def.lascas, total = G.randInt(a, b) * (1 + 0.5 * (e.nivel - 1)) * (1 + p.lascasBonus);
      const n = Math.min(4, Math.max(1, Math.round(total / 6)));
      for (let i = 0; i < n; i++) soltar(e.x, e.y, { tipo: 'lasca', valor: Math.max(1, Math.round(total / n)) });
    }
    if (e.maquina && Math.random() < 0.6) soltar(e.x, e.y, { tipo: 'peca', valor: G.randInt(1, 3) });
    if (e.chefe) { soltar(e.x, e.y, { tipo: 'item', item: G.gerarItem(e.nivel, 2) }); soltar(e.x, e.y, { tipo: 'item', item: G.gerarItem(e.nivel, 1) }); }
    else if (e.elite) soltar(e.x, e.y, { tipo: 'item', item: G.gerarItem(e.nivel, 1) });
    else if (Math.random() < 0.12) soltar(e.x, e.y, { tipo: 'item', item: G.gerarItem(e.nivel, 0) });
    if (++p.injetor.abates >= 20) { p.injetor.abates = 0; if (p.injetor.cargas < G.INJETOR.cargas) { p.injetor.cargas++; aviso('Injetor recarregado', G.COR.verde); } }
    if (e.id === 'portao') progredirBiscate('portao');
    if (e.goteira) progredirBiscate('goteira');
    if (e.chefe) chefeDerrotado(e);
  }

  function ganharXP(v) {
    const p = J.p;
    if (p.nivel >= G.NIVEL_MAX) return;
    p.xp += v;
    while (p.xp >= G.xpPara(p.nivel) && p.nivel < G.NIVEL_MAX) {
      p.xp -= G.xpPara(p.nivel); p.nivel++; p.pontos += 3;
      S().ajustarSlots(p); recalcular(p); p.hp = p.hpMax; p.carga = p.cargaMax;
      aviso('NÍVEL ' + p.nivel, G.COR.ambar, true);
      aviso('+3 pontos de atributo · abra o personagem (I)', G.COR.menta);
      for (const h of G.ARQUETIPO.habilidades) if (h.nivelDesbloqueio === p.nivel && h.nivelDesbloqueio > 1) aviso(`${h.tipo === 'passiva' ? 'Passiva' : 'Habilidade'}: ${h.nome}`, G.COR.menta);
      for (const e of G.ESPACOS_IMPLANTE) if (e.nivelDesbloqueio === p.nivel) aviso(`Espaço de implante liberado: ${e.nome}`, G.COR.lavanda);
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
    if (l.tipo === 'lasca') { p.lascas += l.valor; G.som.moeda(); return true; }
    if (l.tipo === 'peca') { p.pecas += l.valor; G.som.moeda(); return true; }
    if (!S().guardar(p, l.item)) {
      if (!J.avisouCheia || J.t - J.avisouCheia > 6) { J.avisouCheia = J.t; aviso('Mochila cheia', G.COR.coral); }
      return false;
    }
    const R = G.raridade(l.item.rar);
    G.som.item(G.indiceRaridade(l.item.rar));
    aviso(`${l.item.nome} na mochila`, R.cor);
    return true;
  }
  function descreverItem(it) {
    const partes = [], ap = 1 + 0.1 * (it.aprimoramento || 0);
    if (it.potencia) partes.push(`+${Math.round(it.potencia * ap * 100)}% dano`);
    if (it.armadura) partes.push(`${Math.round(it.armadura * ap)} armadura`);
    const rot = { vida: ' vida', armadura: ' armadura', vel_ataque: '% vel. ataque', chance_critica: '% crítico', dano_critico: '% dano crítico',
      carga_max: ' Carga', carga_regen: ' Carga/s', recarga: '% recarga', vel_movimento: '% velocidade', roubo_vida: '% roubo de vida',
      lascas: '% lascas', tolerancia_ruido: ' tolerância a Ruído' };
    for (const [k, v] of Object.entries(it.afixos || {})) {
      if (k === 'atributo') { const a = G.ATRIBUTOS.find(x => x.id === it.atributo); partes.push(`+${v} ${a ? a.nome : 'atributo'}`); }
      else partes.push(`+${v}${rot[k] || ''}`);
    }
    return partes.join(' · ');
  }
  G.descreverItem = descreverItem;
  G.poderLendario = it => (it.lendario ? G.LENDARIOS.find(l => l.id === it.lendario).poder : '');

  // ── Biscates ────────────────────────────────────────
  const biscateAtual = () => G.BISCATES[J.p.biscate.i] || null;
  function concluirBiscate() {
    const p = J.p, b = biscateAtual();
    const premio = G.randInt(80, 150) * p.nivel;
    p.lascas += premio;
    const fala = {
      zila: 'Dona Zilá: “Implante custa caro e cobra mais caro ainda. Volta quando aguentar o tranco.”',
      nivel5: 'Dona Zilá: “Agora sim. Senta aí que eu costuro.”',
      implante: 'Dona Zilá: “O Calha sabe pra onde levaram a Maíra. Ele fica no Pátio das Calhas.”',
      calha: 'Calha: “A Vítrea travou meu braço... eu só entregava gente pra pagar.”',
      iara: 'Capitã Iara: “Tá procurando o Mutirão? Então vai precisar de barco.” · Fim do Ato I',
    };
    if (fala[b.id]) aviso(fala[b.id], G.COR.lavanda);
    aviso(`Biscate concluído · +${premio} lascas`, G.COR.ambar);
    S().juros(p);
    p.biscate = { i: p.biscate.i + 1, cont: 0 };
    G.som.nivel();
  }
  function progredirBiscate(abate) {
    const b = biscateAtual();
    if (!b || !b.abates || b.abates !== abate) return;
    if (++J.p.biscate.cont >= b.meta) concluirBiscate();
  }
  function chefeDerrotado(e) {
    const p = J.p;
    p.chefes[e.id] = true;
    J.chefe = null;
    aviso(`${G.INIMIGOS[e.id].nome.toUpperCase()} DERROTADO`, G.COR.ambar, true);
    const b = biscateAtual();
    if (b && b.chefe === e.id) concluirBiscate();
  }
  function checarBiscate(p) {
    const b = biscateAtual();
    if (!b) return;
    if (b.condicao === 'implante' && Object.values(p.implantes).some(Boolean)) { concluirBiscate(); return; }
    if (!b.alvo || b.chefe) return;
    const l = G.mundo.lugar(b.alvo);
    if (G.d2(p.x, p.y, l.x, l.y) < 100 * 100) {
      if (b.nivel && p.nivel < b.nivel) {
        if (!J.avisouZila || J.t - J.avisouZila > 8) { J.avisouZila = J.t; aviso(`Dona Zilá: “Ainda não. Volta no nível ${b.nivel}.”`, G.COR.lavanda); }
        return;
      }
      concluirBiscate();
    }
  }
  G.biscate = () => {
    const b = biscateAtual(), p = J.p;
    if (!b) return { titulo: 'ATO I CONCLUÍDO', texto: 'A cidade está aberta. As Docas esperam.', extra: '' };
    let extra = '';
    if (b.alvo) { const l = G.mundo.lugar(b.alvo); extra = `${Math.round(Math.hypot(l.x - p.x, l.y - p.y) / M)} m`; }
    else if (b.meta) extra = `${p.biscate.cont} / ${b.meta}`;
    return { titulo: b.titulo, texto: b.texto, extra, alvo: b.alvo ? G.mundo.lugar(b.alvo) : null };
  };

  // ── Atualização do jogador ──────────────────────────
  function atualizarJogador(p, dt) {
    const I = G.input;
    p.cd.basico = Math.max(0, p.cd.basico - dt); p.cd.esquiva = Math.max(0, p.cd.esquiva - dt);
    for (const k in p.cd.s) p.cd.s[k] = Math.max(0, p.cd.s[k] - dt);
    for (let i = 0; i < 4; i++) p.travadas[i] = Math.max(0, p.travadas[i] - dt);
    p.inv -= dt; p.flash -= dt; p.atirou -= dt; p.semDano += dt; p.atordoado = Math.max(0, p.atordoado - dt);
    if (p.escudoT > 0 && (p.escudoT -= dt) <= 0) p.escudo = 0;
    if (p.calmante > 0 && (p.calmante -= dt) <= 0) { recalcular(p); aviso('O calmante passou', G.COR.lavanda); }
    const bf = p.buff;
    if (bf.horaExtra > 0) bf.horaExtra -= dt;
    if (bf.dinamo > 0 && (bf.dinamo -= dt) <= 0) p.ressaca = bf.dinamoRessaca || 2;
    p.ressaca = Math.max(0, p.ressaca - dt);
    if (bf.sangueT > 0 && (bf.sangueT -= dt) <= 0) bf.sangue = 0;
    if (p.morto) { I.fila.length = 0; return; }
    p.carga = Math.min(p.cargaMax, p.carga + (p.cargaRegen + (bf.dinamo > 0 ? 20 : 0)) * dt);
    if (p.cura > 0) { p.cura -= dt; p.hp = Math.min(p.hpMax, p.hp + p.curaPorSeg * dt); }
    const ch = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y));
    if (ch.abrigo) {
      p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.25 * dt);
      if (p.injetor.cargas < G.INJETOR.cargas && !J.avisouAbrigo) { p.injetor.cargas = G.INJETOR.cargas; J.avisouAbrigo = true; aviso('Abrigo: Injetor reabastecido', G.COR.verde); }
    } else J.avisouAbrigo = false;

    if (p.kx || p.ky) {   // arremesso (Estivador) e puxão (Triturador)
      p.x += p.kx * dt; p.y += p.ky * dt;
      const k = Math.exp(-8 * dt); p.kx *= k; p.ky *= k;
      if (Math.abs(p.kx) + Math.abs(p.ky) < 5) p.kx = p.ky = 0;
    }
    const vel = G.VELOCIDADE * (1 + p.velMov) * (p.ressaca > 0 ? 0.7 : 1);
    if (p.rola > 0) {
      p.rola -= dt;
      const v = KIT.esquiva.base.distancia * M / 0.3;
      p.x += Math.cos(p.rolaDir) * v * dt; p.y += Math.sin(p.rolaDir) * v * dt;
      if (p.lend.has('botas_de_trilho')) J.rastros.push({ x: p.x, y: p.y, t: 2, dps: 15 + 2 * (p.nivel - 1) });
      if (p.rola <= 0) fimDaEsquiva(p);
    } else if (p.investe > 0) {
      p.investe -= dt;
      const h = p.investeH, v = h.base.distancia * M / 0.3;
      p.x += Math.cos(p.investeDir) * v * dt; p.y += Math.sin(p.investeDir) * v * dt;
      for (const e of J.inimigos) {
        if (e.morto || e.amigo || p.investeHit.has(e)) continue;
        if (G.d2(e.x, e.y, p.x, p.y) < (e.r + p.r + 12) ** 2) {
          p.investeHit.add(e);
          const emp = h.base.empurrao * M / 0.22;
          ferirInimigo(e, danoHab(p, h), { kx: Math.cos(p.investeDir) * emp, ky: Math.sin(p.investeDir) * emp, atordoa: h.base.atordoamento, de: p });
          tremer(4);
        }
      }
    } else if (p.puxa > 0) {
      p.puxa -= dt;
      const k = Math.min(1, dt / Math.max(0.01, p.puxa + dt));
      p.x += (p.puxaAlvo.x - p.x) * k; p.y += (p.puxaAlvo.y - p.y) * k;
    } else if (p.atordoado <= 0) {
      const sp = vel * Math.min(1, Math.hypot(I.mx, I.my));
      p.x += I.mx * sp * dt; p.y += I.my * sp * dt;
      p.passo = sp > 1 ? p.passo + dt * 1.6 * sp / G.VELOCIDADE : 0;
      if (sp > 1) { p.dir = Math.atan2(I.my, I.mx); if (p.atirou <= 0 && Math.abs(I.mx) > 0.15) p.olha = I.mx > 0 ? 1 : -1; }
    }
    G.mundo.colidir(p);

    // perto de alguém com quem dá pra falar?
    J.perto = null;
    for (const n of ch.npcs || []) if (G.d2(p.x, p.y, n.x, n.y) < 90 * 90) J.perto = n;
    while (I.fila.length) {
      const a = I.fila.shift();
      if (a === 'esquiva') esquiva(p);
      else if (a === 'injetor') { if (J.perto && G.abrirLoja) G.abrirLoja(J.perto.id); else injetar(p); }
      else if (a === 'painel') { if (G.abrirPainel) G.abrirPainel(); }
      else if (p.rola <= 0 && p.investe <= 0) usar(p, a);
    }
    if (I.atacar && p.rola <= 0 && p.investe <= 0 && p.atordoado <= 0) basico(p);
    J.alvo = mirar(p, KIT.basico.base.alcance * M);
    checarBiscate(p);
  }

  function atualizarProjs(dt) {
    const p = J.p;
    for (const pr of J.projs) {
      const dd = pr.dono === 'e' ? dt * (J.lentidao > 0 ? 1 - J.lentidaoForca : 1) : dt;
      pr.vida -= dd;
      const passo = Math.hypot(pr.vx, pr.vy) * dd, n = Math.max(1, Math.ceil(passo / 10));
      for (let s = 0; s < n && pr.vida > 0; s++) {
        pr.x += pr.vx * dd / n; pr.y += pr.vy * dd / n;
        if (G.mundo.bloqueado(pr.x, pr.y)) { pr.vida = 0; particulas(pr.x, pr.y, 4, '#d9d2c0', 120, 0.2, 2, 30); break; }
        if (pr.dono === 'p') {
          for (const e of J.inimigos) {
            if (e.morto || e.amigo || G.d2(e.x, e.y, pr.x, pr.y) > (e.r + pr.r) ** 2 || (pr.acertados && pr.acertados.has(e))) continue;
            const v = Math.hypot(pr.vx, pr.vy);
            const queima = pr.basico && p.chanceQueimar && Math.random() < p.chanceQueimar.chanceQueimar ? { dps: p.chanceQueimar.danoPorSegundo, t: p.chanceQueimar.duracao * p.duracao } : null;
            ferirInimigo(e, pr.dano, { kx: pr.vx / v * pr.empurra, ky: pr.vy / v * pr.empurra, de: p, queima });
            if (pr.carga) p.carga = Math.min(p.cargaMax, p.carga + pr.carga);
            if (pr.perfura) pr.acertados.add(e); else { pr.vida = 0; break; }
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
          if (e.morto || e.amigo) continue;
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
    // rastro elétrico das Botas de Trilho
    for (const r of J.rastros) {
      r.t -= dt;
      for (const e of J.inimigos) if (!e.morto && !e.amigo && G.d2(e.x, e.y, r.x, r.y) < (e.r + 16) ** 2) {
        e.dotAcum = (e.dotAcum || 0) + r.dps * dt / 6;
        if (e.dotAcum >= 1) { const v = Math.floor(e.dotAcum); e.dotAcum -= v; ferirInimigo(e, v, { dot: true, semCritico: true, semRecuo: true }); }
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
      const d = Math.hypot(p.x - l.x, p.y - l.y), ima = l.tipo === 'item' ? 60 : 140;
      if (d < 22) { if (pegar(l)) l.pego = true; }
      else if (d < ima) { const v = 480 * dt / d; l.x += (p.x - l.x) * v; l.y += (p.y - l.y) * v; }
    }
  }

  function poseJogador() {
    const p = J.p;
    p.fig = p.rola > 0 ? { pose: 'rola', fase: 1 - p.rola / 0.3 }
      : p.investe > 0 || p.puxa > 0 ? { pose: 'investe' }
      : p.atordoado > 0 ? { pose: 'recua' }
      : p.atirou > 0 ? { pose: 'atira', mira: p.mira }
      : p.passo > 0 ? { pose: 'anda', fase: p.passo % 1, mira: 0.7 }
      : { pose: 'parado', mira: 0.7 };
    p.fig.olha = p.olha; p.fig.flash = p.flash > 0 ? p.flash * 3 : 0;
    p.fig.alfa = p.inv > 0 && p.rola <= 0 && p.investe <= 0 && Math.floor(J.t * 16) % 2 ? 0.55 : null;
  }

  // efeitos do Ruído no mundo: Surto e Eco na Estática
  function ruido(p, dt) {
    if (J.surto > 0) J.surto -= dt;
    const emCombate = J.inimigos.some(e => !e.morto && !e.amigo && e.estado === 'caca' && G.d2(e.x, e.y, p.x, p.y) < 700 * 700);
    if (!emCombate || !['estatica', 'afinado'].includes(p.estagioRuim.id)) return;
    J.combate += dt;
    if (J.combate >= J.proxSurto) {
      J.combate = 0; J.proxSurto = G.rand(60, 90); J.surto = 4;
      aviso('SURTO', G.COR.lavanda, true);
      G.inimigos.criarEco(p);
    }
  }

  function compactar(arr, vivo) { let j = 0; for (let i = 0; i < arr.length; i++) if (vivo(arr[i])) arr[j++] = arr[i]; arr.length = j; }

  let relogioPoda = 0, relogioCalculo = 0;
  G.atualizar = dt => {
    const p = J.p;
    J.t += dt;
    J.tremor = Math.max(0, J.tremor - 40 * dt);
    if (J.lentidao > 0) J.lentidao -= dt;
    if (J.marca && (J.marca.t -= dt) <= 0) J.marca = null;
    G.input.atualizar();
    if ((relogioCalculo -= dt) <= 0) { relogioCalculo = 0.5; recalcular(p); }
    if ((relogioPoda -= dt) <= 0) { relogioPoda = 2; G.mundo.podar(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)); G.inimigos.podar(); }
    atualizarJogador(p, dt);
    G.inimigos.atualizar(dt * (J.lentidao > 0 ? 1 - J.lentidaoForca : 1), dt);
    atualizarProjs(dt);
    atualizarFx(dt);
    atualizarLoot(dt);
    ruido(p, dt);
    for (const q of J.parts) {
      q.vida -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vz -= 500 * dt; q.z = Math.max(0, q.z + q.vz * dt);
      const k = Math.exp(-3 * dt); q.vx *= k; q.vy *= k;
    }
    for (const t of J.textos) t.t += dt;
    compactar(J.inimigos, e => !e.morto);
    compactar(J.projs, q => q.vida > 0);
    compactar(J.fx, f => f.t < f.dur || (f.tipo === 'granada' && !f.explodiu));
    compactar(J.loot, l => !l.pego && l.t < 120);
    compactar(J.parts, q => q.vida > 0);
    compactar(J.textos, t => t.t < t.vida);
    compactar(J.rastros, r => r.t > 0);
    if (J.alvo && J.alvo.morto) J.alvo = null;
    poseJogador();
    const b = G.mundo.bairroNoPonto(p.x, p.y);
    if (b !== J.bairro) {
      J.bairro = b; recalcular(p);
      if (G.aoMudarBairro) G.aoMudarBairro(b);
      // portais de varredura nas Docas e Torres
      if ((b === 'docas' || b === 'torres') && J.t - J.portalT > 90) {
        J.portalT = J.t;
        const ganho = S().passarPortal(p);
        if (ganho) aviso(`Portal de varredura: implante sem lacre detectado · Atenção ${p.atencao}`, G.COR.coral);
      }
    }
  };

  G.reerguer = () => {
    const p = J.p, perda = Math.floor(p.lascas * 0.1);
    p.lascas -= perda;
    p.x = C / 2; p.y = C / 2 + 80; p.hp = p.hpMax; p.carga = p.cargaMax; p.morto = false; p.inv = 2;
    p.cd.basico = p.cd.esquiva = 0; p.cd.s = {}; p.rola = p.investe = p.puxa = 0; p.kx = p.ky = 0; p.atordoado = 0;
    G.inimigos.desistir();
    J.projs.length = 0;
    return perda;
  };

  G.recalcular = () => J.p && recalcular(J.p);
  G.ent = { ferirInimigo, ferirJogador, tiro, particulas, texto, tremer, soltar, matar, aviso: (...a) => aviso(...a), danoHab, multDano };
  G.combate = { usar, basico, esquiva, injetar, mirar, ganharXP, recalcular };
})();

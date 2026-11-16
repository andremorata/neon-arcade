'use strict';
// Inimigos: quem nasce em cada bairro, como cada tipo pensa e o chefe do Ato I.
// Todo golpe avisa antes com uma forma no chão (aviso); quando o aviso acaba, desferir().
(() => {
  const G = window.G, M = G.M, C = G.CHUNK, J = G.jogo;
  const E = () => G.ent;

  // especiais que não estão no dossiê como inimigo comum
  G.INIMIGOS.cobrador = { id: 'cobrador', nome: 'Cobrador da Fiança', tipo: 'humano', vida: 60, dano: 12, intervaloAtaque: 1.2, alcance: 7, velocidade: 3, telegrafo: 0.5, xp: 25, lascas: [4, 8] };
  G.INIMIGOS.eco = { id: 'eco', nome: 'Eco', tipo: 'humano', vida: 1, dano: 10, intervaloAtaque: 0.6, alcance: 7, velocidade: 4.5, telegrafo: 0.3, xp: 0, lascas: null };

  const FIG = {
    goteira_faca: 'faca', goteira_atirador: 'atirador', portao: 'portao', calha: 'calha',
    estivador_exo: 'estivador', vigia_cordame: 'vigia', empilhadeira: 'empilhadeira',
    drone_carcara: 'carcara', cupins: 'cupim', triturador: 'triturador',
    chiado: 'chiado', sentinela_coro: 'sentinela', verme_de_trilho: 'verme',
    guarda_limpida: 'guarda', drone_aureola: 'aureola', afinado: 'afinado', cobrador: 'cobrador', eco: 'eco',
  };
  const RAIO = { portao: 22, calha: 22, estivador_exo: 20, empilhadeira: 26, triturador: 28, verme_de_trilho: 26, cupins: 8, drone_carcara: 12, drone_aureola: 12 };
  const VOA = new Set(['drone_carcara', 'drone_aureola']);

  function criar(id, nivel, x, y, quadra) {
    const def = G.INIMIGOS[id], st = G.inimigoNoNivel(id, nivel);
    return {
      id, tipo: FIG[id], nivel, x, y, hx: x, hy: y, r: RAIO[id] || 15, hp: st.vida, hpMax: st.vida, st, xp: st.xp,
      dano: st.dano, vel: st.velocidade, cd: Math.random() * st.intervalo, estado: 'parado', flash: 0, kx: 0, ky: 0,
      prep: 0, prepMax: 0, aviso: null, acao: null, quadra, fase: Math.random(), olha: -1, ang: Math.PI, anel: Math.random() * Math.PI * 2,
      atordoado: 0, sangra: null, queima: null, recuo: 0, golpeT: 0, morto: false, pack: 0, lado: Math.random() < 0.5 ? 1 : -1,
      maquina: def.tipo === 'maquina', voa: VOA.has(id), elite: !!def.elite, chefe: !!def.chefe, goteira: id.startsWith('goteira') || id === 'portao',
      escudoEnergia: id === 'guarda_limpida' ? 40 : 0, semDano: 9, combateT: 0, tp: G.rand(1, 2), carga: 3, dash: null, rajada: 0,
    };
  }
  function acordar(e) {
    if (e.estado === 'caca' || e.amigo) return;
    // no estágio Afinado a Guarda Límpida não ataca primeiro
    if (e.id === 'guarda_limpida' && J.p.estagioRuim.id === 'afinado' && e.semDano > 1) return;
    e.estado = 'caca';
    for (const o of J.inimigos) if (!o.morto && o.pack === e.pack && o.estado === 'parado') o.estado = 'caca';
  }
  function avisar(e, aviso, acao, dur) { e.aviso = aviso; e.acao = acao; e.prep = e.prepMax = dur; }
  const livreEm = (x, y, r) => G.mundo.livre(x, y, r);

  // ── nascer ──────────────────────────────────────────
  const rep = (id, n) => Array.from({ length: Math.max(0, Math.round(n)) }, () => id);
  const BANDOS = {
    mercado: (r, perto, nivel) => [
      ...rep('goteira_faca', perto ? 2 + r() * 1.5 : 3 + r() * 2.5),
      ...rep('goteira_atirador', perto ? (r() < 0.4 ? 1 : 0) : r() * 2.5),
      ...(!perto && nivel >= 2 && r() < 0.3 ? ['portao'] : []),
    ],
    docas: r => [...rep('estivador_exo', 2 + r() * 1.5), ...rep('vigia_cordame', 1 + r() * 1.5), ...(r() < 0.3 ? ['empilhadeira'] : [])],
    ferro: r => [...(r() < 0.5 ? rep('drone_carcara', 3 + r() * 1.5) : rep('cupins', 8 + r() * 4.5)), ...(r() < 0.25 ? ['triturador'] : [])],
    subsolo: r => [...rep('chiado', 3 + r() * 1.5), ...rep('sentinela_coro', 1 + r() * 1.5), ...(r() < 0.25 ? ['verme_de_trilho'] : [])],
    torres: r => (r() < 0.5 ? [...rep('guarda_limpida', 2 + r() * 1.5), 'drone_aureola'] : rep('afinado', 3 + (r() < 0.4 ? 3 : 0))),
  };

  let proxPack = 1;
  function povoar(ch) {
    const p = J.p;
    if (ch.fora || ch.seguro) return;
    if (ch.arena) { arena(ch); return; }
    // com o Calha vivo, a vizinhança do pátio fica quieta: a luta é com ele
    if (J.chefe && Math.abs(ch.cx - G.ARENA_QUADRA[0]) <= 1 && Math.abs(ch.cy - G.ARENA_QUADRA[1]) <= 1) return;
    let est = J.estadoQuadra.get(ch.chave);
    if (!est) { est = { vivos: 0, volta: 0 }; J.estadoQuadra.set(ch.chave, est); }
    if (est.vivos > 0 || J.t < est.volta) return;
    const B = G.BAIRROS[ch.bairro];
    const r = G.rng((G.hash(ch.cx, ch.cy, 7) + Math.floor(J.t)) >>> 0);
    const dist = Math.hypot(ch.cx, ch.cy), perto = dist < 2;
    if (!perto && r() > 0.5) { est.volta = J.t + 45; return; }
    const pt = G.mundo.pontoLivre(ch, 28, r);
    if (!pt || G.d2(pt.x, pt.y, p.x, p.y) < 420 * 420) { est.volta = J.t + 10; return; }
    const nivel = ch.bairro === 'mercado'
      ? G.clamp(1 + Math.floor(dist / 1.6), B.nivel[0], B.nivel[1])
      : B.nivel[0] + Math.floor(r() * (B.nivel[1] - B.nivel[0] + 1));
    let ids = BANDOS[ch.bairro](r, perto, nivel);
    // Atenção 3 ou mais: patrulha da Guarda Límpida em qualquer bairro
    if (p.atencao >= 3 && ch.bairro !== 'torres' && r() < 0.25) ids = [...rep('guarda_limpida', 2), 'drone_aureola'];
    const pack = proxPack++;
    for (const id of ids) {
      const e = criar(id, nivel + (G.INIMIGOS[id].elite ? 1 : 0), pt.x + G.rand(-60, 60), pt.y + G.rand(-60, 60), ch.chave);
      e.pack = pack; if (!e.voa) G.mundo.colidir(e);
      J.inimigos.push(e); est.vivos++;
    }
  }

  // ── Calha, no Pátio das Calhas ──────────────────────
  function arena(ch) {
    const p = J.p, b = G.BISCATES[p.biscate.i];
    if (J.chefe || p.chefes.calha || !b || b.chefe !== 'calha') return;
    const a = ch.arena;
    const e = criar('calha', Math.max(5, p.nivel), a.x + a.w / 2, a.y + a.h / 2, ch.chave);
    e.arena = a; e.pack = proxPack++; e.estado = 'caca'; e.reforco = 10;
    // quem já estava por perto vai embora
    for (const o of J.inimigos) if (!o.chefe && G.d2(o.x, o.y, e.x, e.y) < 900 * 900) { o.morto = true; const est = J.estadoQuadra.get(o.quadra); if (est) { est.vivos = 0; est.volta = J.t + 60; } }
    J.inimigos.push(e); J.chefe = e; J.faixas = null; J.alagada = null;
    E().aviso('CALHA · LÍDER DOS GOTEIRAS', G.COR.coral, true);
    G.som.explosao();
  }
  function pensarCalha(e, dt, ctx) {
    const p = J.p, a = e.arena;
    if (e.hp < e.hpMax / 2 && !J.alagada) {
      J.alagada = a; e.vel *= 1.2; e.st = { ...e.st, intervalo: e.st.intervalo * 0.8 };
      E().aviso('AS CALHAS ABRIRAM · fuja das faixas', G.COR.lavanda, true); G.som.explosao(); E().tremer(10);
      J.faixas = { estado: 'pausa', t: 1.5, bandas: [], tick: 0 };
    }
    if ((e.reforco -= dt) <= 0) {
      e.reforco = 14;
      for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.5, 0.95]]) {
        const f = criar('goteira_faca', e.nivel - 1, a.x + a.w * fx, a.y + a.h * fy, e.quadra);
        f.pack = e.pack; f.estado = 'caca'; J.inimigos.push(f);
      }
      E().aviso('Calha chamou reforço', G.COR.coral);
    }
    if (e.cd > 0 || ctx.d > 7 * M) return seguir(e, ctx, 1);
    if (Math.random() < 0.5 && ctx.d < e.st.alcance + e.r + p.r + 20) avisar(e, { forma: 'circulo', raio: e.st.alcance + e.r + 20 }, 'giro', e.st.aviso);
    else avisar(e, { forma: 'linha', ang: ctx.angP, comp: 5.5 * M, larg: 26 }, 'chicote', e.st.aviso);
    e.ang = ctx.angP;
    return [0, 0];
  }
  // faixas de choque no chão alagado: aviso, choque, pausa
  function faixas(dt) {
    const F = J.faixas, a = J.alagada, p = J.p;
    if (!F || !a) return;
    F.t -= dt;
    if (F.estado === 'pausa' && F.t <= 0) {
      const todas = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
      F.bandas = todas.slice(0, 2); F.estado = 'aviso'; F.t = 1.2;
    } else if (F.estado === 'aviso' && F.t <= 0) { F.estado = 'choque'; F.t = 0.7; F.tick = 0; G.som.metal(); }
    else if (F.estado === 'choque') {
      if ((F.tick -= dt) <= 0) {
        F.tick = 0.25;
        const i = Math.floor((p.y - a.y) / (a.h / 5));
        if (p.x > a.x && p.x < a.x + a.w && F.bandas.includes(i)) E().ferirJogador(10 * Math.pow(1.11, (J.chefe ? J.chefe.nivel : p.nivel) - 1), J.chefe, { area: true });
      }
      if (F.t <= 0) { F.estado = 'pausa'; F.t = 2.5; }
    }
  }

  // ── Eco e Cobradores ────────────────────────────────
  function criarEco(p) {
    const a = Math.random() * Math.PI * 2;
    let x = p.x + Math.cos(a) * 220, y = p.y + Math.sin(a) * 220;
    if (!livreEm(x, y, 16)) { x = p.x; y = p.y - 120; }
    const e = criar('eco', p.nivel, x, y, null);
    e.hp = e.hpMax = Math.round(p.hpMax * 0.3);
    e.dano = E().danoHab(p, G.KIT.basico) * 0.8; e.estado = 'caca'; e.semRecompensa = true; e.vida = 25;
    J.inimigos.push(e);
    E().particulas(x, y - 40, 20, '#AFA3F5', 160, 0.6, 3, 40);
  }
  function cobradores(p) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(a) * 420, y = p.y + Math.sin(a) * 420;
      if (!livreEm(x, y, 16)) continue;
      const e = criar('cobrador', p.nivel + 1, x, y, null);
      e.estado = 'caca'; e.pack = -1; J.inimigos.push(e);
    }
    E().aviso('A Fiança Áurea mandou cobrar', G.COR.ambar);
  }

  // ── como cada um pensa ──────────────────────────────
  // devolve o vetor de movimento [vx, vy] (comprimento até 1)
  function seguir(e, ctx, k = 1) { return [ctx.dx / ctx.d * k, ctx.dy / ctx.d * k]; }
  function cercar(e, ctx) {
    const p = J.p, raio = (e.st.alcance + e.r + p.r) * 0.8;
    const tx = p.x + Math.cos(e.anel) * raio, ty = p.y + Math.sin(e.anel) * raio;
    const hx = tx - e.x, hy = ty - e.y, hd = Math.hypot(hx, hy) || 1;
    return [hx / hd, hy / hd];
  }
  function distancia(e, ctx, min, max) {
    if (ctx.d > max || !ctx.ve) return seguir(e, ctx);
    if (ctx.d < min) return seguir(e, ctx, -1);
    if (Math.random() < ctx.dt * 0.4) e.lado *= -1;
    return [-ctx.dy / ctx.d * e.lado * 0.5, ctx.dx / ctx.d * e.lado * 0.5];
  }
  const corpoACorpo = (e, ctx) => ctx.d < e.st.alcance + e.r + J.p.r;

  const IA = {
    goteira_faca(e, ctx) {
      if (corpoACorpo(e, ctx)) { if (e.cd <= 0) avisar(e, { forma: 'circulo', raio: e.st.alcance + e.r + 4 }, 'golpe', e.st.aviso); return [0, 0]; }
      return cercar(e, ctx);
    },
    cupins(e, ctx) { return IA.goteira_faca(e, ctx); },
    chiado(e, ctx) {
      // some e reaparece 3 m pra um lado qualquer
      if ((e.tp -= ctx.dt) <= 0) {
        e.tp = G.rand(1.2, 2.2);
        const a = Math.random() * Math.PI * 2, x = e.x + Math.cos(a) * 3 * M, y = e.y + Math.sin(a) * 3 * M;
        if (livreEm(x, y, e.r)) { E().particulas(e.x, e.y - 40, 10, '#AFA3F5', 120, 0.4, 2, 40); e.x = x; e.y = y; E().particulas(x, y - 40, 10, '#AFA3F5', 120, 0.4, 2, 40); }
      }
      if (corpoACorpo(e, ctx)) { if (e.cd <= 0) avisar(e, { forma: 'circulo', raio: e.st.alcance + e.r + 4 }, 'rajada', e.st.aviso); return [0, 0]; }
      return seguir(e, ctx);
    },
    afinado(e, ctx) {
      if (corpoACorpo(e, ctx) && e.cd <= 0) {
        // o grupo ataca no mesmo instante, com um aviso só
        for (const o of J.inimigos) if (!o.morto && o.id === 'afinado' && o.pack === e.pack && o.prep <= 0 && o.estado === 'caca')
          avisar(o, o === e ? { forma: 'circulo', raio: 3 * M } : null, 'golpe', e.st.aviso);
        return [0, 0];
      }
      return cercar(e, ctx);
    },
    estivador_exo(e, ctx) {
      if (corpoACorpo(e, ctx)) { if (e.cd <= 0) avisar(e, { forma: 'circulo', raio: e.st.alcance + e.r + 6 }, 'agarra', e.st.aviso); return [0, 0]; }
      return seguir(e, ctx);
    },
    goteira_atirador(e, ctx) {
      if (ctx.ve && ctx.d < e.st.alcance && ctx.d > 3 * M && e.cd <= 0) avisar(e, { forma: 'mira', ang: ctx.angP, comp: e.st.alcance }, 'tiro', e.st.aviso);
      return distancia(e, ctx, 3 * M, 7 * M);
    },
    cobrador(e, ctx) { return IA.goteira_atirador(e, ctx); },
    eco(e, ctx) {
      if ((e.vida -= ctx.dt) <= 0) { e.morto = true; E().particulas(e.x, e.y - 40, 16, '#AFA3F5', 160, 0.6, 2.5, 50); return [0, 0]; }
      if (ctx.ve && ctx.d < e.st.alcance && e.cd <= 0) avisar(e, ctx.d < 3 * M ? { forma: 'arco', ang: ctx.angP, raio: 4 * M, abre: Math.PI / 3 } : { forma: 'mira', ang: ctx.angP, comp: e.st.alcance }, ctx.d < 3 * M ? 'cone' : 'tiro', e.st.aviso);
      return distancia(e, ctx, 2 * M, 6 * M);
    },
    vigia_cordame(e, ctx) {
      e.combateT += ctx.dt;
      if (e.combateT > 4 && !e.sinalizou) { e.sinalizou = true; avisar(e, { forma: 'sinal' }, 'sinalizador', 0.6); return [0, 0]; }
      return IA.goteira_atirador(e, ctx);
    },
    sentinela_coro(e, ctx) {
      e.combateT += ctx.dt;
      if (ctx.ve && ctx.d < e.st.alcance && e.combateT > 3 && e.cd <= 0) { e.combateT = 0; avisar(e, { forma: 'canal' }, 'trava', e.st.aviso); return [0, 0]; }
      if (ctx.ve && ctx.d < e.st.alcance && e.cd <= 0) avisar(e, { forma: 'mira', ang: ctx.angP, comp: e.st.alcance }, 'tiro', 0.5);
      return distancia(e, ctx, 5 * M, 8 * M);
    },
    guarda_limpida(e, ctx) {
      if (ctx.ve && ctx.d < e.st.alcance && e.cd <= 0) avisar(e, { forma: 'mira', ang: ctx.angP, comp: e.st.alcance }, 'rajada3', e.st.aviso);
      return distancia(e, ctx, 4 * M, 7 * M);
    },
    drone_aureola(e, ctx) {
      // fica perto dos aliados e longe de você
      let ax = 0, ay = 0, n = 0;
      for (const o of J.inimigos) if (!o.morto && o !== e && o.pack === e.pack) { ax += o.x; ay += o.y; n++; }
      if (!n) return distancia(e, ctx, 5 * M, 7 * M);
      ax /= n; ay /= n;
      const fx = ax - e.x - ctx.dx / ctx.d * 120, fy = ay - e.y - ctx.dy / ctx.d * 120, fd = Math.hypot(fx, fy) || 1;
      return fd < 30 ? [0, 0] : [fx / fd, fy / fd];
    },
    portao(e, ctx) {
      e.ang += G.difAng(ctx.angP, e.ang) * Math.min(1, ctx.dt * 3);
      e.carga -= ctx.dt;
      if (corpoACorpo(e, ctx) && e.cd <= 0) { e.ang = ctx.angP; avisar(e, { forma: 'arco', ang: e.ang, raio: e.st.alcance + e.r + J.p.r, abre: Math.PI * 2 / 3 }, 'arco', e.st.aviso); return [0, 0]; }
      if (e.carga <= 0 && ctx.d > 3 * M && ctx.d < 7 * M && ctx.ve) { e.ang = ctx.angP; e.carga = 6; avisar(e, { forma: 'linha', ang: e.ang, comp: 6 * M, larg: e.r + 16 }, 'investida', 1); return [0, 0]; }
      return [Math.cos(e.ang), Math.sin(e.ang)];
    },
    empilhadeira(e, ctx) {
      if (ctx.ve && ctx.d < 8 * M && e.cd <= 0) { e.ang = ctx.angP; avisar(e, { forma: 'linha', ang: e.ang, comp: 8 * M, larg: e.r + 12 }, 'investida', e.st.aviso); return [0, 0]; }
      return ctx.d > 6 * M ? seguir(e, ctx, 0.5) : [0, 0];
    },
    verme_de_trilho(e, ctx) {
      if (ctx.ve && ctx.d < 10 * M && e.cd <= 0) { e.ang = ctx.angP; avisar(e, { forma: 'linha', ang: e.ang, comp: 10 * M, larg: e.r + 14, trilho: true }, 'investida', e.st.aviso); return [0, 0]; }
      return seguir(e, ctx, 0.3);
    },
    drone_carcara(e, ctx) {
      // circula a 6 m e mergulha em linha
      if (ctx.d < 7.5 * M && e.cd <= 0) { e.ang = ctx.angP; avisar(e, { forma: 'linha', ang: e.ang, comp: 7 * M, larg: 22 }, 'mergulho', e.st.aviso); return [0, 0]; }
      const raio = 6 * M, a = Math.atan2(e.y - J.p.y, e.x - J.p.x) + e.lado * 0.9 * ctx.dt * 2;
      const tx = J.p.x + Math.cos(a) * raio, ty = J.p.y + Math.sin(a) * raio, hx = tx - e.x, hy = ty - e.y, hd = Math.hypot(hx, hy) || 1;
      return [hx / hd, hy / hd];
    },
    triturador(e, ctx) {
      if (e.cd <= 0 && ctx.ve) {
        e.ang = ctx.angP;
        if (ctx.d > 3.5 * M && ctx.d < 8 * M) { avisar(e, { forma: 'linha', ang: e.ang, comp: ctx.d, larg: 18, ima: true }, 'ima', e.st.aviso); return [0, 0]; }
        if (ctx.d < 3.5 * M) { avisar(e, { forma: 'arco', ang: e.ang, raio: 3 * M + e.r, abre: Math.PI * 2 / 3 }, 'tritura', e.st.aviso); return [0, 0]; }
      }
      return seguir(e, ctx);
    },
    calha: (e, ctx) => pensarCalha(e, ctx.dt, ctx),
  };

  function desferir(e, ctx) {
    const p = J.p, st = e.st, alc = st.alcance + e.r + p.r;
    e.cd = st.intervalo * G.rand(0.9, 1.15); e.golpeT = 0.25;
    switch (e.acao) {
      case 'golpe': if (ctx.d < (e.aviso && e.aviso.forma === 'circulo' && e.id === 'afinado' ? alc : alc + 12)) E().ferirJogador(e.dano, e); G.som.faca(); break;
      case 'rajada': e.rajada = 3; e.rajadaT = 0; break;
      case 'agarra':
        if (ctx.d < alc + 14 && E().ferirJogador(e.dano, e)) {
          // agarrou: arremessa 4 m
          p.kx = ctx.dx / ctx.d * 4 * M / 0.25; p.ky = ctx.dy / ctx.d * 4 * M / 0.25; p.atordoado = 0.35;
          E().tremer(8);
        }
        G.som.metal(); break;
      case 'tiro':
        E().tiro(e.x + Math.cos(ctx.angP) * 20, e.y + Math.sin(ctx.angP) * 12, ctx.angP, 560, e.dano, st.alcance + 60, 'e', { cor: e.id === 'eco' ? '#AFA3F5' : G.COR.coral, de: e });
        G.som.inimigoTiro(); break;
      case 'rajada3': e.rajada = 3; e.rajadaT = 0; e.rajadaTiro = true; break;
      case 'cone':
        if (ctx.d < 4 * M && Math.abs(G.difAng(ctx.angP, e.aviso.ang)) < Math.PI / 6 + 0.1) E().ferirJogador(e.dano * 2, e);
        G.som.rajada(); break;
      case 'arco':
        if (ctx.d < alc + 14 && Math.abs(G.difAng(ctx.angP, e.ang)) < Math.PI / 3) E().ferirJogador(e.dano, e);
        E().tremer(4); G.som.metal(); break;
      case 'tritura':
        if (ctx.d < 3 * M + e.r + p.r && Math.abs(G.difAng(ctx.angP, e.ang)) < Math.PI / 3) E().ferirJogador(e.dano, e);
        E().tremer(6); G.som.metal(); break;
      case 'ima':
        // puxa o jogador 3 m na direção do Triturador
        if (ctx.ve) { p.kx = -ctx.dx / ctx.d * 3 * M / 0.25; p.ky = -ctx.dy / ctx.d * 3 * M / 0.25; }
        e.cd = 0.5; G.som.escudo(); break;
      case 'investida': {
        const L = e.aviso.comp, dur = e.id === 'portao' ? 0.4 : L / (e.id === 'verme_de_trilho' ? 6 * M * 1.6 : 5 * M * 1.4);
        e.dash = { t: dur, v: L / dur, ang: e.ang, acertou: false, dano: e.id === 'portao' ? e.dano * 28 / 22 : e.dano };
        G.som.investida(); break;
      }
      case 'mergulho': e.dash = { t: 0.35, v: 7 * M / 0.35, ang: e.ang, acertou: false, dano: e.dano }; G.som.investida(); break;
      case 'sinalizador': {
        E().aviso('Sinalizador! Vêm reforços', G.COR.ambar);
        for (let i = 0; i < 2; i++) {
          const f = criar('estivador_exo', e.nivel, e.x + G.rand(-120, 120), e.y + G.rand(-120, 120), e.quadra);
          f.pack = e.pack; f.estado = 'caca'; G.mundo.colidir(f); J.inimigos.push(f);
          const est = J.estadoQuadra.get(e.quadra); if (est) est.vivos++;
        }
        J.fx.push({ tipo: 'clarao', x: e.x, y: e.y - 80, t: 0, dur: 0.6, raio: 160 });
        e.cd = 1; break;
      }
      case 'trava': {
        const livres = p.slots.map((id, i) => (id ? i : -1)).filter(i => i >= 0);
        if (livres.length) { const i = livres[(Math.random() * livres.length) | 0]; p.travadas[i] = 3; E().aviso('O Coro travou uma habilidade', G.COR.lavanda); }
        e.cd = 2; break;
      }
      case 'giro':
        if (ctx.d < e.aviso.raio + p.r) { E().ferirJogador(e.dano, e); }
        J.fx.push({ tipo: 'anel', x: e.x, y: e.y, t: 0, dur: 0.35, raio: e.aviso.raio, cor: G.COR.coral }); E().tremer(5); G.som.metal(); break;
      case 'chicote': {
        // ponto mais perto do jogador no segmento do chicote
        const a = e.aviso.ang, L = e.aviso.comp, px = p.x - e.x, py = p.y - e.y, t = G.clamp(px * Math.cos(a) + py * Math.sin(a), 0, L);
        if (Math.hypot(px - Math.cos(a) * t, py - Math.sin(a) * t) < e.aviso.larg + p.r) E().ferirJogador(e.dano * 1.2, e);
        G.som.faca(); break;
      }
    }
    e.aviso = null; e.acao = null;
  }

  const AGGRO = 340, CORRENTE = 900;
  function pensar(e, dt) {
    const p = J.p;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 1800 && !e.chefe) return;
    e.flash -= dt; e.fase += dt; e.recuo -= dt; e.golpeT -= dt; e.semDano += dt;
    if (e.provocado > 0) e.provocado -= dt;
    for (const k of ['sangra', 'queima']) {
      const s = e[k];
      if (!s) continue;
      s.t -= dt; s.acum = (s.acum || 0) + s.dps * dt;
      if (s.acum >= 1) { const v = Math.floor(s.acum); s.acum -= v; E().ferirInimigo(e, v, { dot: true, semCritico: true, semRecuo: true }); if (e.morto) return; if (Math.random() < 0.3) E().particulas(e.x, e.y - 30, 1, k === 'queima' ? '#F2C38B' : '#7a2a2a', 40, 0.4, 2, 30); }
      if (s.t <= 0) e[k] = null;
    }
    if (e.id === 'guarda_limpida' && e.semDano > 4) e.escudoEnergia = 40;
    if (e.puxado) {
      const k = Math.min(1, dt / Math.max(0.01, e.puxado.t)); e.x += (e.puxado.x - e.x) * k; e.y += (e.puxado.y - e.y) * k;
      if ((e.puxado.t -= dt) <= 0) e.puxado = null;
      return;
    }
    if (e.kx || e.ky) {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const k = Math.exp(-9 * dt); e.kx *= k; e.ky *= k;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 4) e.kx = e.ky = 0;
    }
    if (e.atordoado > 0) { e.atordoado -= dt; e.prep = 0; e.aviso = null; e.dash = null; return; }
    const angP = Math.atan2(dy, dx);
    const ctx = { dx, dy, d, angP, dt, ve: e.voa || G.mundo.visao(e.x, e.y, p.x, p.y) };
    // investida / mergulho em curso
    if (e.dash) {
      const s = e.dash;
      s.t -= dt;
      e.x += Math.cos(s.ang) * s.v * dt; e.y += Math.sin(s.ang) * s.v * dt;
      if (!s.acertou && G.d2(e.x, e.y, p.x, p.y) < (e.r + p.r + 12) ** 2) { s.acertou = true; E().ferirJogador(s.dano, e); E().tremer(6); }
      if (s.t <= 0) e.dash = null;
      e.andando = true;
      return;
    }
    // rajadas (Chiado, Guarda): golpes ou tiros em sequência
    if (e.rajada > 0 && (e.rajadaT -= dt) <= 0) {
      e.rajada--; e.rajadaT = 0.14;
      if (e.rajadaTiro) { E().tiro(e.x + Math.cos(angP) * 20, e.y + Math.sin(angP) * 12, angP + G.rand(-0.06, 0.06), 620, e.dano, e.st.alcance + 60, 'e', { cor: G.COR.coral, de: e }); G.som.inimigoTiro(); }
      else if (d < e.st.alcance + e.r + p.r + 12) { E().ferirJogador(e.dano, e); G.som.faca(); }
      if (!e.rajada) e.rajadaTiro = false;
    }
    if (e.cd > 0) e.cd -= dt;
    let v = [0, 0];
    const casa = e.arena ? { x: e.arena.x + e.arena.w / 2, y: e.arena.y + e.arena.h / 2 } : { x: e.hx, y: e.hy };
    const longe = G.d2(e.x, e.y, casa.x, casa.y) > CORRENTE * CORRENTE;
    const abrigado = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)).seguro;
    if (e.estado === 'parado') {
      if (!p.morto && d < AGGRO && ctx.ve) acordar(e);
      v = [Math.cos(e.fase * 0.7) * 0.12, Math.sin(e.fase * 0.5) * 0.12];
    } else if (e.estado === 'caca') {
      if (p.morto || (longe && !(e.provocado > 0)) || abrigado) { e.estado = 'volta'; e.prep = 0; e.aviso = null; }
      else if (e.prep > 0) {
        e.prep -= dt;
        if (e.aviso && e.aviso.forma === 'mira') e.aviso.ang = angP;   // a mira acompanha até o tiro
        if (e.prep <= 0) desferir(e, ctx);
      } else if (e.provocado > 0) v = corpoACorpo(e, ctx) ? (e.cd <= 0 && IA[e.id](e, ctx), [0, 0]) : seguir(e, ctx);
      else v = IA[e.id](e, ctx) || [0, 0];
      if (e.id === 'drone_aureola') {
        for (const o of J.inimigos) if (!o.morto && o !== e && G.d2(o.x, o.y, e.x, e.y) < (7 * M) ** 2) {
          o.hp = Math.min(o.hpMax, o.hp + o.hpMax * 0.06 * dt);
          if (o.id === 'guarda_limpida') o.escudoEnergia = 40;
        }
      }
    } else {
      const hx = casa.x - e.x, hy = casa.y - e.y, hd = Math.hypot(hx, hy);
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.3 * dt);
      if (hd < 30) { e.estado = 'parado'; e.hp = e.hpMax; } else v = [hx / hd, hy / hd];
    }
    const lento = e.prep > 0 ? 0.1 : 1;
    e.x += v[0] * e.vel * lento * dt; e.y += v[1] * e.vel * lento * dt;
    e.andando = Math.hypot(v[0], v[1]) > 0.3;
    const olhar = e.estado === 'caca' ? Math.cos(angP) : v[0];
    if (Math.abs(olhar) > 0.15) e.olha = olhar > 0 ? 1 : -1;
    if (e.id !== 'portao' && e.estado === 'caca' && !e.prep) e.ang = angP;
  }

  function separar() {
    const L = J.inimigos;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.morto) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.morto || a.voa !== b.voa) continue;
        const dx = b.x - a.x, dy = b.y - a.y, r = a.r + b.r, dd = dx * dx + dy * dy;
        if (dd >= r * r || dd < 1e-6) continue;
        const d = Math.sqrt(dd), k = (r - d) / d * 0.5;
        a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
      }
    }
  }

  const ATIRA = new Set(['goteira_atirador', 'vigia_cordame', 'sentinela_coro', 'guarda_limpida', 'cobrador', 'eco', 'triturador']);
  function poses() {
    for (const e of J.inimigos) {
      let pose = 'parado', fase = 0;
      if (e.recuo > 0) pose = 'recua';
      else if (e.dash) pose = 'investe';
      else if (e.prep > 0) { pose = ATIRA.has(e.id) && e.acao !== 'tritura' ? 'atira' : 'golpe'; fase = 0.3 * (1 - e.prep / e.prepMax); }
      else if (e.golpeT > 0 || e.rajada > 0) { pose = ATIRA.has(e.id) ? 'atira' : 'golpe'; fase = 0.9; }
      else if (e.andando) { pose = e.estado === 'caca' && !e.elite && !e.maquina ? 'corre' : 'anda'; fase = (e.fase * (pose === 'corre' ? 1.8 : 1.2)) % 1; }
      else if (ATIRA.has(e.id) && e.estado === 'caca') pose = 'atira';
      if (e.chefe && e.prep > 0 && e.acao === 'giro') fase = e.fase * 2 % 1;
      e.fig = { pose, fase, olha: e.olha, mira: e.ang, flash: e.flash > 0 ? e.flash * 5 : 0 };
    }
  }

  function atualizar(dt, dtReal) {
    const p = J.p;
    const pcx = G.mundo.quadraDe(p.x), pcy = G.mundo.quadraDe(p.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) povoar(G.mundo.chunk(pcx + dx, pcy + dy));
    for (const e of J.inimigos) if (!e.morto) { pensar(e, dt); if (!e.morto && !e.voa && !e.dash) G.mundo.colidir(e); else if (e.dash && !e.voa && G.mundo.colidir(e)) e.dash = null; }
    separar();
    faixas(dtReal);
    // dívida acima do limite: Cobradores a cada 8 minutos
    J.cobradorT += dtReal;
    if (J.cobradorT > 480) { J.cobradorT = 0; if (p.divida > G.sistemas.limiteDivida(p)) cobradores(p); }
    poses();
  }

  function podar() {
    const p = J.p;
    for (const e of J.inimigos) {
      if (e.morto || e.chefe || e.estado === 'caca' || G.d2(e.x, e.y, p.x, p.y) < 1700 * 1700) continue;
      e.morto = true;
      const est = J.estadoQuadra.get(e.quadra);
      if (est) { est.vivos = Math.max(0, est.vivos - 1); if (!est.vivos) est.volta = 0; }
    }
    if (J.chefe && G.d2(J.chefe.x, J.chefe.y, p.x, p.y) > 2400 * 2400) { J.chefe.morto = true; J.chefe = null; J.alagada = null; J.faixas = null; }
  }
  function desistir() {
    for (const e of J.inimigos) if (e.estado === 'caca') { e.estado = 'volta'; e.prep = 0; e.aviso = null; }
    if (J.chefe) { J.chefe.morto = true; J.chefe = null; J.alagada = null; J.faixas = null; }
  }

  G.inimigos = { criar, acordar, povoar, atualizar, podar, desistir, criarEco, cobradores, FIG };
})();

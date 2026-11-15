'use strict';
// Jogador, inimigos, tiros, loot e efeitos. Toda a regra de combate mora aqui.
(() => {
  const G = window.G;
  const C = G.CHUNK;
  const J = G.jogo = {
    p: null, inimigos: [], projs: [], fx: [], loot: [], textos: [], parts: [],
    t: 0, tremor: 0, alvo: null, bairro: null, estadoQuadra: new Map(),
  };
  let aviso = () => {};          // a HUD pluga aqui os avisos de tela (loot, nível)
  G.avisar = f => { aviso = f; };
  const MAX_PARTS = () => (G.input.toque ? 220 : 420);

  // ── Jogador ─────────────────────────────────────────
  function novoJogador(s = {}) {
    const p = {
      x: s.x ?? C / 2, y: s.y ?? C / 2 + 60, r: 15, dir: -Math.PI / 2,
      nivel: s.nivel || 1, xp: s.xp || 0, creditos: s.creditos || 0,
      equip: s.equip || { arma: null, jaqueta: null },
      hp: 1, hpMax: 1, en: 100, enMax: 100, cds: G.HAB.map(() => 0),
      dash: 0, dashDir: 0, dashHit: null, inv: 0, flash: 0, semDano: 9, morto: false, passo: 0, andando: 0,
    };
    recalcular(p); p.hp = p.hpMax;
    return p;
  }
  function recalcular(p) {
    const a = p.equip.arma, j = p.equip.jaqueta;
    p.hpMax = Math.round(100 + 14 * (p.nivel - 1) + (j ? j.vida : 0));
    p.danoMult = (1 + 0.07 * (p.nivel - 1)) * (1 + (a ? a.dano / 100 : 0));
    p.hp = Math.min(p.hp, p.hpMax);
  }

  G.iniciarJogo = save => {
    J.p = novoJogador(save);
    J.inimigos.length = J.projs.length = J.fx.length = J.loot.length = J.textos.length = J.parts.length = 0;
    J.estadoQuadra.clear(); J.alvo = null; J.bairro = null; J.t = 0;
  };
  G.salvavel = () => {
    const p = J.p;
    return { v: 1, nivel: p.nivel, xp: p.xp, creditos: p.creditos, equip: p.equip, x: Math.round(p.x), y: Math.round(p.y) };
  };

  // ── Efeitos visuais ─────────────────────────────────
  function particulas(x, y, n, cor, vel = 220, vida = 0.5, tam = 3) {
    const max = MAX_PARTS();
    for (let i = 0; i < n && J.parts.length < max; i++) {
      const a = Math.random() * Math.PI * 2, v = vel * (0.3 + Math.random());
      J.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: vida * (0.5 + Math.random() * 0.7), max: vida, cor, tam });
    }
  }
  function texto(x, y, txt, cor, grande) {
    J.textos.push({ x: x + G.rand(-8, 8), y, txt, cor, t: 0, vida: grande ? 1.1 : 0.8, grande });
  }
  const tremer = v => { J.tremor = Math.max(J.tremor, v); };

  // ── Mira automática ─────────────────────────────────
  function mouseMundo() {
    const m = G.input.mouse;
    return m.ativo && !G.input.toque && G.render ? G.render.telaParaMundo(m.x, m.y) : null;
  }
  function mirar(p, alcance) {
    const a2 = alcance * alcance, mm = mouseMundo();
    // mouse em cima de um inimigo escolhe o alvo
    if (mm) {
      let melhor = null, md = 60 * 60;
      for (const e of J.inimigos) {
        if (e.morto) continue;
        const d = G.d2(e.x, e.y - 14, mm.x, mm.y);
        if (d < md && G.d2(e.x, e.y, p.x, p.y) < a2) { md = d; melhor = e; }
      }
      if (melhor) return melhor;
    }
    let melhor = null, ms = Infinity;
    for (const e of J.inimigos) {
      if (e.morto) continue;
      const d = G.d2(e.x, e.y, p.x, p.y);
      if (d > a2) continue;
      // fica com o alvo atual a não ser que outro esteja bem mais perto
      const s = Math.sqrt(d) * (e === J.alvo ? 0.6 : 1);
      if (s < ms && G.mundo.visao(p.x, p.y, e.x, e.y)) { ms = s; melhor = e; }
    }
    return melhor;
  }
  function anguloPara(p, alvo) {
    if (alvo) return Math.atan2(alvo.y - p.y, alvo.x - p.x);
    const mm = mouseMundo();
    if (mm) return Math.atan2(mm.y - p.y, mm.x - p.x);
    return p.dir;
  }

  // ── Habilidades ─────────────────────────────────────
  function tiro(x, y, ang, vel, dano, vida, dono, cor, r = 5, extra) {
    J.projs.push(Object.assign({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, dano, vida, dono, cor, r }, extra));
  }

  function usar(p, i) {
    const h = G.HAB[i];
    if (!h || p.morto || p.cds[i] > 0 || p.en < h.custo) return false;
    const alvo = mirar(p, i === 3 ? 460 : 520);
    const ang = anguloPara(p, alvo);
    p.dir = ang; p.cds[i] = h.cd; p.en -= h.custo; p.atirou = 0.15;
    const bx = p.x + Math.cos(ang) * 18, by = p.y + Math.sin(ang) * 18;
    switch (h.id) {
      case 'tiro':
        tiro(bx, by, ang + G.rand(-0.03, 0.03), 780, 12 * p.danoMult, 0.7, 'p', '#00f0ff', 5, { empurra: 60 });
        particulas(bx, by, 3, '#7af7ff', 120, 0.12, 2);
        G.som.tiro();
        break;
      case 'rajada':
        for (let k = -2; k <= 2; k++) {
          tiro(bx, by, ang + k * 0.17 + G.rand(-0.03, 0.03), 700, 10 * p.danoMult, 0.34, 'p', '#ffd23f', 5, { empurra: 300 });
        }
        particulas(bx, by, 10, '#ffd23f', 260, 0.2, 3);
        tremer(5); G.som.rajada();
        break;
      case 'investida': {
        const m = Math.hypot(G.input.mx, G.input.my);
        p.dashDir = m > 0.2 ? Math.atan2(G.input.my, G.input.mx) : ang;
        p.dash = 0.19; p.inv = 0.28; p.dashHit = new Set();
        G.som.investida();
        break;
      }
      case 'granada': {
        let tx, ty;
        if (alvo) { tx = alvo.x; ty = alvo.y; }
        else { tx = p.x + Math.cos(ang) * 240; ty = p.y + Math.sin(ang) * 240; }
        const d = Math.hypot(tx - p.x, ty - p.y), max = 420;
        if (d > max) { tx = p.x + (tx - p.x) * max / d; ty = p.y + (ty - p.y) * max / d; }
        J.fx.push({ tipo: 'granada', x0: p.x, y0: p.y, x1: tx, y1: ty, x: p.x, y: p.y, z: 0, t: 0, dur: 0.55,
          dano: 42 * p.danoMult, raio: 105 });
        G.som.lancar();
        break;
      }
    }
    return true;
  }

  // ── Dano ────────────────────────────────────────────
  function ferirInimigo(e, v, kx = 0, ky = 0) {
    if (e.morto) return;
    const crit = Math.random() < 0.1;
    v = Math.max(1, Math.round(v * (crit ? 1.6 : 1)));
    e.hp -= v; e.flash = 0.1;
    const peso = e.T.voa ? 1.4 : e.elite ? 0.4 : 1;
    e.kx += kx * peso; e.ky += ky * peso;
    acordar(e);
    texto(e.x, e.y - 40, crit ? v + '!' : String(v), crit ? '#ffd23f' : '#ffffff', crit);
    particulas(e.x, e.y - 16, crit ? 8 : 4, e.cor, 180, 0.3, 2.5);
    crit ? G.som.critico() : G.som.acerto();
    if (e.hp <= 0) matar(e);
  }

  function ferirJogador(v) {
    const p = J.p;
    if (p.inv > 0 || p.morto) return;
    v = Math.round(v);
    p.hp -= v; p.flash = 0.18; p.semDano = 0;
    texto(p.x, p.y - 44, '-' + v, '#ff4d6d');
    tremer(Math.min(10, 3 + v / 4));
    G.som.dor();
    if (p.hp <= 0) {
      p.hp = 0; p.morto = true;
      particulas(p.x, p.y - 16, 40, '#00f0ff', 300, 0.9, 3);
      G.som.morte();
      if (G.aoMorrer) G.aoMorrer();
    }
  }

  function matar(e) {
    e.morto = true;
    const p = J.p, T = e.T;
    const dif = e.nivel - p.nivel;
    // inimigo muito mais fraco quase não dá XP: empurra o jogador pro próximo bairro
    const fator = dif <= -6 ? 0.15 : dif <= -3 ? 0.5 : 1;
    ganharXP(Math.round(T.xp * (1 + 0.35 * (e.nivel - 1)) * (e.elite ? 3 : 1) * fator));
    particulas(e.x, e.y - 14, e.elite ? 40 : 18, e.cor, 260, 0.6, 3);
    G.som.morteInimigo();
    if (e.elite) tremer(6);
    const est = J.estadoQuadra.get(e.quadra);
    if (est && --est.vivos <= 0) est.volta = J.t + 120;   // quadra limpa repovoa em 2 minutos
    // créditos sempre; item às vezes, e sempre na elite
    const moedas = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < moedas; i++) soltar(e.x, e.y, { tipo: 'credito', valor: Math.ceil(e.nivel * G.rand(1.5, 3)) });
    if (e.elite || Math.random() < 0.1) soltar(e.x, e.y, { tipo: 'item', item: gerarItem(e.nivel, e.elite ? 1 : 0) });
  }

  function ganharXP(v) {
    const p = J.p;
    if (p.nivel >= G.NIVEL_MAX) return;
    p.xp += v;
    while (p.xp >= G.xpPara(p.nivel) && p.nivel < G.NIVEL_MAX) {
      p.xp -= G.xpPara(p.nivel); p.nivel++;
      recalcular(p); p.hp = p.hpMax; p.en = p.enMax;
      aviso('NÍVEL ' + p.nivel, '#ffd23f', true);
      J.fx.push({ tipo: 'anel', x: p.x, y: p.y, t: 0, dur: 0.7, raio: 140, cor: '#ffd23f' });
      particulas(p.x, p.y - 20, 30, '#ffd23f', 240, 0.8, 3);
      G.som.nivel();
    }
  }

  // ── Loot ────────────────────────────────────────────
  function gerarItem(nivel, minRar) {
    const rs = G.RARIDADES.slice(minRar);
    let s = Math.random() * rs.reduce((a, r) => a + r.peso, 0), rar = rs[0];
    for (const r of rs) { if ((s -= r.peso) < 0) { rar = r; break; } }
    const slot = Math.random() < 0.5 ? 'arma' : 'jaqueta';
    const v = G.rand(0.85, 1.15) * rar.mult;
    const it = { slot, rar: G.RARIDADES.indexOf(rar), nivel,
      nome: G.NOMES[slot][(Math.random() * G.NOMES[slot].length) | 0] + ' ' +
        G.SUFIXOS[rar.id][(Math.random() * G.SUFIXOS[rar.id].length) | 0] };
    if (slot === 'arma') it.dano = Math.round((6 + nivel * 3) * v);
    else it.vida = Math.round((10 + nivel * 9) * v);
    return it;
  }
  const poder = it => (!it ? 0 : it.slot === 'arma' ? it.dano : it.vida / 2);

  function soltar(x, y, obj) {
    const a = Math.random() * Math.PI * 2, v = G.rand(60, 160);
    J.loot.push(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, z: 0, vz: 220 }, obj));
  }

  function pegar(l) {
    const p = J.p;
    if (l.tipo === 'credito') { p.creditos += l.valor; G.som.moeda(); return; }
    const it = l.item, R = G.RARIDADES[it.rar];
    G.som.item(it.rar);
    // sem inventário ainda: equipa se for melhor, senão vende na hora
    if (poder(it) > poder(p.equip[it.slot])) {
      p.equip[it.slot] = it; recalcular(p);
      aviso('Equipado: ' + it.nome + (it.dano ? ` (+${it.dano}% dano)` : ` (+${it.vida} vida)`), R.cor);
    } else {
      const preco = Math.ceil(poder(it) * (1 + it.rar));
      p.creditos += preco;
      aviso(`${it.nome} vendido por ¢${preco}`, R.cor);
    }
  }

  // ── Inimigos ────────────────────────────────────────
  function criarInimigo(tipo, nivel, x, y, quadra, cor, elite) {
    const T = G.INIMIGOS[tipo], f = 1 + 0.32 * (nivel - 1);
    const hp = Math.round(T.hp * f * (elite ? 3 : 1));
    return {
      tipo, T, nivel, x, y, hx: x, hy: y, r: T.r * (elite ? 1.3 : 1), hp, hpMax: hp,
      dano: T.dano * (1 + 0.22 * (nivel - 1)) * (elite ? 1.5 : 1), vel: T.vel * (elite ? 0.9 : 1),
      cd: Math.random() * T.cd, estado: 'parado', flash: 0, kx: 0, ky: 0, prep: 0,
      quadra, cor, elite, fase: Math.random() * 6.28, lado: Math.random() < 0.5 ? 1 : -1, morto: false, pack: 0,
    };
  }

  function acordar(e) {
    if (e.estado === 'caca') return;
    e.estado = 'caca';
    // a turma inteira acorda junto
    for (const o of J.inimigos) if (!o.morto && o.pack === e.pack && o.estado === 'parado') o.estado = 'caca';
  }

  let proxPack = 1;
  function povoar(ch) {
    if (ch.fora || ch.seguro) return;
    let est = J.estadoQuadra.get(ch.chave);
    if (!est) { est = { vivos: 0, volta: 0 }; J.estadoQuadra.set(ch.chave, est); }
    if (est.vivos > 0 || J.t < est.volta) return;
    const B = G.BAIRROS[ch.bairro], p = J.p;
    const r = G.rng((G.hash(ch.cx, ch.cy, 7) + Math.floor(J.t)) >>> 0);
    const tipos = Object.entries(B.inimigos), total = tipos.reduce((a, t) => a + t[1], 0);
    const sorteiaTipo = () => { let s = r() * total; for (const [t, w] of tipos) if ((s -= w) < 0) return t; return tipos[0][0]; };
    const dist = Math.hypot(ch.cx, ch.cy);
    // perto do abrigo, uma turma só; mais longe, às vezes duas
    const nPacks = dist < 2 ? 1 : r() < 0.55 ? 1 : 2;
    for (let k = 0; k < nPacks; k++) {
      const pt = G.mundo.pontoLivre(ch, 20, r);
      if (!pt || G.d2(pt.x, pt.y, p.x, p.y) < 380 * 380) continue;
      // no Mercado o nível sobe devagar conforme se afasta do abrigo
      let nivel = ch.bairro === 'mercado'
        ? G.clamp(1 + Math.floor(dist / 1.6), B.nivel[0], B.nivel[1])
        : B.nivel[0] + Math.floor(r() * (B.nivel[1] - B.nivel[0] + 1));
      const pack = proxPack++, n = 2 + ((r() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const elite = i === 0 && r() < 0.1;
        const tipo = sorteiaTipo();
        const e = criarInimigo(tipo, nivel + (elite ? 1 : 0), pt.x + G.rand(-40, 40), pt.y + G.rand(-40, 40),
          ch.chave, G.pick(r, B.neon), elite);
        e.pack = pack;
        if (!e.T.voa) G.mundo.colidir(e);
        J.inimigos.push(e);
        est.vivos++;
      }
    }
    if (!est.vivos) est.volta = J.t + 20;
  }

  const AGGRO = 330, CORRENTE = 900;
  function pensar(e, dt) {
    const p = J.p, T = e.T;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 1800) return;                     // longe demais: dorme e não gasta CPU
    e.cd -= dt; e.flash -= dt; e.fase += dt;
    if (e.kx || e.ky) {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const k = Math.exp(-9 * dt); e.kx *= k; e.ky *= k;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 4) e.kx = e.ky = 0;
    }
    let vx = 0, vy = 0;
    const longeDeCasa = G.d2(e.x, e.y, e.hx, e.hy) > CORRENTE * CORRENTE;
    const abrigado = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)).seguro;

    if (e.estado === 'parado') {
      if (!p.morto && d < AGGRO && G.mundo.visao(e.x, e.y, p.x, p.y)) acordar(e);
      // passeia de leve em volta de casa
      vx = Math.cos(e.fase * 0.7) * 0.15; vy = Math.sin(e.fase * 0.5) * 0.15;
    } else if (e.estado === 'caca') {
      if (p.morto || longeDeCasa || abrigado) { e.estado = 'volta'; e.prep = 0; }
      else if (T.modo === 'perto') {
        const alcance = T.alcance + e.r + p.r;
        if (e.prep > 0) {
          e.prep -= dt;
          if (e.prep <= 0) { if (d < alcance + 10) ferirJogador(e.dano); e.cd = T.cd; }
        } else if (d < alcance) {
          if (e.cd <= 0) {
            if (T.voa) { ferirJogador(e.dano); e.cd = T.cd; e.kx -= dx / d * 250; e.ky -= dy / d * 250; }
            else e.prep = 0.32;              // o golpe avisa antes: dá pra esquivar
          }
        } else { vx = dx / d; vy = dy / d; }
        if (T.voa) { vx += Math.cos(e.fase * 6) * 0.5 * e.lado; vy += Math.sin(e.fase * 5) * 0.5; }
      } else {
        const ve = G.mundo.visao(e.x, e.y, p.x, p.y);
        if (e.prep > 0) {
          e.prep -= dt;
          if (e.prep <= 0) {
            const a = Math.atan2(dy, dx);
            tiro(e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, a, T.proj, e.dano, 1.2, 'e', '#ff5a3d', 6);
            G.som.inimigoTiro(); e.cd = T.cd * G.rand(0.8, 1.2);
          }
        } else if (d > T.alcance || !ve) { vx = dx / d; vy = dy / d; }
        else if (d < 150) { vx = -dx / d; vy = -dy / d; }
        else {
          // anda de lado enquanto mira
          vx = -dy / d * e.lado * 0.6; vy = dx / d * e.lado * 0.6;
          if (Math.random() < dt * 0.4) e.lado *= -1;
          if (e.cd <= 0) e.prep = 0.4;
        }
      }
    } else {
      const hx = e.hx - e.x, hy = e.hy - e.y, hd = Math.hypot(hx, hy);
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.3 * dt);
      if (hd < 30) { e.estado = 'parado'; e.hp = e.hpMax; }
      else { vx = hx / hd; vy = hy / hd; }
    }
    const lento = e.prep > 0 ? 0.15 : 1;
    e.x += vx * e.vel * lento * dt; e.y += vy * e.vel * lento * dt;
    if (vx || vy) e.olha = Math.atan2(vy, vx);
    if (e.estado === 'caca') e.olha = Math.atan2(dy, dx);
  }

  function separar() {
    const L = J.inimigos;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.morto) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.morto || a.T.voa !== b.T.voa) continue;
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
    for (let i = 0; i < p.cds.length; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
    p.inv -= dt; p.flash -= dt; p.atirou = (p.atirou || 0) - dt; p.semDano += dt;
    if (p.morto) { I.fila.length = 0; return; }
    p.en = Math.min(p.enMax, p.en + 14 * dt);
    const abrigo = G.mundo.chunk(G.mundo.quadraDe(p.x), G.mundo.quadraDe(p.y)).seguro;
    if (p.semDano > 4 || abrigo) p.hp = Math.min(p.hpMax, p.hp + p.hpMax * (abrigo ? 0.25 : 0.03) * dt);

    if (p.dash > 0) {
      p.dash -= dt;
      p.x += Math.cos(p.dashDir) * 1100 * dt; p.y += Math.sin(p.dashDir) * 1100 * dt;
      for (const e of J.inimigos) {
        if (e.morto || p.dashHit.has(e)) continue;
        if (G.d2(e.x, e.y, p.x, p.y) < (e.r + p.r + 10) ** 2) {
          p.dashHit.add(e);
          ferirInimigo(e, 20 * p.danoMult, Math.cos(p.dashDir) * 380, Math.sin(p.dashDir) * 380);
        }
      }
      if (J.parts.length < MAX_PARTS()) J.parts.push({ x: p.x, y: p.y - 16, vx: 0, vy: 0, vida: 0.25, max: 0.25, cor: '#00f0ff', tam: 9, rastro: true });
    } else {
      const sp = 215 * Math.min(1, Math.hypot(I.mx, I.my));
      p.x += I.mx * sp * dt; p.y += I.my * sp * dt;
      p.andando = sp > 1 ? p.andando + dt * sp / 215 : 0;
      if (sp > 1 && p.atirou <= 0) p.dir = Math.atan2(I.my, I.mx);
    }
    G.mundo.colidir(p);

    while (I.fila.length) usar(p, I.fila.shift());
    if (I.atacar) usar(p, 0);
    J.alvo = mirar(p, 520);
  }

  function atualizarProjs(dt) {
    const p = J.p;
    for (const pr of J.projs) {
      pr.vida -= dt;
      const passo = Math.hypot(pr.vx, pr.vy) * dt, n = Math.max(1, Math.ceil(passo / 10));
      for (let s = 0; s < n && pr.vida > 0; s++) {
        pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
        if (G.mundo.bloqueado(pr.x, pr.y)) { pr.vida = 0; particulas(pr.x, pr.y, 4, pr.cor, 140, 0.2, 2); break; }
        if (pr.dono === 'p') {
          for (const e of J.inimigos) {
            if (e.morto || G.d2(e.x, e.y, pr.x, pr.y) > (e.r + pr.r) ** 2) continue;
            const v = Math.hypot(pr.vx, pr.vy);
            ferirInimigo(e, pr.dano, pr.vx / v * pr.empurra, pr.vy / v * pr.empurra);
            pr.vida = 0; break;
          }
        } else if (!p.morto && G.d2(p.x, p.y, pr.x, pr.y) < (p.r + pr.r) ** 2) {
          ferirJogador(pr.dano); pr.vida = 0;
        }
      }
    }
  }

  function atualizarFx(dt) {
    for (const f of J.fx) {
      f.t += dt;
      if (f.tipo === 'granada') {
        const k = Math.min(1, f.t / f.dur);
        f.x = G.lerp(f.x0, f.x1, k); f.y = G.lerp(f.y0, f.y1, k); f.z = Math.sin(k * Math.PI) * 90;
        if (k >= 1 && !f.explodiu) {
          f.explodiu = true;
          for (const e of J.inimigos) {
            if (e.morto) continue;
            const d = Math.hypot(e.x - f.x, e.y - f.y);
            if (d > f.raio + e.r) continue;
            const q = 1 - 0.5 * Math.min(1, d / f.raio);
            ferirInimigo(e, f.dano * q, (e.x - f.x) / (d || 1) * 420, (e.y - f.y) / (d || 1) * 420);
          }
          particulas(f.x, f.y, 46, '#ff8a00', 380, 0.7, 4);
          particulas(f.x, f.y, 20, '#ffd23f', 200, 0.5, 3);
          J.fx.push({ tipo: 'clarao', x: f.x, y: f.y, t: 0, dur: 0.35, raio: 260, cor: '#ff8a00' });
          J.fx.push({ tipo: 'anel', x: f.x, y: f.y, t: 0, dur: 0.35, raio: f.raio, cor: '#ffd23f' });
          tremer(12); G.som.explosao();
          f.dur = 0;  // some no filtro
        }
      }
    }
  }

  function atualizarLoot(dt) {
    const p = J.p;
    for (const l of J.loot) {
      l.t += dt;
      if (l.z > 0 || l.vz > 0) {
        l.vz -= 900 * dt; l.z = Math.max(0, l.z + l.vz * dt);
        l.x += l.vx * dt; l.y += l.vy * dt;
        if (l.z === 0) l.vz = 0;
        continue;
      }
      if (p.morto || l.t < 0.4) continue;
      const d = Math.hypot(p.x - l.x, p.y - l.y);
      const ima = l.tipo === 'credito' ? 130 : 70;
      if (d < 20) { pegar(l); l.pego = true; }
      else if (d < ima) { const v = 480 * dt / d; l.x += (p.x - l.x) * v; l.y += (p.y - l.y) * v; }
    }
  }

  function compactar(arr, vivo) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (vivo(arr[i])) arr[j++] = arr[i];
    arr.length = j;
  }

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
      // inimigo longe some e a quadra dele volta a poder nascer gente
      for (const e of J.inimigos) {
        if (e.morto || G.d2(e.x, e.y, p.x, p.y) < 2400 * 2400) continue;
        e.morto = e.sumiu = true;
        const est = J.estadoQuadra.get(e.quadra);
        if (est) { est.vivos = Math.max(0, est.vivos - 1); if (!est.vivos) est.volta = 0; }
      }
    }

    atualizarJogador(p, dt);
    for (const e of J.inimigos) if (!e.morto) {
      pensar(e, dt);
      if (!e.T.voa) G.mundo.colidir(e);
    }
    separar();
    atualizarProjs(dt);
    atualizarFx(dt);
    atualizarLoot(dt);
    for (const q of J.parts) {
      q.vida -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const k = Math.exp(-4 * dt); q.vx *= k; q.vy *= k;
    }
    for (const t of J.textos) t.t += dt;

    compactar(J.inimigos, e => !e.morto);
    compactar(J.projs, q => q.vida > 0);
    compactar(J.fx, f => f.t < f.dur || (f.tipo === 'granada' && !f.explodiu));
    compactar(J.loot, l => !l.pego && l.t < 90);
    compactar(J.parts, q => q.vida > 0);
    compactar(J.textos, t => t.t < t.vida);
    if (J.alvo && J.alvo.morto) J.alvo = null;

    const b = G.mundo.bairroNoPonto(p.x, p.y);
    if (b !== J.bairro) { J.bairro = b; if (G.aoMudarBairro) G.aoMudarBairro(b); }
  };

  G.reerguer = () => {
    const p = J.p;
    const perda = Math.floor(p.creditos * 0.1);
    p.creditos -= perda;
    p.x = C / 2; p.y = C / 2 + 60; p.hp = p.hpMax; p.en = p.enMax; p.morto = false; p.inv = 2;
    p.cds.fill(0);
    for (const e of J.inimigos) if (e.estado === 'caca') e.estado = 'volta';
    J.projs.length = 0;
    return perda;
  };

  // exposto pro teste e pra depuração
  G.combate = { usar, ferirInimigo, ferirJogador, gerarItem, criarInimigo, mirar, ganharXP, recalcular, poder };
})();

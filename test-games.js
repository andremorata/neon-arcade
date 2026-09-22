'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

// varre games/ em vez de listar arquivo por arquivo: jogo novo entra no teste sozinho
const games = Object.fromEntries(
  fs.readdirSync(path.join(__dirname, 'games'))
    .filter(f => f.endsWith('.html'))
    .map(f => [f.replace(/^neon-|\.html$/g, ''), read('games/' + f)]));
const names = Object.keys(games);
const css = read('assets/css/neon-theme.css');
const menu = read('index.html');

assert.ok(names.length, 'Nenhum jogo encontrado em games/');

// todo jogo precisa ter script valido e um tile no menu
for (const [name, html] of Object.entries(games)) {
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(Boolean).at(-1);
  assert.ok(script, `${name}: nenhum <script> inline encontrado`);
  try { new Function(script); }
  catch (e) { assert.fail(`${name}: erro de sintaxe no script — ${e.message}`); }
  assert.ok(menu.includes(`games/neon-${name}.html`), `${name}: falta a entrada no GAMES de index.html`);
}

// recorta um bloco {...} do fonte pelo cabecalho, pra testar a funcao real em vez de uma copia
function block(src, header) {
  const start = src.indexOf(header);
  assert.notStrictEqual(start, -1, `bloco não encontrado: ${header}`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && !--depth) return src.slice(start, i + 1);
  }
  assert.fail(`chaves não fecham em: ${header}`);
}

// fisica de rebatida do Pong: a bola sempre sai da raquete que a tocou
const pong = games.pong;
const bounce = block(pong, '  function bounce(onPlayer)');
const makeHit = new Function('Neon', 'particles', 'els', `
  const PAD_H=110; let rally=0,maxRally=0,playerY=300,aiY=300;
  let ball={x:0,y:300,vx:1,vy:0}; ${bounce}
  return onPlayer => { ball.vx=onPlayer?-1:1; bounce(onPlayer); return {...ball}; };
`);
const hit = makeHit({ audio: { sfx: { paddle() {} } }, toast() {} }, { burst() {} }, { rally: {} });

assert.ok(hit(true).vx > 0, 'A bola deve sair da raquete do jogador para a direita');
assert.ok(hit(false).vx < 0, 'A bola deve sair da raquete da CPU para a esquerda');

// jogos de placar crescente gravam o recorde em memoria antes de mostrar o resultado
const BEST = { flappy: 'passed', hoops: 'score', siege: 'score', darts: 'youScore', archer: 'youScore', piano: 'score', bomber: 'score', enduro: 'score', racha: 'score', runner: 'score', river: 'score', brawl: 'score', salto: 'distancia', pinball: 'score', planador: 'distancia', nucleo: 'pico' };
// o slug grava dentro de fim(venceu), com bonus antes, entao fica fora do BEST
assert.match(games.slug, /pb = Neon\.best\.update\('slug', score\)/, 'O Slug precisa gravar o recorde');
// o wheels grava o total de estrelas dentro de chegou(), entao fica fora do BEST
assert.match(games.wheels, /pb = Neon\.best\.update\('wheels', total\)/, 'O Wheels precisa gravar o total de estrelas');
// o breach grava dentro de fim(venceu), com bonus antes, entao fica fora do BEST
assert.match(games.breach, /pb = Neon\.best\.update\('breach', score\)/, 'O Breach precisa gravar o recorde');
for (const [key, variable] of Object.entries(BEST)) {
  assert.match(games[key], new RegExp(`pb\\s*=\\s*Neon\\.best\\.update\\('${key}', ${variable}\\)`),
    `O ${key} deve atualizar o recorde em memória`);
}

// ── NEON WHEELS ────────────────────────────────────
// O bloco de fisica e recortado do fonte e rodado aqui: e a unica forma de
// saber que as 12 pistas fecham sem abrir o navegador uma por uma.
const wheels = games.wheels;
const wIni = wheels.indexOf('  // \u2500\u2500 f\u00edsica \u2500\u2500');
const wFim = wheels.indexOf('  // \u2500\u2500 fim da f\u00edsica \u2500\u2500');
assert.ok(wIni > 0 && wFim > wIni, 'wheels: marcadores do bloco de fisica nao encontrados');
const W = new Function(wheels.slice(wIni, wFim)
  + '; return { K, STEP, PISTAS, CONJUNTOS, CARROS, compilar, novoCarro, passo, piloto, correrSozinho };')();

assert.strictEqual(W.PISTAS.length, 12, 'O Wheels tem 12 fases');
assert.strictEqual(W.CONJUNTOS.length, 3, 'As 12 fases vem em 3 conjuntos');
for (const c of W.CONJUNTOS) assert.strictEqual(c.pistas.length, 4, `O conjunto ${c.nome} tem 4 pistas`);

// Tempo de ar pra fechar um giro segurando o pedal. Nao e 2*PI/tilt: o giro
// leva tiltResp pra pegar velocidade, e essa rampa e justamente o que perdoa
// os pulinhos. Integra a rampa em vez de chutar o numero.
const arNecessario = (() => {
  let w = 0, giro = 0, t = 0;
  while (t < 5) {
    w += (-W.K.tilt - w) * Math.min(1, W.K.tiltResp * W.STEP);
    giro += w * W.STEP;
    t += W.STEP;
    if (Math.abs(giro) >= 2 * Math.PI * 0.9) return t;
  }
  assert.fail('wheels: com esse tilt nao da pra fechar um flip');
})();

for (const pd of W.PISTAS) {
  const p = W.compilar(pd.pecas);
  assert.ok(p.fim > 4000, `${pd.nome}: pista curta demais (${p.fim.toFixed(0)}px)`);

  // toda pista fecha com o piloto automatico segurando o gas, e sobra gasolina:
  // sem isso a fase e impossivel pra crianca, que e a regra do plano
  const car = W.novoCarro(p);
  let maiorVoo = 0;
  for (let i = 0; i < 120 * 240 && !car.morto && car.x < p.fim; i++) {
    W.piloto(car);
    W.passo(car, p, W.STEP);
    for (const e of car.ev) if (e.tipo === 'pouso') maiorVoo = Math.max(maiorVoo, e.ar);
    car.ev.length = 0;
  }
  assert.ok(!car.morto, `${pd.nome}: o piloto morreu (${car.morto}) em x=${car.x.toFixed(0)}`);
  assert.ok(car.x >= p.fim, `${pd.nome}: o piloto nao chegou (x=${car.x.toFixed(0)} de ${p.fim.toFixed(0)})`);
  // a segunda estrela pede 25% de gasolina na chegada: se nem o piloto
  // automatico consegue, a estrela e inalcancavel naquela pista
  assert.ok(car.gasolina >= 25,
    `${pd.nome}: o piloto chega com ${car.gasolina.toFixed(0)}%, a estrela dos 25% fica impossivel`);
  assert.ok(maiorVoo >= arNecessario,
    `${pd.nome}: maior voo e ${maiorVoo.toFixed(2)}s, precisa de ${arNecessario.toFixed(2)}s pra um flip`);
}

// A fase 1 e o tutorial: quem so segura o gas, sem soltar no ar, tem que
// percorrer boa parte dela antes de capotar. Sem isso a crianca bate nos
// primeiros 10 segundos toda vez e larga o jogo.
{
  const p = W.compilar(W.PISTAS[0].pecas), car = W.novoCarro(p);
  for (let i = 0; i < 120 * 240 && !car.morto && car.x < p.fim; i++) {
    car.gas = true; car.freio = false;
    W.passo(car, p, W.STEP);
    car.ev.length = 0;
  }
  const parte = car.x / p.fim;
  assert.ok(parte > 0.35,
    `A fase 1 e o tutorial: so-gas chega a ${(parte * 100).toFixed(0)}% da pista, precisa passar de 35%`);
}

// "Sem pista impossivel": um jogador lento gasta mais gasolina de base. Com o
// dreno 80% maior o piloto ainda tem que chegar em todas as 12, senao a fase
// trava a crianca por combustivel em vez de por habilidade.
const drenoNormal = W.K.dreno;
W.K.dreno = drenoNormal * 1.8;
for (const pd of W.PISTAS) {
  const p = W.compilar(pd.pecas), car = W.novoCarro(p);
  for (let i = 0; i < 120 * 240 && !car.morto && car.x < p.fim; i++) {
    W.piloto(car);
    W.passo(car, p, W.STEP);
    car.ev.length = 0;
  }
  assert.ok(car.x >= p.fim && !car.morto,
    `${pd.nome}: com dreno de jogador lento o carro nao chega (x=${car.x.toFixed(0)}, ${car.morto || 'sem gasolina'})`);
}
W.K.dreno = drenoNormal;

// correrSozinho e o que gera o tempo-alvo da terceira estrela: precisa ser
// determinista e devolver os itens ao estado inicial, senao a corrida do
// jogador comeca com as moedas ja coletadas
const pw = W.compilar(W.PISTAS[0].pecas);
const r1 = W.correrSozinho(pw), r2 = W.correrSozinho(pw);
assert.strictEqual(r1.t, r2.t, 'O tempo-alvo do Wheels tem que ser deterministico');
assert.ok(r1.t > 5 && r1.t < 90, `Tempo-alvo fora de escala: ${r1.t.toFixed(1)}s`);
assert.ok(pw.itens.every(i => !i.pego), 'correrSozinho tem que devolver as moedas e latas');

// o loop so passa com velocidade: e o que faz o booster ter proposito
const wLoop = W.compilar([['reta', 300], ['loop', 100], ['reta', 400], ['chegada']]);
const lancar = (v) => {
  const c = W.novoCarro(wLoop);
  c.x = 200; c.vx = v;
  for (let i = 0; i < 6 * 240 && !c.morto && c.x < wLoop.fim; i++) { W.passo(c, wLoop, W.STEP); c.ev.length = 0; }
  return c;
};
assert.ok(lancar(450).x < 500, 'A 450 px/s o carro nao pode passar do loop');
assert.strictEqual(lancar(650).morto, 'teto', 'A 650 px/s o carro cai de teto no loop');
assert.ok(!lancar(950).morto, 'A 950 px/s o carro fecha o loop');

// o flip conta quando fecha a volta, ainda no ar, e passar no loop nao e flip
const wAr = W.compilar(W.PISTAS[0].pecas);
const voador = W.novoCarro(wAr);
voador.y -= 500; voador.vy = -260; voador.vx = 300;
let flipNoAr = null;
for (let i = 0; i < 3 * 240 && !voador.morto; i++) {
  voador.gas = true;
  W.passo(voador, wAr, W.STEP);
  for (const e of voador.ev) if (e.tipo === 'flip' && voador.chao === 0 && !flipNoAr) flipNoAr = e;
  voador.ev.length = 0;
}
assert.ok(flipNoAr, 'O flip do Wheels tem que ser contado ainda no ar');
assert.strictEqual(flipNoAr.sentido, 'back', 'Gas preso no ar da backflip');

const noLoop = lancar(950);
assert.strictEqual(noLoop.flips, 0, `Passar no loop nao e flip (contou ${noLoop.flips})`);

// o tanque seca e corta o motor, mas o carro nao trava: rola ate parar
const wSeco = W.compilar([['reta', 4000], ['chegada']]);
const seco = W.novoCarro(wSeco);
seco.gasolina = 0;
for (let i = 0; i < 240; i++) { seco.gas = true; W.passo(seco, wSeco, W.STEP); seco.ev.length = 0; }
assert.ok(Math.hypot(seco.vx, seco.vy) < 5, 'Sem gasolina o motor nao empurra');
// e uma lata devolve combustivel sem passar do tanque cheio
const wLata = W.compilar([['reta', 600], ['lata'], ['reta', 600], ['chegada']]);
assert.strictEqual(wLata.itens.filter(i => i.tipo === 'lata').length, 1, 'A peca lata gera uma lata');
const bebe = W.novoCarro(wLata);
bebe.gasolina = 10;
for (let i = 0; i < 6 * 240 && bebe.x < 700; i++) { bebe.gas = true; W.passo(bebe, wLata, W.STEP); bebe.ev.length = 0; }
assert.ok(bebe.gasolina > 10, 'A lata tem que reabastecer');
assert.ok(bebe.gasolina <= W.K.tanque, 'A lata nao pode passar do tanque cheio');

// Garagem: cada carro precisa fechar todas as pistas, inclusive ao repetir etapas antigas.
assert.strictEqual(W.CARROS.length, 3, 'Wheels: três carros');
for (let modelo = 0; modelo < W.CARROS.length; modelo++) {
  for (const pd of W.PISTAS) {
    const p = W.compilar(pd.pecas), resultado = W.correrSozinho(p, 120, modelo);
    assert.ok(!resultado.morto && resultado.x >= p.fim,
      `Wheels: ${W.CARROS[modelo].nome} precisa fechar ${pd.nome}`);
    assert.ok(resultado.gasolina >= 25, `Wheels: ${W.CARROS[modelo].nome} precisa poder ganhar a estrela de gasolina em ${pd.nome}`);
    assert.ok(p.itens.every(i => !i.pego), 'Wheels: simular qualquer carro devolve os itens');
  }
}
const passeio = W.compilar([['reta', 5000], ['chegada']]);
const comparacao = W.CARROS.map((_, modelo) => {
  const c = W.novoCarro(passeio, modelo); c.y -= 1500;
  for (let i = 0; i < 120; i++) { c.gas = true; W.passo(c, passeio, W.STEP); }
  return c;
});
assert.ok(Math.abs(comparacao[1].w) < Math.abs(comparacao[0].w) && Math.abs(comparacao[0].w) < Math.abs(comparacao[2].w),
  'Wheels: buggy gira mais suave, protótipo gira mais rápido');
assert.ok(comparacao[1].gasolina > comparacao[0].gasolina && comparacao[0].gasolina > comparacao[2].gasolina,
  'Wheels: economia do buggy e consumo do protótipo aparecem na física');
assert.strictEqual(W.K.tilt, 11, 'Wheels: escolher carro não altera a física base');
const garagem = new Function('CONJUNTOS', 'PISTAS',
  block(wheels, '  function liberados(s)') + block(wheels, '  function modeloSalvo(s)') + '; return { liberados, modeloSalvo };')(W.CONJUNTOS, W.PISTAS);
for (const [aberta, quantidade] of [[0, 1], [3, 1], [4, 2], [7, 2], [8, 3], [11, 3]]) {
  assert.strictEqual(garagem.liberados({ aberta }), quantidade, 'Wheels: libera carro na entrada da etapa seguinte');
  assert.strictEqual(garagem.modeloSalvo({ aberta }), quantidade - 1, 'Wheels: save antigo recebe carro compatível com seu progresso');
}
assert.strictEqual(garagem.modeloSalvo({ aberta: 0, carro: 2 }), 0, 'Wheels: seleção salva não libera carro bloqueado');
assert.strictEqual(garagem.modeloSalvo({ aberta: 8, carro: 0 }), 0, 'Wheels: pode manter o primeiro carro após liberar os demais');
for (const carro of [-1, 9, '2', null]) assert.strictEqual(garagem.modeloSalvo({ aberta: 4, carro }), 1, 'Wheels: seleção inválida tem retorno seguro');
// Executa a chegada real: desbloqueio, equipagem e persistência na mesma gravação.
const finalizarWheels = new Function('save', 'pistaN', 'liberados', 'PISTAS', 'K', `
  let state, fimT, novoModelo = null, pb, persisted;
  const car = { gasolina: 80, moedas: 3, x: 0, y: 0 }, tempo = 10, alvo = 20;
  const gravar = () => { persisted = JSON.parse(JSON.stringify(save)); };
  const totalEstrelas = () => Object.values(save.pistas).reduce((n, p) => n + p.estrelas, 0);
  const pintarPainel = () => {}, particles = { burst() {} };
  const Neon = { best: { update: (_, n) => n }, audio: { sfx: { record() {}, level() {} } } };
  ${block(wheels, '  function chegou()')}
  chegou(); return { persisted, novoModelo };
`);
for (const [aberta, n, esperado] of [[3, 3, 1], [7, 7, 2], [8, 0, null]]) {
  const save = { v: 1, aberta, carro: 0, moedas: 27, pistas: { 1: { estrelas: 2, tempo: 30, moedas: 4 } } };
  const result = finalizarWheels(save, n, garagem.liberados, W.PISTAS, W.K);
  assert.strictEqual(result.novoModelo, esperado, 'Wheels: só anuncia carro ao cruzar uma etapa inédita');
  assert.strictEqual(result.persisted.carro, esperado ?? 0, 'Wheels: novo carro equipado é persistido');
  assert.deepStrictEqual(result.persisted.pistas[1], { estrelas: 2, tempo: 30, moedas: 4 }, 'Wheels: desbloqueio preserva recordes antigos');
  assert.strictEqual(result.persisted.moedas, 30, 'Wheels: desbloqueio preserva o saldo de moedas');
}

// geometria do alvo do Darts: setor/anel precisam bater com o desenho, senao o dardo
// crava num lugar e pontua outro. Usa as constantes do proprio arquivo pra nao dessincronizar.
const darts = games.darts;
const scoreAt = new Function(
  darts.slice(darts.indexOf('  const W = 900'), darts.indexOf('  const els = {')) +
  block(darts, '  function scoreAt(x, y)') +
  '; return { scoreAt, CX, CY, R };')();
const at = (deg, rf) => {
  const a = deg * Math.PI / 180;
  return scoreAt.scoreAt(scoreAt.CX + Math.cos(a) * scoreAt.R * rf, scoreAt.CY + Math.sin(a) * scoreAt.R * rf);
};
assert.strictEqual(at(0, 0).v, 50, 'O centro do alvo vale 50');
assert.strictEqual(at(-90, 0.09).v, 25, 'O anel do bull vale 25');
assert.strictEqual(at(-90, 0.60).label, 'T20', 'A faixa tripla do topo é o T20');
assert.strictEqual(at(-90, 0.60).v, 60, 'T20 vale 60');
assert.strictEqual(at(-90, 0.96).label, 'D20', 'A faixa dupla do topo é o D20');
assert.strictEqual(at(-90, 0.80).v, 20, 'Fora dos anéis o setor do topo vale 20 simples');
assert.strictEqual(at(-90, 1.05).v, 0, 'Fora do alvo não pontua');
// os setores tem que cair onde os numeros sao desenhados (SECTORS[i] no angulo -90+i*18)
for (const [i, expected] of [[1, 1], [5, 6], [10, 3], [15, 11], [19, 5]]) {
  assert.strictEqual(at(-90 + i * 18, 0.80).v, expected,
    `O setor ${i} do alvo deve valer ${expected}`);
}

// aneis do Archer: o ponto tem que cair de 10 no centro pra 1 na borda, e 0 fora
const archer = games.archer;
const arc = new Function(
  archer.slice(archer.indexOf('  const HY = 268'), archer.indexOf('  const els = {')) +
  block(archer, '  const ringScore = (x, y) => {') +
  '; return { ringScore, TX, TY, TR };')();
const ring = f => arc.ringScore(arc.TX + arc.TR * f, arc.TY);
assert.strictEqual(ring(0), 10, 'O centro do alvo vale 10');
assert.strictEqual(ring(0.05), 10, 'O anel central inteiro vale 10');
assert.strictEqual(ring(0.15), 9, 'O segundo anel vale 9');
assert.strictEqual(ring(0.5), 6, 'Metade do raio cai no anel 6');
assert.strictEqual(ring(0.99), 1, 'A borda do alvo vale 1');
assert.strictEqual(ring(1.2), 0, 'Fora do alvo não pontua');
for (let f = 0; f <= 1; f += 0.02) {
  assert.ok(ring(f) >= ring(f + 0.02), `A pontuação do Archer não pode subir indo pra fora (${f.toFixed(2)})`);
}

// gravidade do Siege: uma laje sobre dois postes cai quando um dos postes some.
// O apoio e por centro de massa, entao encaixe lateral sozinho nao segura nada.
const siege = games.siege;
const support = new Function('Neon', 'blocks', 'groundY', `
  const rngSign = () => -1;
  ${block(siege, '  function refreshSupport()')}
  let supportDirty = true;
  refreshSupport();
  return blocks;
`);
const forte = (comEsquerdo) => {
  const b = [];
  if (comEsquerdo) b.push({ x: 500, y: 510, w: 26, h: 70, resting: true, vx: 0, vy: 0, spin: 0 });
  b.push({ x: 606, y: 510, w: 26, h: 70, resting: true, vx: 0, vy: 0, spin: 0 });
  b.push({ x: 496, y: 490, w: 140, h: 20, resting: true, vx: 0, vy: 0, spin: 0 }); // laje
  return support({ rand: (a, b2) => (a + b2) / 2 }, b, 580);
};
assert.ok(forte(true).at(-1).resting, 'A laje sobre os dois postes deve ficar de pé');
const caindo = forte(false).at(-1);
assert.ok(!caindo.resting, 'Sem o poste esquerdo a laje tem que cair');
assert.ok(caindo.vx < 0, 'A laje deve tombar para o lado que perdeu o apoio');

// fitCanvas: o backing store cresce com o devicePixelRatio e o contexto volta pras
// coordenadas do jogo, senao tudo desenha no lugar errado depois do resize.
const core = read('assets/js/neon-core.js');
// Iniciar amplia o jogo mesmo sem API ou com recusa. Retomar não força nova entrada.
const makeGameView = new Function('document', `${block(core, '  function enterGameView()')}; return enterGameView;`);
assert.match(block(core, '    hide()'), /enterGameView\(\)/, 'Iniciar a partida deve ativar a visão ampliada');
for (const mode of ['ok', 'unsupported', 'rejected', 'throws', 'already-fullscreen']) {
  const classes = new Set();
  let requests = 0;
  const doc = {
    body: { classList: { contains: c => classes.has(c), add: c => classes.add(c) } },
    fullscreenElement: mode === 'already-fullscreen' ? {} : null,
    documentElement: {},
  };
  if (mode !== 'unsupported') doc.documentElement.requestFullscreen = options => {
    requests++;
    assert.strictEqual(options.navigationUI, 'hide');
    if (mode === 'throws') throw new Error('Bloqueado');
    return mode === 'rejected' ? Promise.reject(new Error('Recusado')) : Promise.resolve();
  };
  const enter = makeGameView(doc);
  enter(); enter();
  assert.ok(classes.has('jogando'), `${mode}: mantém a partida ampliada`);
  assert.strictEqual(requests, ['unsupported', 'already-fullscreen'].includes(mode) ? 0 : 1,
    `${mode}: não insiste em tela cheia ao retomar`);
}
const fitSrc = block(core, '  function fitCanvas(canvas)');
const makeFit = new Function('clamp', 'canvas', 'window', `${fitSrc}; return fitCanvas(canvas);`);
const fakeCanvas = (cssW, W, H) => {
  const calls = [];
  return {
    width: W, height: H, calls,
    getContext: () => ({ setTransform: (...a) => calls.push(a) }),
    getBoundingClientRect: () => ({ width: cssW, height: cssW * H / W }),
  };
};
const clampFn = (v, a, b) => Math.max(a, Math.min(b, v));
const fitAt = (dpr, cssW = 900, W = 900, H = 600) => {
  const cv = fakeCanvas(cssW, W, H);
  makeFit(clampFn, cv, { devicePixelRatio: dpr, addEventListener() {} });
  return cv;
};
const retina = fitAt(2);
assert.strictEqual(retina.width, 1800, 'Em dpr 2 o canvas deve dobrar o backing store');
assert.strictEqual(retina.height, 1200, 'A altura do backing store acompanha a largura');
assert.deepStrictEqual(retina.calls.at(-1), [2, 0, 0, 2, 0, 0],
  'O contexto tem que ser escalado, senão o jogo desenha em 1/4 do quadro');
assert.strictEqual(fitAt(1).width, 900, 'Em dpr 1 o canvas fica no tamanho declarado');
assert.strictEqual(fitAt(4).width, 2700, 'O teto de 3x segura o custo em telas muito densas');
assert.strictEqual(fitAt(2, 450).width, 900, 'Metade do tamanho em dpr 2 continua 1:1');
assert.strictEqual(fitAt(2, 200).width, 900, 'A escala nunca cai abaixo de 1');

// velocidade do Piano: sobe com o placar e trava no teto. Sem o teto a tecla
// cruzaria o quadro em menos tempo do que da pra reagir.
const speedAt = new Function('return ' + games.piano.match(/const speedAt = [^;]+/)[0].replace('const speedAt = ', ''))();
assert.strictEqual(speedAt(0), 240, 'O Piano comeca em 240 px/s');
assert.ok(speedAt(50) > speedAt(0), 'A velocidade do Piano tem que subir com as notas');
assert.strictEqual(speedAt(10000), 1000, 'A velocidade do Piano trava em 1000 px/s');
for (let s = 0; s < 300; s += 7) {
  assert.ok(speedAt(s + 7) >= speedAt(s), `A velocidade do Piano nao pode cair (${s})`);
}

// cruz da explosao do Bomber: para no pilar, come um tijolo so e nao vaza pra fora
// do mapa. Usa a funcao do proprio arquivo pra nao virar uma copia que dessincroniza.
const bomber = games.bomber;
const blastCells = new Function('grid', 'DIRS', 'SOLIDO', 'TIJOLO',
  block(bomber, '  function blastCells(cx, cy, alcance)') + '; return blastCells;');
const _ = 0, S = 1, T = 2;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const mapa = [
  [S, S, S, S, S, S, S],
  [S, _, _, _, _, _, S],
  [S, _, S, _, T, _, S],
  [S, _, _, _, _, _, S],
  [S, S, S, S, S, S, S],
];
const blast = blastCells(mapa, DIRS4, S, T);
const tem = (lista, x, y) => lista.some(c => c.x === x && c.y === y);
const cruz = blast(3, 1, 3);
assert.ok(tem(cruz, 3, 1), 'A celula da bomba sempre pega fogo');
assert.ok(tem(cruz, 4, 1) && tem(cruz, 5, 1), 'A cruz avanca ate o alcance');
assert.ok(!tem(cruz, 6, 1), 'A cruz nao passa pela borda solida');
assert.ok(tem(cruz, 3, 2) && tem(cruz, 3, 3), 'A cruz desce pelo corredor livre');
const parede = blast(1, 2, 3);
assert.ok(!tem(parede, 2, 2), 'O pilar solido corta a cruz');
assert.ok(tem(parede, 1, 1) && tem(parede, 1, 3), 'Os outros bracos continuam');
const tijolo = blast(2, 3, 3);
assert.ok(tem(tijolo, 4, 3), 'A cruz alcanca a coluna do tijolo');
const naColuna = blast(4, 3, 3);
assert.ok(tem(naColuna, 4, 2), 'O tijolo entra na cruz e explode');
assert.ok(!tem(naColuna, 4, 1), 'Depois do tijolo a cruz para');

// mapa do Bomber: o canto do jogador nasce livre, os pilares pares ficam de pe e
// nenhum bot pode nascer emparedado — emparedado ele treme no lugar a partida toda.
const mapaBomber = new Function('Neon', 'CELL', 'COLS', 'ROWS', 'VAZIO', 'SOLIDO', 'TIJOLO',
  'DIRS', 'ITENS', 'chave', 'level', `
  let grid = [], inimigos = [], itens = new Map();
  ${block(bomber, '  function gerarMapa()')}
  ${block(bomber, '  function abrirBolsao(x, y)')}
  ${block(bomber, '  function nascerInimigos()')}
  const CANTOS_LIVRES = [[1, 1], [2, 1], [1, 2]];
  gerarMapa(); nascerInimigos();
  return { grid, inimigos, CANTOS_LIVRES };
`);
for (let fase = 1; fase <= 6; fase++) {
  const { grid, inimigos, CANTOS_LIVRES } = mapaBomber(
    { choice: a => a[(Math.random() * a.length) | 0] },
    44, 15, 11, 0, 1, 2, DIRS4, [{ tipo: 'fogo' }], (x, y) => x + ',' + y, fase);
  for (const [x, y] of CANTOS_LIVRES)
    assert.strictEqual(grid[y][x], 0, `fase ${fase}: o canto do jogador tem que nascer livre`);
  assert.strictEqual(grid[2][2], 1, `fase ${fase}: o pilar par nao pode virar tijolo`);
  assert.ok(inimigos.length, `fase ${fase}: fase sem bot nunca termina`);
  for (const en of inimigos) {
    const cx = Math.floor(en.x / 44), cy = Math.floor(en.y / 44);
    const saidas = DIRS4.filter(([dx, dy]) => grid[cy + dy][cx + dx] === 0);
    assert.ok(saidas.length, `fase ${fase}: bot emparedado em ${cx},${cy}`);
  }
}

// Fuga da propria bomba: quem larga fica em cima dela e precisa sair andando.
// Se a bomba virar parede pelo centro da casa, o corpo ainda encosta nela e o
// jogador trava colado no pavio — que foi exatamente o bug relatado.
const fuga = new Function('CELL', 'CANTOS', 'grid', 'bombas', 'bombaEm', 'VAZIO', 'lane', 'chave', 'celX', 'celY', `
  ${block(bomber, '  function encostaNaCasa(ent, x, y)')}
  ${block(bomber, '  function soltarBombas()')}
  ${block(bomber, '  function podeIr(x, y, ent)')}
  ${block(bomber, '  function mover(ent, dx, dy, dt)')}
  return { encostaNaCasa, soltarBombas, mover };
`);
const CELLB = 44, RB = CELLB * 0.34;
const gridB = [];
for (let y = 0; y < 11; y++) {
  gridB[y] = [];
  for (let x = 0; x < 15; x++) {
    const borda = x === 0 || y === 0 || x === 14 || y === 10;
    gridB[y][x] = (borda || (x % 2 === 0 && y % 2 === 0)) ? 1 : 0;
  }
}
const bombasB = [];
const fb = fuga(CELLB, [[-RB, -RB], [RB, -RB], [-RB, RB], [RB, RB]], gridB, bombasB,
  (x, y) => bombasB.find(b => b.x === x && b.y === y), 0,
  v => Math.floor(v / CELLB) * CELLB + CELLB / 2, (x, y) => x + ',' + y,
  e => Math.floor(e.x / CELLB), e => Math.floor(e.y / CELLB));
const heroi = { x: 5 * CELLB + 22, y: 5 * CELLB + 22, cel: '5,5', speed: 100 };
bombasB.push({ x: 5, y: 5, t: 2400, alcance: 1, dono: 'p', dentro: new Set([heroi]) });
const xIni = heroi.x;
for (let i = 0; i < 120; i++) { fb.soltarBombas(); fb.mover(heroi, -1, 0, 1 / 60); }
assert.ok(xIni - heroi.x > 80, `Quem larga a bomba tem que conseguir fugir dela (andou ${(xIni - heroi.x).toFixed(1)}px)`);
for (let i = 0; i < 120; i++) { fb.soltarBombas(); fb.mover(heroi, 1, 0, 1 / 60); }
assert.ok(!fb.encostaNaCasa(heroi, 5, 5), 'Depois de sair, a bomba vira parede e o jogador nao volta pra cima dela');

// Projecao do Enduro: pDeZ e zDeP tem que ser uma o inverso da outra, senao o
// carro rival aparece numa profundidade e a pista desenha noutra. E a pista
// precisa abrir do horizonte pro para-choque, com a curva zerada embaixo.
const enduro = games.enduro;
const proj = new Function('Neon',
  enduro.slice(enduro.indexOf('  const W = 600'), enduro.indexOf('  // ── céu')) +
  '; return { pDeZ, zDeP, yDeP, estrada, ZFAR, HY };')({ clamp: clampFn });
for (const z of [0, 0.5, 1, 3, 6, proj.ZFAR]) {
  assert.ok(Math.abs(proj.zDeP(proj.pDeZ(z)) - z) < 1e-9, `Enduro: ida e volta de z quebra em ${z}`);
}
assert.strictEqual(proj.pDeZ(proj.ZFAR), 0, 'No horizonte p tem que ser 0');
assert.strictEqual(proj.pDeZ(0), 1, 'No para-choque p tem que ser 1');
assert.strictEqual(proj.pDeZ(proj.ZFAR * 2), 0, 'Alem do horizonte p continua 0, nao vira negativo');
assert.ok(proj.yDeP(0) === proj.HY && proj.yDeP(1) === 800, 'p mapeia do horizonte ao fim do quadro');
let larguraAnterior = -1;
for (let p = 0; p <= 1.0001; p += 0.05) {
  const { meia } = proj.estrada(p, 0);
  assert.ok(meia > larguraAnterior, `A pista tem que abrir vindo do horizonte (p=${p.toFixed(2)})`);
  larguraAnterior = meia;
}
assert.strictEqual(proj.estrada(1, 1).cx, 300, 'A curva nao desloca o para-choque, so o longe');
assert.ok(proj.estrada(0, 1).cx > proj.estrada(0, 0).cx, 'Curva pra direita joga o horizonte pra direita');
assert.ok(proj.estrada(0, -1).cx < proj.estrada(0, 0).cx, 'Curva pra esquerda joga o horizonte pra esquerda');

// Clima do Enduro: a neblina so existe do dia 2 em diante e sempre de manha; a
// noite fecha no meio do dia e volta a abrir antes de virar. Sao as duas curvas
// que mudam o quanto o jogador enxerga, entao erro aqui vira jogo injogavel.
const clima = new Function('Neon', 'ZFAR',
  enduro.slice(enduro.indexOf('  // 0 de dia, 1 na noite'), enduro.indexOf('  const els = {')) +
  '; return { escuridao, nevoa, chuvaDe, alcanceVista, visibilidade };')({ clamp: clampFn }, 8);
assert.strictEqual(clima.nevoa(0.30, 1), 0, 'O dia 1 nao tem neblina');
assert.ok(clima.nevoa(0.30, 2) > 0.4, 'Do dia 2 em diante a neblina aparece');
assert.ok(clima.nevoa(0.30, 5) > clima.nevoa(0.30, 2), 'A neblina fecha mais a cada dia');
assert.ok(clima.nevoa(0.30, 9) <= 0.96, 'A neblina nunca tapa a tela inteira');
assert.strictEqual(clima.nevoa(0.70, 5), 0, 'A neblina some depois da manha');
assert.strictEqual(clima.escuridao(0.10), 0, 'De manha e dia claro');
assert.strictEqual(clima.escuridao(0.65), 1, 'No meio do ciclo e noite fechada');
assert.strictEqual(clima.escuridao(0.99), 0, 'Antes de virar o dia ja amanheceu');
for (let p = 0; p <= 1; p += 0.02) {
  const e = clima.escuridao(p);
  assert.ok(e >= 0 && e <= 1, `A escuridao tem que ficar entre 0 e 1 (p=${p.toFixed(2)}, deu ${e})`);
}

// Cada rival do Enduro conta uma ultrapassagem so. Andando na mesma velocidade do
// carro do lado, z fica oscilando em volta do zero; sem a marca o placar dispara.
const passarRival = new Function(block(enduro, '  function passarRival(r, antes)') + '; return passarRival;')();
const rival = { z: 0.4, passado: false };
let contou = 0;
for (const z of [0.2, -0.1, 0.1, -0.2, 0.3, -0.4]) {
  const antes = rival.z;
  rival.z = z;
  if (passarRival(rival, antes)) contou++;
}
assert.strictEqual(contou, 1, `Rival que balanca em volta do zero vale 1 ultrapassagem, contou ${contou}`);
assert.strictEqual(passarRival({ z: 3, passado: false }, 4), false, 'Rival longe do carro nao conta');
assert.strictEqual(passarRival({ z: -0.1, passado: false }, -0.2), false, 'Quem ja estava atras nao conta de novo');

// Lata do Enduro: as tres faixas tem que cobrir 0..100 sem buraco e sem inverter.
// A cor e o numero de amassos sao o unico aviso de saude que o jogador ve na pista.
const lataEnduro = new Function(
  enduro.slice(enduro.indexOf('  const ESTADOS = ['), enduro.indexOf('  // ── projeção')) +
  '; return { estadoLata, ESTADOS };')();
assert.strictEqual(lataEnduro.estadoLata(100).amassos, 0, 'Carro inteiro nao tem amasso');
assert.strictEqual(lataEnduro.estadoLata(67).amassos, 0, 'A faixa de cima comeca em 67');
assert.strictEqual(lataEnduro.estadoLata(66).amassos, 2, 'Abaixo de 67 o carro fica amassado');
assert.strictEqual(lataEnduro.estadoLata(34).amassos, 2, 'A faixa do meio vai ate 34');
assert.strictEqual(lataEnduro.estadoLata(33).amassos, 4, 'Abaixo de 34 e sucata');
assert.strictEqual(lataEnduro.estadoLata(0).amassos, 4, 'Lata zerada ainda cai numa faixa');
let amassoAnterior = -1;
for (let l = 100; l >= 0; l--) {
  const e = lataEnduro.estadoLata(l);
  assert.ok(e && e.cor, `Toda lata de 0 a 100 precisa de estado (${l})`);
  assert.ok(e.amassos >= amassoAnterior, `Amasso nao pode diminuir com a lata caindo (${l})`);
  amassoAnterior = e.amassos;
}

// Alcance de vista: o que aperta o tempo de reacao a noite, na neblina e na chuva.
// Se o alcance nao encurtar, o clima vira enfeite e o jogo nao fica mais dificil.
assert.strictEqual(clima.alcanceVista(0, 0, 0), 8, 'Em dia limpo enxerga a pista inteira');
assert.ok(clima.alcanceVista(1, 0, 0) < 3.5, 'A noite fechada so mostra o que o farol pega');
assert.ok(clima.alcanceVista(1, 0, 0) > 2.5, 'Mas sobra vista pra dar tempo de desviar');
assert.ok(clima.alcanceVista(0, 0.96, 0) < clima.alcanceVista(1, 0, 0), 'Neblina cheia fecha mais que a noite');
assert.ok(clima.alcanceVista(0, 0, 1) < 8, 'A chuva tambem encurta a vista');
assert.strictEqual(clima.alcanceVista(1, 0.96, 1), clima.alcanceVista(0, 0.96, 0),
  'Somando climas vale o mais fechado, nao a soma');
assert.strictEqual(clima.visibilidade(0, 3), 1, 'Rival colado sempre aparece');
assert.strictEqual(clima.visibilidade(9, 3), 0, 'Rival alem do alcance fica invisivel');
assert.strictEqual(clima.visibilidade(3, 3), 0, 'Bem no limite do alcance ainda nao da pra ver');
assert.ok(clima.visibilidade(2.2, 3) > 0 && clima.visibilidade(2.2, 3) < 1,
  'Entrando no alcance o rival aparece esmaecendo, nao de estalo');
assert.strictEqual(clima.visibilidade(1.4, 3), 1, 'Passada a faixa de fade o rival aparece inteiro');
let visAnterior = 1;
for (let z = 0; z <= 8; z += 0.1) {
  const v = clima.visibilidade(z, 3);
  assert.ok(v <= visAnterior + 1e-9, `Rival mais longe nao pode aparecer mais (z=${z.toFixed(1)})`);
  visAnterior = v;
}

// Chuva: so de tres em tres dias e sempre na virada da tarde pra noite.
assert.strictEqual(clima.chuvaDe(0.62, 1), 0, 'Dia 1 nao chove');
assert.strictEqual(clima.chuvaDe(0.62, 2), 0, 'Dia 2 nao chove');
assert.strictEqual(clima.chuvaDe(0.62, 3), 1, 'Dia 3 chove forte no pico');
assert.strictEqual(clima.chuvaDe(0.62, 6), 1, 'A chuva volta de tres em tres dias');
assert.strictEqual(clima.chuvaDe(0.05, 3), 0, 'De manha nao chove nem no dia de chuva');
assert.strictEqual(clima.chuvaDe(0.99, 3), 0, 'A chuva passa antes de virar o dia');

// Pausa por botao: no celular nao existe tecla P, entao jogo sem o botao e jogo
// que nao pausa no toque. Vale pra todos, inclusive os que ainda vao nascer.
for (const [name, html] of Object.entries(games)) {
  assert.ok(html.includes('id="pauseToggle"'), `${name}: falta o botao de pausa no stage`);
  assert.match(html, /=== 'p'|=== 'P'/,
    `${name}: o botao de pausa dispara a tecla P, entao o jogo precisa tratar 'p'`);
}
assert.match(core, /function bindPauseToggle\(btn\)/, 'O nucleo precisa ligar o botao de pausa');
// O toque no botao nao pode chegar no stage: jogo que trata toque como pausa
// despausava no mesmo clique que acabou de pausar. Aconteceu no Snake.
assert.match(core, /\['pointerdown', 'pointerup', 'click'\]/,
  'O botao de pausa tem que segurar o evento antes de chegar no stage');
// O nucleo ja liga o botao. Jogo que liga de novo pausa no clique e despausa no
// 'p' que o nucleo dispara, e o botao vira enfeite. Aconteceu no Breach.
for (const [name, html] of Object.entries(games)) {
  assert.ok(!/\$\('pauseToggle'\)\s*\.addEventListener|getElementById\('pauseToggle'\)\s*\.addEventListener/.test(html),
    `${name}: nao ligue o botao de pausa no jogo, o nucleo ja liga`);
}
assert.ok(core.indexOf('bindPauseToggle();') > core.indexOf('bindSoundToggle();'),
  'initPage tem que ligar o botao de pausa junto com o do som');
assert.ok(css.includes('.pause-toggle { right: 58px; }'), 'O tema posiciona a pausa ao lado do som');

// DDA do Breach: e o raycaster inteiro. Se ele erra a distancia, a parede desenha
// na altura errada e o inimigo aparece atras do que deveria escondê-lo.
const breach = games.breach;
// Executa a partida real sem DOM: dano simultâneo, recuperação e radar vivo.
{
  const noop = () => {}, marks = [];
  const ctx = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] :
    (...args) => marks.push([key, ...args]) });
  const nodes = new Map(), docEvents = new Map(), winEvents = new Map();
  const Neon = {
    $: id => {
      if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, clientHeight: 500, events: new Map(),
        addEventListener(type, fn) { this.events.set(type, fn); }, focus: noop,
        requestPointerLock: noop, getContext: () => ctx });
      return nodes.get(id);
    },
    best: { get: () => 0, update: (_, score) => score },
    motion: { reduced: true }, clamp: clampFn,
    audio: { ensure: noop, sfx: new Proxy({}, { get: () => noop }),
      music: { start: noop, down: noop, stop: noop, intensity: noop } },
    overlay: { hide: noop, show: noop }, onHide: noop, popEl: noop, toast: noop,
    rand: (a, b) => (a + b) / 2,
  };
  const source = [...breach.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace('(() => {', 'return (() => {')
    .replace('  render(performance.now());\n  requestAnimationFrame(loop);',
      `  return { jog, comecar, levarDano, update, entrarNaSala, pegarItens, minimapa,
        enxerga, atualizarProjeteis, atirar, esquivar, trocarArma, escolherMelhoria, matar,
        get state() { return state; }, get score() { return score; }, get combo() { return combo; },
        get tiros() { return tiros; },
        get municao() { return municao; }, get temArma() { return temArma; },
        get projeteis() { return projeteis; },
        get inimigos() { return inimigos; }, get itens() { return itens; } };`);
  const game = new Function('window', 'document', 'performance', source)(
    { Neon, addEventListener: (type, fn) => winEvents.set(type, fn) },
    { addEventListener: (type, fn) => docEvents.set(type, fn), body: { classList: { toggle: noop } } }, { now: () => 0 });
  for (const fps of [30, 60, 120]) {
    game.comecar();
    assert.strictEqual(game.jog.vida, 150, 'Breach: começa com 150 de vida');
    game.inimigos.length = 0;
    game.levarDano(22); game.levarDano(20);
    assert.strictEqual(game.jog.vida, 128, 'Breach: ataques simultâneos não acumulam dano');
    for (let i = 0; i < Math.floor(fps * 0.6); i++) game.update(1 / fps);
    game.levarDano(12);
    assert.strictEqual(game.jog.vida, 128, 'Breach: proteção dura pelo menos 600 ms');
    for (let i = 0; i < Math.ceil(fps * 0.1); i++) game.update(1 / fps);
    game.levarDano(12);
    assert.strictEqual(game.jog.vida, 116, 'Breach: proteção expira e volta a receber dano');
  }
  game.entrarNaSala(1);
  assert.strictEqual(game.jog.vida, 146, 'Breach: avançar recupera 30 de vida');
  game.entrarNaSala(2);
  assert.strictEqual(game.jog.vida, 150, 'Breach: cura da sala respeita o máximo');
  game.jog.vida = 80;
  game.itens.push({ x: game.jog.x, y: game.jog.y, tipo: 'vida' });
  game.pegarItens();
  assert.strictEqual(game.jog.vida, 120, 'Breach: kit recupera 40 de vida');
  game.itens.push({ x: game.jog.x, y: game.jog.y, tipo: 'vida' });
  game.pegarItens();
  assert.strictEqual(game.jog.vida, 150, 'Breach: kit respeita o máximo');
  game.jog.protecao = 0; game.levarDano(200); game.levarDano(10);
  assert.strictEqual(game.jog.vida, 0, 'Breach: dano fatal não deixa vida negativa');
  game.comecar();
  assert.strictEqual(game.jog.protecao, 0, 'Breach: reinício limpa a proteção anterior');
  for (let sala = 0; sala < 5; sala++) {
    game.entrarNaSala(sala);
    marks.length = 0; game.minimapa();
    assert.strictEqual(marks.filter(m => m[0] === 'arc').length, game.inimigos.length,
      'Breach: radar mostra todos os inimigos, mesmo atrás de paredes');
    assert.ok(marks.some(m => m[0] === 'rotate' && m[1] === game.jog.ang),
      'Breach: seta acompanha a direção do jogador');
    game.inimigos.pop(); marks.length = 0; game.minimapa();
    assert.strictEqual(marks.filter(m => m[0] === 'arc').length, game.inimigos.length,
      'Breach: inimigo removido desaparece do radar');
  }
  game.comecar();
  assert.strictEqual(game.enxerga({ x: 2.8, y: 2.2 }, { x: 3.21, y: 1.8 }), false,
    'Breach: nem um canto fino de parede pode ser saltado pela linha de visão');
  for (const fps of [30, 60, 120]) {
    for (const tipo of ['atirador', 'chefe']) {
      game.comecar(); game.entrarNaSala(4);
      const inimigo = game.inimigos.find(e => e.tipo === tipo);
      game.inimigos.splice(0, game.inimigos.length, inimigo);
      Object.assign(inimigo, { x: 8.5, y: 11.5, cd: 0 });
      game.update(1 / fps);
      assert.strictEqual(game.jog.vida, 150, 'Breach: disparo distante não causa dano instantâneo');
      assert.strictEqual(game.projeteis.length, 0, 'Breach: inimigo avisa antes de disparar');
      assert.ok(inimigo.preparando > 0, 'Breach: preparação aparece no inimigo');
      for (let i = 0; i < fps && !game.projeteis.length; i++) game.update(1 / fps);
      assert.strictEqual(game.projeteis.length, 1, 'Breach: ataque distante cria projétil visível');
      for (let i = 0; i < fps * 0.5; i++) game.update(1 / fps);
      assert.strictEqual(game.jog.vida, 150, 'Breach: há tempo para reagir ao tiro a três metros');
      for (let i = 0; i < fps * 0.3; i++) game.update(1 / fps);
      assert.strictEqual(game.jog.vida, 150 - inimigo.dano, 'Breach: tiro só machuca ao chegar');
      assert.strictEqual(game.projeteis.length, 0, 'Breach: impacto consome o projétil');
      if (tipo === 'chefe') {
        assert.ok(inimigo.dano <= 12, 'Breach: chefe tira no máximo 12 de vida por acerto');
        for (let i = 0; i < fps * 0.4; i++) game.update(1 / fps);
        assert.strictEqual(game.projeteis.length, 1, 'Breach: chefe dispara novamente em cerca de 0,9 s');
      }
      // O tiro mantém a direção inicial: sair da linha permite desviar.
      inimigo.cd = 0; inimigo.preparando = 0; game.update(1 / fps);
      for (let i = 0; i < fps && !game.projeteis.length; i++) game.update(1 / fps);
      game.inimigos.length = 0;
      game.jog.x += 1;
      const vida = game.jog.vida;
      for (let i = 0; i < fps; i++) game.update(1 / fps);
      assert.strictEqual(game.jog.vida, vida, 'Breach: deslocamento lateral desvia do projétil');
    }
    game.comecar(); game.entrarNaSala(4);
    const chefe = game.inimigos.find(e => e.tipo === 'chefe');
    game.inimigos.splice(0, game.inimigos.length, chefe);
    Object.assign(chefe, { x: 8.5, y: 10.5, cd: 0 });
    for (let i = 0; i < fps * 10 && game.inimigos.length; i++) {
      game.atirar(); game.update(1 / fps);
    }
    assert.strictEqual(game.inimigos.length, 0, 'Breach: pistola consegue vencer o chefe isolado');
    assert.ok(game.jog.vida >= 30 && game.jog.vida < 90,
      'Breach: chefe pressiona quem fica parado, mas ainda permite vencer com a pistola');
  }
  game.comecar(); game.entrarNaSala(4); game.inimigos.length = 0;
  Object.assign(game.jog, { x: 5.5, y: 6.5 });
  game.projeteis.push({ x: 5.5, y: 4.5, ang: Math.PI / 2, vel: 4, dano: 8 });
  game.atualizarProjeteis(1);
  assert.strictEqual(game.jog.vida, 150, 'Breach: parede intercepta tiro mesmo num passo longo');
  assert.strictEqual(game.projeteis.length, 0, 'Breach: tiro desaparece ao bater na parede');
  game.projeteis.push({ x: 8.5, y: 11.5, ang: 0, vel: 4, dano: 8 });
  game.entrarNaSala(0);
  assert.strictEqual(game.projeteis.length, 0, 'Breach: trocar de sala limpa os tiros anteriores');
  game.comecar(); game.entrarNaSala(4);
  const atirador = game.inimigos.find(e => e.tipo === 'atirador');
  game.inimigos.splice(0, game.inimigos.length, atirador);
  Object.assign(atirador, { x: 5.5, y: 4.5, cd: 0 });
  Object.assign(game.jog, { x: 5.5, y: 2.5 });
  game.update(0.01);
  assert.ok(atirador.preparando > 0, 'Breach: atirador inicia preparação ao avistar o jogador');
  game.jog.y = 6.5;
  game.update(0.5);
  assert.strictEqual(game.projeteis.length, 0, 'Breach: buscar cobertura cancela o tiro em preparação');
  game.comecar();
  game.matar(game.inimigos[0]); game.matar(game.inimigos[0]);
  assert.strictEqual(game.combo, 2, 'Breach: abates próximos aumentam o combo');
  assert.strictEqual(game.score, 300, 'Breach: segundo corredor vale o dobro');
  game.levarDano(8);
  assert.strictEqual(game.combo, 0, 'Breach: receber dano encerra a sequência');

  // Campanha: limpar a sala pausa de verdade, entrega o loot e aplica só uma escolha.
  game.comecar();
  for (let sala = 0; sala < 5; sala++) {
    if (sala === 1 || sala === 2) {
      const arma = game.itens.find(it => it.tipo === 'arma');
      assert.ok(arma && game.enxerga(game.jog, arma), 'Breach: arma da sala aparece à vista da entrada');
      assert.ok(Math.hypot(arma.x - game.jog.x, arma.y - game.jog.y) <= 2, 'Breach: arma nova fica perto');
    }
    for (const e of [...game.inimigos]) game.matar(e);
    for (let i = 0; i < 100; i++) game.update(1 / 60);
    if (sala === 4) { assert.strictEqual(game.state, 'fim', 'Breach: última sala encerra a campanha'); break; }
    assert.strictEqual(game.state, 'melhoria', 'Breach: sala limpa abre a escolha');
    assert.strictEqual(game.itens.length, 0, 'Breach: loot restante é recolhido ao terminar a sala');
    const antes = JSON.stringify(game.jog);
    game.update(10); game.esquivar(); game.atirar(); game.escolherMelhoria(8);
    assert.strictEqual(JSON.stringify(game.jog), antes, 'Breach: combate congela durante a escolha');
    const escolha = sala % 3;
    nodes.get('melhoria' + escolha).events.get('click')();
    game.escolherMelhoria(escolha);
    assert.strictEqual(game.state, 'playing', 'Breach: escolha retoma uma única sala');
    assert.strictEqual(+nodes.get('sala').textContent, sala + 2, 'Breach: clique duplo não pula salas');
    if (sala === 0) assert.strictEqual(game.jog.vidaMax, 175, 'Breach: blindagem amplia a vida máxima');
    if (sala === 1) assert.ok(game.temArma[1], 'Breach: escopeta esquecida é entregue na saída');
    if (sala === 2) assert.ok(game.temArma[2], 'Breach: metralhadora esquecida é entregue na saída');
  }
  game.comecar();
  assert.strictEqual(game.jog.vidaMax, 150, 'Breach: nova partida reinicia a blindagem');
  assert.strictEqual(game.jog.impacto + game.jog.cadencia, 0, 'Breach: melhorias não vazam entre partidas');
  assert.deepStrictEqual(game.temArma, [true, false, false], 'Breach: armas reiniciam com a campanha');

  for (const fps of [30, 60, 120]) {
    game.comecar(); game.inimigos.length = 0;
    const y = game.jog.y;
    docEvents.get('keydown')({ key: ' ', repeat: false, preventDefault: noop });
    game.levarDano(20);
    assert.strictEqual(game.jog.vida, 150, 'Breach: esquiva protege durante o impulso');
    for (let i = 0; i < fps * 0.3; i++) game.update(1 / fps);
    assert.ok(Math.abs(game.jog.y - y - 1.28) < 0.01, 'Breach: esquiva tem alcance igual em qualquer FPS');
    const cd = game.jog.esquivaCD;
    game.esquivar();
    assert.strictEqual(game.jog.esquivaCD, cd, 'Breach: não pode repetir esquiva durante a recarga');
    game.levarDano(20);
    assert.strictEqual(game.jog.vida, 130, 'Breach: proteção da esquiva termina');
    Object.assign(game.jog, { x: 1.3, y: 14.5, ang: 0, esquivaCD: 0 });
    game.esquivar();
    for (let i = 0; i < fps * 0.3; i++) game.update(1 / fps);
    assert.ok(game.jog.x >= 1.24, 'Breach: esquiva não atravessa parede');
  }

  game.comecar(); game.entrarNaSala(4);
  const alvo = game.inimigos.find(e => e.tipo === 'chefe');
  game.inimigos.splice(0, game.inimigos.length, alvo);
  Object.assign(alvo, { x: 8.5, y: 10.5 });
  game.jog.impacto = 1;
  game.atirar();
  assert.strictEqual(alvo.vida, alvo.vidaMax - 39, 'Breach: melhoria de impacto aumenta o dano real');
  const disparosEmUmSegundo = cadencia => {
    game.comecar(); game.inimigos.length = 0; game.jog.cadencia = cadencia;
    for (let i = 0; i < 60; i++) { game.atirar(); game.update(1 / 60); }
    return game.tiros;
  };
  assert.ok(disparosEmUmSegundo(2) > disparosEmUmSegundo(0), 'Breach: cadência melhora a frequência real');
  game.comecar(); game.inimigos.length = 0;
  game.temArma[1] = true; game.municao[1] = 2;
  nodes.get('trocarArma').events.get('click')();
  assert.strictEqual(game.jog.arma, 1, 'Breach: botão troca para arma desbloqueada');
  game.municao[1] = 0; game.atirar();
  assert.strictEqual(game.jog.arma, 0, 'Breach: arma vazia volta para pistola');
  let cancelouMouse = false;
  nodes.get('stage').events.get('pointerdown')({ pointerType: 'mouse', preventDefault() { cancelouMouse = true; } });
  assert.strictEqual(cancelouMouse, false, 'Breach: toque não cancela mousedown do disparo contínuo');
  nodes.get('game').events.get('mousedown')({ button: 0 });
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  assert.ok(game.tiros > 1, 'Breach: segurar mouse dispara continuamente');
  docEvents.get('keydown')({ key: 'p' });
  docEvents.get('keydown')({ key: 'p' });
  const tirosAntes = game.tiros;
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  assert.strictEqual(game.tiros, tirosAntes, 'Breach: pausar limpa o disparo preso');
}
const dda = new Function('MAPA', 'celula',
  block(breach, '  function castar(px, py, ang)') + '; return castar;');
const planta = [
  '11111111',
  '1......1',
  '1..2...1',
  '1......1',
  '1...3..1',
  '1......1',
  '11111111',
];
const celulaTeste = (x, y) => {
  if (x < 0 || y < 0 || x >= planta[0].length || y >= planta.length) return 1;
  const c = planta[y][x];
  return c === '.' ? 0 : +c;
};
const castar = dda(planta, celulaTeste);
// de (1.5, 1.5) olhando pra direita, a primeira parede e a borda em x=7
const dir = castar(1.5, 1.5, 0);
assert.strictEqual(dir.tipo, 1, 'Olhando pro corredor livre o raio para na borda');
assert.ok(Math.abs(dir.dist - 5.5) < 1e-6, `A distancia ate a borda tem que ser 5.5, deu ${dir.dist}`);
// de (1.5, 2.5) olhando pra direita, o bloco 2 em x=3 vem antes
const bloco = castar(1.5, 2.5, 0);
assert.strictEqual(bloco.tipo, 2, 'O raio tem que parar no bloco tipo 2, nao atravessar');
assert.ok(Math.abs(bloco.dist - 1.5) < 1e-6, `O bloco esta a 1.5, deu ${bloco.dist}`);
// olhando pra cima e pra baixo o lado muda, e e o lado que escurece a face
assert.strictEqual(castar(1.5, 1.5, Math.PI / 2).lado, 1, 'Batida no eixo Y marca lado 1');
assert.strictEqual(castar(1.5, 1.5, 0).lado, 0, 'Batida no eixo X marca lado 0');
// raio nunca volta distancia negativa, em qualquer angulo
for (let a = 0; a < Math.PI * 2; a += 0.05) {
  const h = castar(3.5, 3.5, a);
  assert.ok(h.dist > 0 && h.dist < 20, `Distancia fora de faixa no angulo ${a.toFixed(2)}: ${h.dist}`);
  assert.ok(h.tipo > 0, `Todo raio tem que bater em alguma coisa (angulo ${a.toFixed(2)})`);
}

// Salas do Breach: planta, ponto de entrada e receita andam juntos. Se o jogador ou
// um inimigo nascer dentro de parede, a sala trava e nao tem como terminar o jogo.
const salasBreach = new Function('Neon',
  breach.slice(breach.indexOf('  const SALAS = ['), breach.indexOf('  let sala = 0;')) +
  breach.slice(breach.indexOf('  const TIPOS = {'), breach.indexOf('  function entrarNaSala')) +
  '; return { SALAS, TIPOS, PONTOS };')({ rand: (a, b) => (a + b) / 2 });
const paredeEm = (planta, x, y) => {
  if (x < 0 || y < 0 || x >= planta[0].length || y >= planta.length) return true;
  return planta[y][x] !== '.';
};
assert.ok(salasBreach.SALAS.length >= 4, 'O Breach precisa de pelo menos 4 salas');
for (const [i, s] of salasBreach.SALAS.entries()) {
  const [ex, ey] = s.entrada;
  assert.ok(!paredeEm(s.planta, Math.floor(ex), Math.floor(ey)),
    `sala ${i + 1} (${s.nome}): a entrada cai dentro de parede`);
  assert.ok(s.receita.length, `sala ${i + 1}: sala sem inimigo nunca termina`);
  for (const nome of s.receita) {
    assert.ok(salasBreach.TIPOS[nome], `sala ${i + 1}: inimigo desconhecido "${nome}"`);
  }
  // tem que sobrar chao longe da entrada pra todo mundo da receita caber
  let vagas = 0;
  for (let y = 1; y < s.planta.length - 1; y++)
    for (let x = 1; x < s.planta[0].length - 1; x++)
      if (!paredeEm(s.planta, x, y) && Math.hypot(x + 0.5 - ex, y + 0.5 - ey) > 4.5) vagas++;
  assert.ok(vagas >= s.receita.length + 1,
    `sala ${i + 1}: só ${vagas} vagas longe da entrada para ${s.receita.length} inimigos e o item`);
}
// Chao ilhado no Breach = inimigo que nasce onde o jogador nunca chega, e a sala
// nunca termina. Foi o que travou os CORREDORES na segunda fase.
for (const [i, s] of salasBreach.SALAS.entries()) {
  const [ex, ey] = s.entrada;
  const livreEm = (x, y) => !paredeEm(s.planta, x, y);
  const inicio = `${Math.floor(ex)},${Math.floor(ey)}`;
  const vistos = new Set([inicio]);
  const fila = [[Math.floor(ex), Math.floor(ey)]];
  while (fila.length) {
    const [x, y] = fila.pop();
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (vistos.has(k) || !livreEm(nx, ny)) continue;
      vistos.add(k);
      fila.push([nx, ny]);
    }
  }
  let chao = 0;
  for (let y = 0; y < s.planta.length; y++)
    for (let x = 0; x < s.planta[0].length; x++)
      if (livreEm(x, y)) chao++;
  assert.strictEqual(vistos.size, chao,
    `sala ${i + 1} (${s.nome}): ${chao - vistos.size} casas de chao ilhadas da entrada`);
}

const comChefe = salasBreach.SALAS.filter(s => s.receita.includes('chefe'));
assert.strictEqual(comChefe.length, 1, 'O chefe aparece em exatamente uma sala');
assert.strictEqual(comChefe[0], salasBreach.SALAS.at(-1), 'O chefe e a ultima sala');
assert.ok(salasBreach.PONTOS.chefe > salasBreach.PONTOS.tanque, 'O chefe vale mais que o tanque');
assert.ok(salasBreach.TIPOS.chefe.vida > salasBreach.TIPOS.tanque.vida * 3,
  'O chefe precisa aguentar bem mais que o tanque, senao nao e chefe');

// Caixa de marchas do Racha: e o jogo inteiro. A punicao por trocar cedo tem que
// nascer da curva de torque, e o alvo tem que ser estreito o bastante pra errar
// doer. Faixa larga demais transforma o jogo em apertar botao na hora que der.
const racha = games.racha;
const caixa = new Function('Neon',
  racha.slice(racha.indexOf('  const MARCHAS = ['), racha.indexOf('  // A cor do rival avisa')) +
  '; return { MARCHAS, ZONAS, FORA, CORTE, torque, zonaDa, naJanela };')({ clamp: clampFn });
assert.strictEqual(caixa.MARCHAS.length, 6, 'Sao 6 marchas');
let topoAnterior = 0, torqueAnterior = Infinity, pontoAnterior = 0;
for (const m of caixa.MARCHAS) {
  assert.ok(m.topo > topoAnterior, 'Marcha mais alta tem que correr mais');
  assert.ok(m.torque < torqueAnterior, 'Marcha mais alta tem que empurrar menos');
  assert.ok(m.ponto > pontoAnterior, 'O ponto de troca sobe a cada marcha, senao vira um lugar so');
  assert.ok(m.ponto < caixa.CORTE, 'O ponto de troca fica antes do corte');
  topoAnterior = m.topo; torqueAnterior = m.torque; pontoAnterior = m.ponto;
}
assert.strictEqual(caixa.MARCHAS.at(-1).topo, 1, 'A ultima marcha chega no teto de velocidade');

// as tres faixas tem que ser concentricas e a verde a mais estreita de todas
const [verde, amarelo, laranja] = caixa.ZONAS;
assert.strictEqual(verde.nome, 'verde', 'A primeira faixa e a verde, e ela ganha do empate');
assert.ok(verde.raio < amarelo.raio && amarelo.raio < laranja.raio, 'As faixas crescem de dentro pra fora');
assert.ok(verde.raio <= 0.03, `A faixa verde precisa ser estreita, esta em ${verde.raio}`);
assert.ok(verde.pontos > amarelo.pontos && amarelo.pontos > laranja.pontos, 'Mais perto do ponto, mais ponto');
assert.ok(verde.rend > amarelo.rend && amarelo.rend > laranja.rend && laranja.rend > caixa.FORA.rend,
  'Mais perto do ponto, mais motor sobra pro trecho seguinte');
assert.strictEqual(verde.rend, 1, 'So a troca no ponto entrega o motor inteiro');
assert.ok(caixa.FORA.rend < 0.8, 'Errar a troca tem que doer no trecho todo, nao so no instante');

// a faixa cai em volta do ponto de cada marcha, e nao num lugar fixo
for (const [i, m] of caixa.MARCHAS.entries()) {
  assert.strictEqual(caixa.zonaDa(i, m.ponto).nome, 'verde', `marcha ${i + 1}: o proprio ponto tem que ser verde`);
  assert.ok(caixa.naJanela(i, m.ponto), `marcha ${i + 1}: o ponto conta como troca perfeita`);
  assert.strictEqual(caixa.zonaDa(i, m.ponto + verde.raio * 1.5).nome, 'amarelo', `marcha ${i + 1}: logo fora do verde e amarelo`);
  assert.strictEqual(caixa.zonaDa(i, m.ponto - amarelo.raio * 1.5).nome, 'laranja', `marcha ${i + 1}: mais longe ainda e laranja`);
  assert.strictEqual(caixa.zonaDa(i, m.ponto + 0.3).nome, 'fora', `marcha ${i + 1}: longe demais e troca errada`);
}
// o ponto da primeira marcha nao pode ser verde na ultima: senao decorar resolve
assert.notStrictEqual(caixa.zonaDa(5, caixa.MARCHAS[0].ponto).nome, 'verde',
  'O ponto da 1a marcha nao pode servir na 6a, senao o jogador decora um lugar so');

// o torque continua premiando giro alto e punindo quem troca cedo ou estoura
const noPico = caixa.torque(0.75);
assert.ok(noPico > caixa.torque(0.2) * 1.5, 'Girar alto tem que empurrar bem mais que giro baixo');
assert.ok(caixa.torque(0.2) < caixa.torque(0.5), 'Trocar cedo joga o giro onde o torque some');
assert.ok(caixa.torque(1.02) < caixa.torque(0.2), 'Depois do corte o motor para de empurrar');
for (let r = 0; r <= 1.08; r += 0.01) assert.ok(caixa.torque(r) > 0, `Torque nunca zera (rpm ${r.toFixed(2)})`);
assert.ok(caixa.torque(caixa.MARCHAS[0].ponto) > noPico * 0.7, 'O ponto de troca fica na parte boa da curva');

// Fases do Slug: sao tiras de texto. Linha de tamanho diferente vira buraco
// invisivel no chao, e chefe fora da ultima fase quebra o final do jogo.
const slug = games.slug;
const fasesSlug = new Function(
  slug.slice(slug.indexOf('  const FASES = ['), slug.indexOf('  const SOLIDO =')) +
  '; return FASES;')();
assert.strictEqual(fasesSlug.length, 3, 'O Slug tem 3 fases');
for (const [i, f] of fasesSlug.entries()) {
  const larg = f.mapa[0].length;
  for (const [j, linha] of f.mapa.entries())
    assert.strictEqual(linha.length, larg, `fase ${i + 1}: a linha ${j} tem largura diferente do resto`);
  assert.ok(f.mapa.length === 12, `fase ${i + 1}: as fases precisam ter 12 linhas`);
  // o jogador nasce em x=90, entao a coluna 1 nao pode estar tapada
  for (let y = 0; y < 6; y++)
    assert.ok(!'#='.includes(f.mapa[y][1]), `fase ${i + 1}: o ponto de entrada nasce dentro de bloco`);
  // tem que existir chao no fim da fase, senao nao da pra chegar na saida
  const ultima = larg - 1;
  assert.ok(f.mapa.some(l => l[ultima] === '#'), `fase ${i + 1}: falta chao na saida`);
  assert.ok([...f.mapa.join('')].some(c => c === 'E' || c === 'F' || c === 'X'),
    `fase ${i + 1}: fase sem inimigo nenhum`);
}
// Pulo duplo do Slug: o segundo pulo e o que alcanca as plataformas altas. Sem
// ele existiam plataformas desenhadas que o boneco nunca chegava.
assert.match(slug, /const PULOS_MAX = 2;/, 'O Slug precisa de pulo duplo');
assert.match(slug, /if \(state !== 'playing' \|\| jog\.pulos >= PULOS_MAX\) return;/,
  'O pulo tem que respeitar o limite de pulos no ar');
assert.match(slug, /if \(jog\.chao\) jog\.pulos = 0;/, 'Tocar o chao recarrega os pulos');
assert.match(slug, /if \(TECLAS\[k\] === 'pular'\) \{ if \(!e\.repeat\) pular\(\); return; \}/,
  'Pulo e evento, nao estado: segurando a tecla o segundo pulo sairia sozinho');
// altura alcancavel com dois pulos tem que cobrir as plataformas mais altas do mapa
const fis = new Function(
  slug.slice(slug.indexOf('  const CELL ='), slug.indexOf('  // Fase e uma tira')) +
  '; return { G, PULO, CELL, LINHAS };')();
const alturaPulo = (fis.PULO * fis.PULO) / (2 * fis.G);          // altura de um pulo so
const alturaDupla = alturaPulo + ((fis.PULO * 0.86) ** 2) / (2 * fis.G);
assert.ok(alturaDupla > alturaPulo * 1.5, 'O segundo pulo tem que somar altura de verdade');
// A conta que importa nao e a altura solta: e se cada plataforma desenhada tem
// de onde ser alcancada. Sem isso sobra degrau bonito que o boneco nunca sobe.
for (const [i, f] of fasesSlug.entries()) {
  const L = f.mapa[0].length, A = f.mapa.length;
  const solido = (x, y) => y >= 0 && y < A && x >= 0 && x < L && '#='.includes(f.mapa[y][x]);
  const apoios = [];
  for (let x = 0; x < L; x++) {
    apoios[x] = [];
    for (let y = 0; y < A; y++) if (solido(x, y) && !solido(x, y - 1)) apoios[x].push(y);
  }
  for (let x = 0; x < L; x++) {
    for (const y of apoios[x]) {
      let maisProximo = Infinity;
      for (let xx = Math.max(0, x - 2); xx < Math.min(L, x + 3); xx++)
        for (const yy of apoios[xx]) if (yy > y && yy < maisProximo) maisProximo = yy;
      if (maisProximo === Infinity) continue;           // nada embaixo: chao ou borda
      const salto = (maisProximo - y) * fis.CELL;
      assert.ok(salto <= alturaDupla * 0.85,
        `fase ${i + 1} (${f.nome}): a plataforma da coluna ${x}, linha ${y} pede ${salto}px ` +
        `de salto e o pulo duplo sobe ${alturaDupla.toFixed(0)}px`);
    }
  }
}

const comChefeSlug = fasesSlug.filter(f => f.mapa.join('').includes('X'));
assert.strictEqual(comChefeSlug.length, 1, 'O chefe do Slug aparece em uma fase so');
assert.strictEqual(comChefeSlug[0], fasesSlug.at(-1), 'O chefe do Slug e a ultima fase');

// Mira automatica: e ela que faz o jogo funcionar sem mouse. Tem que pegar quem
// esta na frente, dentro do cone, e ignorar quem esta atras ou fora dele.
const mirarSlug = new Function('jog', 'inimigos', 'Math',
  block(slug, '  function mirar()') + '; return mirar;');
const alvo = (px, olha, lista) => mirarSlug({ x: px, y: 300, olha }, lista, Math)();
const soFrente = alvo(100, 1, [{ x: 400, y: 300 }]);
assert.ok(soFrente.dx > 0.9, 'Inimigo na frente puxa a mira pra frente');
const soAtras = alvo(100, 1, [{ x: -300, y: 300 }]);
assert.strictEqual(soAtras.dx, 1, 'Inimigo atras nao rouba a mira');
assert.strictEqual(soAtras.dy, 0, 'Sem alvo valido o tiro sai reto');
const foraDoCone = alvo(100, 1, [{ x: 160, y: 900 }]);
assert.strictEqual(foraDoCone.dy, 0, 'Alvo muito acima ou abaixo fica fora do cone');
const doisAlvos = alvo(100, 1, [{ x: 600, y: 300 }, { x: 200, y: 300 }]);
assert.ok(Math.abs(doisAlvos.dx - 1) < 1e-9, 'Com dois na mesma linha a mira vai no mais proximo');
const muitoLonge = alvo(100, 1, [{ x: 5000, y: 300 }]);
assert.strictEqual(muitoLonge.dx, 1, 'Alvo alem do alcance nao conta');

// Cidade do Runner: a grade tem que garantir que toda rua conecta com todas as
// outras. Se um predio invadir a rua, existe entrega impossivel de alcancar e o
// jogador perde o tempo dele sem entender por que.
const runner = games.runner;
const cidade = new Function(
  runner.slice(runner.indexOf('  const QUADRA ='), runner.indexOf('  const els = {')) +
  '; return { livre, centroRua, QUADRA, RUA, PREDIO, QUADRAS, MUNDO };')();
assert.strictEqual(cidade.PREDIO, cidade.QUADRA - cidade.RUA, 'O predio e a quadra menos a rua');
assert.ok(cidade.RUA > 60, 'A rua precisa caber o carro com folga');
// todo cruzamento de todas as quadras tem que ser rua livre
for (let j = 0; j < cidade.QUADRAS; j++) {
  for (let i = 0; i < cidade.QUADRAS; i++) {
    const c = cidade.centroRua(i, j);
    assert.ok(cidade.livre(c.x, c.y), `cruzamento ${i},${j} nasceu dentro de predio`);
  }
}
// o miolo de toda quadra tem que ser predio, senao nao existe cidade
for (let j = 0; j < cidade.QUADRAS; j++) {
  for (let i = 0; i < cidade.QUADRAS; i++) {
    const mx = i * cidade.QUADRA + cidade.RUA / 2 + cidade.PREDIO / 2;
    const my = j * cidade.QUADRA + cidade.RUA / 2 + cidade.PREDIO / 2;
    assert.ok(!cidade.livre(mx, my), `o miolo da quadra ${i},${j} devia ser predio`);
  }
}
// as ruas correm inteiras nos dois sentidos: e isso que garante caminho pra tudo
for (let i = 1; i < cidade.QUADRAS; i++) {
  const rua = i * cidade.QUADRA + cidade.RUA / 2;
  for (let t = cidade.RUA; t < cidade.MUNDO - cidade.RUA; t += 20) {
    assert.ok(cidade.livre(rua, t), `a avenida vertical ${i} esta tapada em y=${t}`);
    assert.ok(cidade.livre(t, rua), `a avenida horizontal ${i} esta tapada em x=${t}`);
  }
}
// fora do mundo nunca e livre, senao o carro escapa do mapa
assert.ok(!cidade.livre(-10, 500), 'Antes da borda oeste e solido');
assert.ok(!cidade.livre(cidade.MUNDO + 10, 500), 'Depois da borda leste e solido');
assert.ok(!cidade.livre(500, -10) && !cidade.livre(500, cidade.MUNDO + 10), 'Norte e sul tambem fecham');

// Entrega do Runner: cada uma devolve tempo, sobe o procurado e poe mais viatura
// na rua. Se o tempo nao tivesse teto, entregar sem parar daria noite infinita.
const entregaRunner = new Function('Neon', 'els', 'particles', 'carro', 'W', 'H',
  runner.slice(runner.indexOf('  const QUADRA ='), runner.indexOf('  // Cada quadra tem uma avenida')) +
  block(runner, '  function livre(x, y)') +
  runner.slice(runner.indexOf('  const centroRua ='), runner.indexOf('  const els = {')) + `
  let policia = [], alvo = null, comPacote = false, entregas = 0, procurado = 0, score = 0, tempo = 60;
  function shakeAt() {} function flashAt() {}
  ${block(runner, '  function sortearAlvo()')}
  ${block(runner, '  function nascerPolicia()')}
  ${block(runner, '  function entregar()')}
  ${block(runner, '  function pegar()')}
  return { pegar, entregar, sortearAlvo, livre, estado: () => ({ policia: policia.length, entregas, procurado, score, tempo, comPacote, alvo }) };
`);
const stubEl = () => ({ textContent: '' });
const rn = entregaRunner(
  { rand: (a, b) => (a + b) / 2, choice: a => a[0], clamp: clampFn, toast() {}, popEl() {},
    audio: { sfx: new Proxy({}, { get: () => () => {} }) } },
  { score: stubEl(), entregas: stubEl(), proc: stubEl() },
  { burst() {} },
  { x: 5 * 240 + 54, y: 5 * 240 + 54 }, 900, 600);
for (let i = 0; i < 120; i++) {
  rn.sortearAlvo();
  const a = rn.estado().alvo;
  assert.ok(rn.livre(a.x, a.y), `alvo ${i} sorteado dentro de predio`);
}
rn.pegar();
assert.ok(rn.estado().comPacote, 'pegar tem que marcar o pacote');
const antes = rn.estado();
rn.entregar();
const dep = rn.estado();
assert.strictEqual(dep.entregas, 1, 'a entrega precisa contar');
assert.ok(!dep.comPacote, 'depois de entregar o pacote sai');
assert.ok(dep.tempo > antes.tempo, 'entregar devolve tempo');
assert.ok(dep.score > antes.score, 'entregar pontua');
for (let i = 0; i < 12; i++) { rn.pegar(); rn.entregar(); }
const fim = rn.estado();
assert.strictEqual(fim.procurado, 5, `o procurado trava em 5 estrelas, deu ${fim.procurado}`);
assert.strictEqual(fim.policia, fim.procurado, 'a quantidade de viatura acompanha o procurado');
assert.ok(fim.tempo <= 90, `o tempo precisa de teto, senao a noite nao acaba (deu ${fim.tempo})`);

// Viatura do Runner: presa numa quina ela batia, desacelerava e passava a partida
// inteira raspando a mesma parede. Perseguir pelo eixo mais distante faz ela andar
// pela rua, e a manobra de meio segundo tira ela do canto quando trava mesmo assim.
const perseguicao = new Function('Neon', 'carro',
  runner.slice(runner.indexOf('  const QUADRA ='), runner.indexOf('  // Cada quadra tem uma avenida')) +
  block(runner, '  function livre(x, y)') +
  runner.slice(runner.indexOf('  const centroRua ='), runner.indexOf('  const els = {')) +
  block(runner, '  function deslizar(c, nx, ny)') +
  block(runner, '  function pensarPolicia(p, dt)') +
  '; return { pensarPolicia, livre, centroRua, QUADRA, RUA, VEL_POLICIA };');

const rodar = (viatura, alvo, segundos) => {
  const api = perseguicao({ clamp: clampFn }, alvo);
  const p = { travado: 0, manobra: 0, sirene: 0, vel: 0, ang: 0, ...viatura };
  const inicio = { x: p.x, y: p.y };
  let paradaMaisLonga = 0, parada = 0;
  for (let i = 0; i < segundos * 60; i++) {
    const antes = { x: p.x, y: p.y };
    api.pensarPolicia(p, 1 / 60);
    const andou = Math.hypot(p.x - antes.x, p.y - antes.y);
    parada = andou < 0.4 ? parada + 1 / 60 : 0;
    paradaMaisLonga = Math.max(paradaMaisLonga, parada);
    assert.ok(api.livre(p.x, p.y), `viatura entrou no predio em ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
  }
  return { andou: Math.hypot(p.x - inicio.x, p.y - inicio.y), paradaMaisLonga, fim: p };
};
const apiC = perseguicao({ clamp: clampFn }, { x: 0, y: 0 });
const Q = apiC.QUADRA, RU = apiC.RUA;
// encostada na quina de um predio, virada pra dentro dele, com o alvo do outro lado
const encurralada = rodar(
  { x: 3 * Q + RU - 4, y: 3 * Q + RU - 4, ang: Math.PI * 0.25 },
  { x: 8 * Q + RU / 2, y: 8 * Q + RU / 2 }, 6);
assert.ok(encurralada.andou > Q,
  `viatura encurralada andou so ${encurralada.andou.toFixed(0)}px em 6s; ela precisa sair da quina`);
assert.ok(encurralada.paradaMaisLonga < 1.2,
  `viatura ficou ${encurralada.paradaMaisLonga.toFixed(1)}s parada de uma vez; a manobra tem que destravar antes`);
// em rua limpa ela persegue direto, sem manobra desnecessaria
const solta = rodar(
  { x: 5 * Q + RU / 2, y: 5 * Q + RU / 2 },
  { x: 5 * Q + RU / 2 + Q * 3, y: 5 * Q + RU / 2 }, 4);
assert.ok(solta.andou > apiC.VEL_POLICIA * 2,
  `em rua livre a viatura devia cobrir bastante chao, andou ${solta.andou.toFixed(0)}px`);

// Nenhum jogo pode decidir se o dedo esta na tela olhando e.pressure. No iOS o
// toque reporta pressure 0 em aparelho sem force touch: o estilingue do Siege
// nunca esticava e a raquete do Pong nao respondia. Quem sabe se o arrasto esta
// vivo e o pointerId guardado no pointerdown.
// Comentario que cita a API nao pode derrubar o teste, entao ele olha so o codigo.
const semComentarios = txt => txt
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
for (const [name, html] of Object.entries(games)) {
  assert.ok(!/\.pressure/.test(semComentarios(html)),
    `${name}: nao use e.pressure pra saber se o dedo esta na tela, no iOS ele vem 0`);
}
// e o arrasto do Siege precisa continuar valendo mesmo se o dedo sair do quadro
assert.match(games.siege, /window\.addEventListener\('pointermove'/,
  'O arrasto do Siege tem que seguir o dedo pela janela, nao so dentro do stage');
assert.match(games.siege, /window\.addEventListener\('pointerup'/,
  'Soltar fora do quadro tambem tem que disparar o tiro do Siege');
// setPointerCapture congelava o arrasto no toque: a bola parava onde o dedo
// encostou e o estilingue nunca esticava. Toque ja tem captura implicita.
for (const [name, html] of Object.entries(games)) {
  assert.ok(!/setPointerCapture/.test(semComentarios(html)),
    `${name}: setPointerCapture trava o arrasto no toque, e os listeners na janela ja resolvem`);
}

// dica de girar: so jogo deitado ganha area girando. Quadrado, 4:3 e em pe, nao.
const hintSrc = block(core, '  function addRotateHint()');
const makeHint = new Function('document', 'getComputedStyle', `${hintSrc}; return addRotateHint;`);
const hintFor = (arw, arh) => {
  const filhos = [];
  const stage = { classList: new Set(), querySelector: () => filhos[0] || null, appendChild: c => filhos.push(c) };
  const doc = { querySelector: () => stage, createElement: () => ({}) };
  makeHint(doc, () => ({ getPropertyValue: k => (k === '--arw' ? arw : arh) }))();
  assert.strictEqual(stage.classList.has('landscape-game'), filhos.length > 0,
    'Só jogos horizontais recebem a composição compacta da entrada');
  return filhos.length;
};
assert.strictEqual(hintFor(3, 2), 1, 'Jogo 3:2 deve pedir pra girar o telefone');
assert.strictEqual(hintFor(1, 1), 0, 'Jogo quadrado cabe em pé, não pede giro');
assert.strictEqual(hintFor(4, 3), 0, 'Em 4:3 girar quase não muda a área, não pede giro');
assert.strictEqual(hintFor(16, 26), 0, 'Jogo em pé não pede giro');

// movimento reduzido: tremida de tela e flash sao canvas, o CSS nao alcanca.
// Cada jogo que tem o efeito precisa consultar Neon.motion.reduced antes de disparar.
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/,
  'O tema precisa respeitar prefers-reduced-motion');
let comFx = 0;
for (const [name, html] of Object.entries(games)) {
  for (const fx of ['shakeAt', 'flashAt']) {
    if (!html.includes(`function ${fx}(`)) continue;
    comFx++;
    assert.match(html, new RegExp(`function ${fx}\\([^)]*\\) \\{ if \\(!Neon\\.motion\\.reduced\\)`),
      `${name}: ${fx} tem que respeitar Neon.motion.reduced`);
  }
}
assert.ok(comFx >= 20, `Esperava tremida/flash em pelo menos 20 lugares, achei ${comFx}`);
assert.match(games['2048'], /if \(!Neon\.motion\.reduced\) flash = \{ t: 400/,
  'O 2048 seta o flash direto e também precisa do guarda');

// Flappy: todo vao gerado precisa ser alcancavel a partir do anterior. Batendo
// asa sem parar o passaro sobe |FLAP|/2 px/s, e o pilar seguinte chega em
// VAO_X/speed segundos. Em tela alta (450x800) sortear o vao livre estouraria isso.
const spawnSrc = block(games.flappy, '  function spawnPipe()');
function piorDegrau(W, H, speed, n = 300) {
  const FLAP = -390, GAP = 160, MARGEM = 90, VAO_X = Math.round(320 * (W / 900));
  const pipes = [];
  let semente = 7;
  const sorteio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const Neon = {
    rand: (a, b) => (sorteio() < 0.5 ? a : b),       // sempre um dos extremos: pior caso
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  };
  const spawnPipe = new Function(
    'Neon', 'pipes', 'W', 'H', 'MARGEM', 'GAP', 'FLAP', 'VAO_X', 'speed',
    `${spawnSrc}; return spawnPipe;`)(Neon, pipes, W, H, MARGEM, GAP, FLAP, VAO_X, speed);
  for (let i = 0; i < n; i++) spawnPipe();
  let pior = 0;
  for (let i = 1; i < pipes.length; i++) pior = Math.max(pior, Math.abs(pipes[i].gapY - pipes[i - 1].gapY));
  const dentroDoQuadro = pipes.every(p => p.gapY >= MARGEM && p.gapY + GAP <= H - MARGEM);
  return { pior, subidaMax: (Math.abs(FLAP) / 2) * (VAO_X / speed), dentroDoQuadro };
}
for (const [nome, W, H, speed] of [
  ['deitado, velocidade inicial', 900, 600, 260],
  ['deitado, velocidade máxima', 900, 600, 390],
  ['em pé, velocidade inicial', 450, 800, 130],
  ['em pé, velocidade máxima', 450, 800, 195],
]) {
  const r = piorDegrau(W, H, speed);
  assert.ok(r.pior <= r.subidaMax,
    `Flappy ${nome}: degrau de ${Math.round(r.pior)}px, mas dá pra subir só ${Math.round(r.subidaMax)}px entre pilares`);
  assert.ok(r.dentroDoQuadro, `Flappy ${nome}: vão nasceu fora do quadro`);
}

// Hoops: mesmo problema do Flappy. Todo aro perdido é fim de jogo, então o aro
// seguinte tem que estar ao alcance, contando a oscilação dos dois.
const spawnHoopSrc = block(games.hoops, '  function spawnHoop(x)');
function piorSaltoHoops(W, H, speed, n = 300) {
  const IMPULSE = -400, SPACING = Math.round(380 * (W / 900));
  const hoops = [];
  let semente = 7, spawned = 0;
  const sorteio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const Neon = {
    rand: (a, b) => (sorteio() < 0.5 ? a : b),       // sempre um dos extremos: pior caso
    choice: arr => arr[0],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  };
  const spawnHoop = new Function('Neon', 'hoops', 'H', 'IMPULSE', 'SPACING', 'speed', 'spawned',
    `${spawnHoopSrc}; return spawnHoop;`)(Neon, hoops, H, IMPULSE, SPACING, speed, spawned);
  const randomOriginal = Math.random;
  Math.random = () => 0;                             // força a oscilação a existir
  try { for (let i = 0; i < n; i++) spawnHoop(0); } finally { Math.random = randomOriginal; }
  let pior = 0;
  for (let i = 1; i < hoops.length; i++) {
    const a = hoops[i - 1], b = hoops[i];
    pior = Math.max(pior, Math.abs(b.baseY - a.baseY) + a.amp + b.amp);
  }
  const dentroDoQuadro = hoops.every(h => h.baseY - h.amp >= 40 && h.baseY + h.amp <= H - 40);
  return { pior, subidaMax: (Math.abs(IMPULSE) / 2) * (SPACING / speed), dentroDoQuadro };
}
for (const [nome, W, H, speed] of [
  ['deitado, velocidade inicial', 900, 600, 210],
  ['deitado, velocidade máxima', 900, 600, 270],
  ['em pé, velocidade inicial', 450, 800, 105],
  ['em pé, velocidade máxima', 450, 800, 135],
]) {
  const r = piorSaltoHoops(W, H, speed);
  assert.ok(r.pior <= r.subidaMax,
    `Hoops ${nome}: salto de ${Math.round(r.pior)}px, mas dá pra subir só ${Math.round(r.subidaMax)}px entre aros`);
  assert.ok(r.dentroDoQuadro, `Hoops ${nome}: aro nasceu fora do quadro`);
}

// Neon.world escolhe o formato do mundo e escreve --arw/--arh, que é o que o
// CSS usa pro aspect-ratio do quadro. Se os dois discordarem, o canvas estica.
const worldSrc = block(core, '  function world(canvas, deitado, emPe)');
function chamaWorld(retrato) {
  const props = {};
  const stage = { style: { setProperty: (k, v) => { props[k] = v; } } };
  const canvas = { width: 0, height: 0, closest: () => stage };
  const world = new Function('window', 'RETRATO', `${worldSrc}; return world;`)(
    { matchMedia: () => ({ matches: retrato }) }, 'mq');
  const r = world(canvas, [900, 600], [450, 800]);
  return { r, canvas: [canvas.width, canvas.height], props };
}
const deitado = chamaWorld(false), emPe = chamaWorld(true);
assert.deepStrictEqual(deitado.canvas, [900, 600], 'Deitado o mundo é 900x600');
assert.deepStrictEqual(emPe.canvas, [450, 800], 'Em pé o mundo é 450x800');
assert.strictEqual(deitado.r.retrato, false, 'Deitado não é retrato');
assert.strictEqual(emPe.r.retrato, true, 'Em pé é retrato');
for (const [nome, w] of [['deitado', deitado], ['em pé', emPe]]) {
  assert.strictEqual(+w.props['--arw'] / +w.props['--arh'], w.canvas[0] / w.canvas[1],
    `${nome}: --arw/--arh tem que bater com o canvas, senão o quadro estica`);
}

// Hoops: o que decide se dá pra passar é o corredor livre entre as pontas do
// rim, não o vão inteiro. Duas coisas têm que bater nos dois formatos: o tempo
// de travessia e a folga medida em bolas. A segunda é o que quebrava quando a
// bola não escalava junto — em pé sobravam 7 unidades contra 44 deitado. E a
// escala em pé não pode ser a metade da largura: virava uma bola de 7 px.
const gapSrc = games.hoops.match(/const GAP_W = ([^;]+);/)[1];
const raioSrc = games.hoops.match(/const R = ([^,]+), RIM_R = ([^;]+);/);
const escalaSrc = games.hoops.match(/const KS = ([^;]+);/)[1];
const velSrc = games.hoops.match(/const SPEED0 = ([^,]+), SPEED_INC = [^,]+, SPEED_MAX = ([^;]+);/);
const aro = retrato => {
  const KS = new Function('retrato', `return ${escalaSrc};`)(retrato);
  const ev = src => new Function('KS', `return ${src};`)(KS);
  const R = ev(raioSrc[1]), RIM_R = ev(raioSrc[2]);
  const GAP_W = new Function('KS', 'R', 'RIM_R', `return ${gapSrc};`)(KS, R, RIM_R);
  return { corredor: GAP_W - 2 * (R + RIM_R), R, speed0: ev(velSrc[1]), speedMax: ev(velSrc[2]) };
};
const travessia = (a, speed) => a.corredor / speed;
const folga = a => a.corredor / (2 * a.R);   // corredor medido em bolas
const aroDeitado = aro(false), aroEmPe = aro(true);
assert.ok(Math.abs(folga(aroDeitado) - folga(aroEmPe)) < 0.01,
  `Hoops: folga de ${folga(aroDeitado).toFixed(2)} bolas deitado contra ${folga(aroEmPe).toFixed(2)} em pé; ` +
  'em pé o aro fica apertado porque a bola não escala junto com o mundo');
const tDeitado = travessia(aroDeitado, aroDeitado.speed0), tEmPe = travessia(aroEmPe, aroEmPe.speed0);
assert.ok(Math.abs(tDeitado - tEmPe) < 0.01,
  `Hoops: travessia de ${tDeitado.toFixed(3)}s deitado contra ${tEmPe.toFixed(3)}s em pé; o aro em pé fica apertado`);
assert.ok(Math.abs(travessia(aroDeitado, aroDeitado.speedMax) - travessia(aroEmPe, aroEmPe.speedMax)) < 0.01,
  'Hoops: na velocidade máxima a travessia também tem que bater nos dois formatos');
assert.ok(aroEmPe.R >= 10, `Hoops: em pé a bola precisa de pelo menos 10 px de raio pra dar pra ver no celular (tem ${aroEmPe.R.toFixed(1)})`);

// mobile: página de jogo é quadro travado. Sem zoom de dois toques, sem menu de
// seleção, sem scroll. O menu (index.html) fica de fora, lá dá pra ampliar texto.
for (const [name, html] of Object.entries(games)) {
  assert.match(html, /<meta name="viewport"[^>]*user-scalable=no/,
    `${name}: viewport precisa travar o zoom`);
}
assert.ok(!/user-scalable=no/.test(menu), 'O menu não deve travar o zoom, é texto pra ler');
for (const regra of ['touch-action: manipulation', 'user-select: none', '-webkit-touch-callout: none']) {
  assert.ok(css.includes(regra), `O tema precisa de "${regra}" em html, body`);
}
const travaMobile = block(css, '@media (max-width: 700px), (orientation: landscape) and (max-height: 520px)');
assert.match(travaMobile, /body:has\(\.stage\)[\s\S]*touch-action: none/,
  'Em celular a página de jogo precisa de touch-action: none, senão a pinça passa no iOS');
assert.match(travaMobile, /html:has\(\.stage\)[\s\S]*overflow: hidden/,
  'Em celular html e body precisam travar juntos: só o body fixo deixa o <html> preso em scrollTop negativo no PWA do iOS e desalinha o hit-test');

// iPhone com notch/Dynamic Island: viewport-fit=cover cola o layout no topo da
// tela, entao todo padding de topo/base do .app precisa somar a safe area,
// senao o titulo e o placar ficam embaixo da ilha.
for (const [name, html] of Object.entries({ ...games, menu })) {
  assert.match(html, /<meta name="viewport"[^>]*viewport-fit=cover/,
    `${name}: viewport precisa de viewport-fit=cover`);
}
// viewport-fit=cover so vale no PWA do iOS com a barra de status translucida.
// Sem esta meta o iOS abre a pagina numa viewport 93px menor e depois estica:
// o quadro cresce sozinho e o toque continua caindo no lugar antigo.
for (const [name, html] of Object.entries({ ...games, menu })) {
  assert.match(html, /apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
    `${name}: falta a meta apple-mobile-web-app-status-bar-style=black-translucent`);
}
// A faixa branca do PWA so aparece em retrato. Sem o teto o ajuste dispararia
// tambem em paisagem, onde a diferenca passa de 400px, e esticaria a pagina.
assert.match(core, /falta > 0 && falta <= 120/,
  'travaAlturaPWA precisa limitar o ajuste a faixa da barra de status');
assert.ok(!/falta <= 0[^\n]*style\.height = ''/.test(core),
  'travaAlturaPWA nao pode zerar a altura quando falta <= 0: a viewport oscilaria');

for (const [, decl] of css.matchAll(/\.app(?::has\([^)]*\))?\s*\{[^}]*?padding:([^;]*);/g)) {
  assert.ok(/safe-area-inset-top/.test(decl) && /safe-area-inset-bottom/.test(decl),
    `.app com "padding:${decl}" ignora a safe area do iPhone`);
}

// a trilha tem que desligar quando a partida acaba. Antes ela seguia tocando
// por cima do fim de jogo, em todos os 13.
for (const [name, html] of Object.entries(games)) {
  assert.ok(html.includes('Neon.audio.music.down()'),
    `${name}: precisa chamar music.down() quando a partida acaba`);
}
for (const metodo of ['start()', 'stop(fade)', 'down()', 'intensity(k)']) {
  assert.ok(core.includes('    ' + metodo), `O MUSIC precisa expor ${metodo}`);
}
// intensity é o que liga o jogo ao andamento e ao filtro; fora de 0..1 desafina
const intensitySrc = core.match(/intensity\(k\) \{ ([^}]+) \}/)[1];
const setIntensity = new Function('clamp', 'musIntensity', 'k', `
  ${intensitySrc}; return musIntensity;`);
assert.strictEqual(setIntensity(clampFn, 0, 2), 1, 'intensity acima de 1 tem que grudar em 1');
assert.strictEqual(setIntensity(clampFn, 0, -3), 0, 'intensity abaixo de 0 tem que grudar em 0');
assert.strictEqual(setIntensity(clampFn, 0, undefined), 0, 'intensity sem valor é 0, não NaN');
assert.strictEqual(setIntensity(clampFn, 0, 0.5), 0.5, 'intensity no meio passa direto');

// ondas e textos flutuantes: entram no mesmo Particles que os jogos já usam, então
// clear/update/draw precisam cuidar dos três sem o jogo saber que existem.
const ParticlesSrc = block(core, '  class Particles {');
const Particles = new Function('rand', `${ParticlesSrc}; return Particles;`)(
  (a, b) => (a + b) / 2);
const fx = new Particles();
fx.burst(10, 10, '#fff', 4);
fx.wave(20, 20, '#0ff');
fx.float(30, 30, '+100', '#ff0');
assert.strictEqual(fx.waves.length, 1, 'wave entra na lista de ondas');
assert.strictEqual(fx.floats.length, 1, 'float entra na lista de textos');
const ctxFalso = new Proxy({}, {
  get: (_, k) => (k === 'canvas' ? {} : typeof k === 'string' ? () => {} : undefined),
  set: () => true,
});
fx.draw(ctxFalso);                                   // não pode explodir com os três juntos
const subiu = fx.floats[0].y;
fx.update(0.5);
assert.ok(fx.floats[0].y < subiu, 'o texto flutuante tem que subir');
fx.update(2);
assert.strictEqual(fx.waves.length, 0, 'a onda tem que expirar sozinha');
assert.strictEqual(fx.floats.length, 0, 'o texto tem que expirar sozinho');
fx.wave(1, 1, '#fff'); fx.float(1, 1, 'x', '#fff'); fx.burst(1, 1, '#fff', 2);
fx.clear();
assert.deepStrictEqual([fx.list.length, fx.waves.length, fx.floats.length], [0, 0, 0],
  'clear() tem que limpar os três, senão sobra lixo entre partidas');

// pausar também ao perder o foco da janela, não só ao trocar de aba
assert.match(core, /window\.addEventListener\('blur', fn\)/,
  'onHide precisa pausar no blur, senão o jogo roda atrás de outra janela');

// pele da cobra: um boost por vez manda na cor, e a ordem importa quando dois
// estao ligados juntos. Phantom tem que ganhar, senao a cobra atravessa parede
// pintada de turbo e o jogador nao ve que esta invulneravel.
const pele = new Function(`${block(games.snake, '  function peleDaCobra(')}; return peleDaCobra;`)();
assert.strictEqual(pele(true, true, true, true).glow, '#9be7ce', 'Phantom manda na cor acima de tudo');
assert.strictEqual(pele(false, true, true, true).glow, '#ffb300', 'Turbo vem depois do phantom');
assert.strictEqual(pele(false, false, true, true).glow, '#dda077', 'Frenzy vem depois do turbo');
assert.strictEqual(pele(false, false, false, true).glow, '#5b8cff', 'Slow é o último boost');
const padrao = pele(false, false, false, false);
assert.ok(padrao.a && padrao.b && padrao.glow, 'Sem boost nenhum a cobra ainda tem cor');
for (const [nome, p] of [['phantom', pele(true)], ['turbo', pele(0, 1)], ['padrão', padrao]]) {
  assert.notStrictEqual(p.a, p.b, `${nome}: as duas pontas do gradiente não podem ser iguais`);
}

// swipe encadeado: sem reancorar a origem, um gesto vira uma curva só
assert.match(games.snake, /swipe\.x = e\.clientX; swipe\.y = e\.clientY;/,
  'O swipe do Snake precisa reancorar a origem a cada curva');

// Aurora: textos e ação principal precisam manter contraste no fundo comum.
const token = name => css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))[1];
const luminancia = hex => {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contraste = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};
for (const fundo of ['bg', 'bg-deep']) for (const texto of ['text', 'text-dim', 'title']) {
  assert.ok(contraste(token(texto), token(fundo)) >= 4.5, `${texto} precisa ser legível em ${fundo}`);
}
assert.ok(contraste(token('bg'), token('neon-cyan')) >= 4.5, 'Texto do botão precisa contrastar com a menta');

// Asteroid em pé: o campo dá a volta, então o que tem que ficar igual é a fração
// de tela ocupada por rocha. E os limiares de ponto são relativos ao raio grande;
// com número fixo, a rocha encolhida cairia na faixa de pontuação errada.
const asteroid = games.asteroid;
const ptsSrc = asteroid.match(/const pts = (r\.r >= [^;]+);/)[1];
const splitSrc = asteroid.match(/if \((r\.r > R0 \* [\d.]+)\)/)[1];
function rochas(W, H) {
  const K = Math.sqrt((W * H) / (900 * 600)), R0 = 36 * K;
  const ponto = new Function('r', 'R0', `return ${ptsSrc};`);
  const racha = new Function('r', 'R0', `return ${splitSrc};`);
  const tamanhos = [R0, R0 / 2, R0 / 4];
  return {
    telaOcupada: 4 * Math.PI * R0 * R0 / (W * H),
    pontos: tamanhos.map(r => ponto({ r }, R0)),
    racham: tamanhos.map(r => racha({ r }, R0)),
  };
}
const rochaDeitado = rochas(900, 600), rochaEmPe = rochas(450, 800);
assert.ok(Math.abs(rochaDeitado.telaOcupada - rochaEmPe.telaOcupada) < 1e-9,
  `Asteroid: ${(rochaDeitado.telaOcupada * 100).toFixed(2)}% de tela ocupada deitado contra ${(rochaEmPe.telaOcupada * 100).toFixed(2)}% em pé`);
for (const [nome, r] of [['deitado', rochaDeitado], ['em pé', rochaEmPe]]) {
  assert.deepStrictEqual(r.pontos, [20, 50, 100], `Asteroid ${nome}: grande/média/pequena têm que valer 20/50/100`);
  assert.deepStrictEqual(r.racham, [true, true, false], `Asteroid ${nome}: só grande e média racham`);
}

// Snake em pé: a grade muda de forma, mas o número de células quase não muda,
// senão o recorde de um formato não seria comparável com o do outro.
const mundosSnake = games.snake.match(/Neon\.world\(canvas, \[([^\]]+)\], \[([^\]]+)\]\)/);
const celulas = lado => {
  const [a, b] = lado.split(',').map(x => Number(x.trim().replace(/\s*\*\s*CELL/, '')));
  return { cols: a, rows: b, total: a * b };
};
const gradeDeitado = celulas(mundosSnake[1]), gradeEmPe = celulas(mundosSnake[2]);
assert.ok(Math.abs(gradeDeitado.total - gradeEmPe.total) / gradeDeitado.total < 0.05,
  `Snake: ${gradeDeitado.total} células deitado contra ${gradeEmPe.total} em pé; o recorde deixa de ser comparável`);
assert.ok(gradeEmPe.rows > gradeEmPe.cols, 'Snake em pé precisa ser mais alto que largo');
assert.ok(gradeDeitado.cols > gradeDeitado.rows, 'Snake deitado precisa ser mais largo que alto');
assert.match(games.snake, /const emPe = ROWS > COLS;/,
  'O Snake precisa nascer descendo na grade alta, senão sai de lado e bate na parede');

// River: o rio e gerado por secao a partir de uma semente, e a morte volta pro
// comeco da secao regenerando tudo igual. Entao (1) a mesma semente tem que dar o
// mesmo rio; (2) toda fatia precisa deixar terra nas duas margens, canal nunca mais
// estreito que o minimo (com ilha, cada canal separado); (3) a secao abre e fecha
// reta, larga e centrada, senao o respawn nasce apontado pra margem; (4) a ponte
// fecha o rio no fim e nenhuma secao passa sem deposito de gasolina nem capsula.
// Testado nos dois formatos, porque as larguras saem de W.
const river = games.river;
const rioEm = (W, H) => new Function('Neon', 'canvas',
  river.slice(river.indexOf('  const { W, H } = Neon.world'), river.indexOf('  const els = {')) +
  '; return { gerarSecao, bateNaMargem, canalDe, W, MARGEM, MEIA_MIN, MEIA_RETA, CANAL_MIN, SECAO_FATIAS, RETA, FATIA };')(
  { world: () => ({ W, H, retrato: H > W }) }, {});
for (const [nome, rio] of [['deitado', rioEm(900, 600)], ['em pé', rioEm(600, 800)]]) {
  const { W, MARGEM, MEIA_MIN, MEIA_RETA, CANAL_MIN, SECAO_FATIAS, RETA, FATIA } = rio;
  assert.strictEqual(JSON.stringify(rio.gerarSecao(3, 777)), JSON.stringify(rio.gerarSecao(3, 777)),
    `River ${nome}: a mesma semente tem que gerar a mesma seção`);
  assert.notStrictEqual(JSON.stringify(rio.gerarSecao(3, 777)), JSON.stringify(rio.gerarSecao(3, 778)),
    `River ${nome}: sementes diferentes têm que dar rios diferentes`);
  for (let n = 0; n < 14; n++) {
    const s = rio.gerarSecao(n, 4242);
    assert.strictEqual(s.fatias.length, SECAO_FATIAS, `River ${nome}: seção ${n} com número errado de fatias`);
    s.fatias.forEach((f, i) => {
      assert.ok(f.esq >= MARGEM && f.dir <= W - MARGEM, `River ${nome}: seção ${n} fatia ${i} sem terra na margem (${f.esq}..${f.dir})`);
      assert.ok(f.dir - f.esq >= 2 * MEIA_MIN - 1, `River ${nome}: seção ${n} fatia ${i} rio mais estreito que o mínimo`);
      if (f.ilha) {
        assert.ok(f.ilha[0] - f.esq >= CANAL_MIN - 1 && f.dir - f.ilha[1] >= CANAL_MIN - 1,
          `River ${nome}: seção ${n} fatia ${i} com canal da ilha estreito demais`);
        assert.ok(f.ilha[1] > f.ilha[0], `River ${nome}: seção ${n} fatia ${i} com ilha invertida`);
      }
      if (i < RETA || i >= SECAO_FATIAS - RETA) {
        assert.ok(!f.ilha, `River ${nome}: seção ${n} fatia ${i} tem ilha na reta`);
        assert.ok(Math.abs(f.esq - (W / 2 - MEIA_RETA)) <= 1 && Math.abs(f.dir - (W / 2 + MEIA_RETA)) <= 1,
          `River ${nome}: seção ${n} fatia ${i} da reta não está larga e centrada (${f.esq}..${f.dir})`);
      }
    });
    // ilha continua: nao pode sumir no meio e voltar
    let trechos = 0;
    s.fatias.forEach((f, i) => { if (f.ilha && !(s.fatias[i - 1] && s.fatias[i - 1].ilha)) trechos++; });
    const comIlha = s.fatias.filter(f => f.ilha).length;
    assert.ok(trechos === 0 || comIlha / trechos >= 10, `River ${nome}: seção ${n} tem ilha picotada`);
    const ponte = s.specs.filter(e => e.tipo === 'ponte');
    assert.strictEqual(ponte.length, 1, `River ${nome}: seção ${n} precisa de exatamente uma ponte`);
    const fp = s.fatias[SECAO_FATIAS - 3];
    assert.ok(ponte[0].esq === fp.esq && ponte[0].dir === fp.dir && Math.floor(ponte[0].y / FATIA) === n * SECAO_FATIAS + SECAO_FATIAS - 3,
      `River ${nome}: seção ${n} com a ponte fora da fatia dela`);
    assert.ok(s.specs.some(e => e.tipo === 'gas'), `River ${nome}: seção ${n} sem depósito de gasolina`);
    assert.ok(s.specs.some(e => e.tipo === 'poder'), `River ${nome}: seção ${n} sem cápsula`);
    // tudo que nasce na agua nasce na agua; torre nasce na terra
    for (const e of s.specs) {
      const f = s.fatias[Math.floor(e.y / FATIA) - n * SECAO_FATIAS];
      if (e.tipo === 'torre') assert.ok(e.x < f.esq || e.x > f.dir, `River ${nome}: torre na água na seção ${n}`);
      else if (e.tipo !== 'jato' && e.tipo !== 'ponte') assert.ok(!rio.bateNaMargem(f, e.x, 1), `River ${nome}: ${e.tipo} em cima da terra na seção ${n}`);
    }
  }
}
// colisao com a margem e com a ilha, dos dois lados
const rioTeste = rioEm(900, 600);
const fIlha = { esq: 300, dir: 600, ilha: [430, 470] };
assert.ok(!rioTeste.bateNaMargem(fIlha, 360, 12), 'River: canal da esquerda é água');
assert.ok(!rioTeste.bateNaMargem(fIlha, 540, 12), 'River: canal da direita é água');
assert.ok(rioTeste.bateNaMargem(fIlha, 305, 12), 'River: encostar na margem esquerda bate');
assert.ok(rioTeste.bateNaMargem(fIlha, 595, 12), 'River: encostar na margem direita bate');
assert.ok(rioTeste.bateNaMargem(fIlha, 450, 12), 'River: ilha bate');
assert.ok(rioTeste.bateNaMargem(fIlha, 425, 12), 'River: raspar na ilha bate');
assert.deepStrictEqual(rioTeste.canalDe(fIlha, 360), [300, 430], 'River: barco à esquerda da ilha fica no canal esquerdo');
assert.deepStrictEqual(rioTeste.canalDe(fIlha, 540), [470, 600], 'River: barco à direita da ilha fica no canal direito');
assert.deepStrictEqual(rioTeste.canalDe({ esq: 300, dir: 600, ilha: null }, 450), [300, 600], 'River: sem ilha o canal é o rio inteiro');

// Orbit: cada salto precisa ter uma janela humana de acerto, nos dois formatos.
const orbit = games.orbit;
const orbital = new Function(orbit.slice(orbit.indexOf('  function expedition'), orbit.indexOf('  // ── fim da navegação')) +
  '; return { expedition, hazards, launchFrom, flightStep };')();
for (const height of [600, 800]) {
  const route = orbital.expedition(height), holes = orbital.hazards(route, height);
  assert.strictEqual(route.length, 13, 'Orbit: origem e 12 sinais');
  for (let i = 0; i < route.length - 1; i++) {
    const nearby = holes.filter(p => Math.abs(p.x - route[i].x) < 650);
    let longestWindow = 0, window = 0;
    for (let angle = -Math.PI; angle < Math.PI; angle += .025) {
      const ship = orbital.launchFrom(route[i], angle);
      let result;
      for (let step = 0; step < 600; step++) {
        result = orbital.flightStep(ship, route[i + 1], nearby, 1 / 120);
        assert.ok(Number.isFinite(ship.x) && Number.isFinite(ship.y), 'Orbit: física finita');
        if (result !== 'flying' || ship.y < 45 || ship.y > height - 50 || ship.x < route[i].x - 450) break;
      }
      window = result === 'arrived' ? window + .025 : 0;
      longestWindow = Math.max(longestWindow, window);
    }
    assert.ok(longestWindow / .95 >= .3, `Orbit ${height}: salto ${i + 1} precisa de pelo menos 300 ms para acertar`);
  }
}
{
  const target = { x: 1000, y: 500, r: 40 }, hole = { x: 200, y: 200, r: 23 };
  const ship = { x: 200, y: 200, vx: 0, vy: 0, age: 0 };
  assert.strictEqual(orbital.flightStep(ship, target, [hole], 1 / 120), 'lost', 'Orbit: singularidade consome a nave');
  Object.assign(ship, { x: 1000, y: 500, age: 0 });
  assert.strictEqual(orbital.flightStep(ship, target, [], 1 / 120), 'arrived', 'Orbit: campo do alvo captura a nave');
  Object.assign(ship, { x: 0, y: 0, vx: 0, vy: 0, age: 5 });
  assert.strictEqual(orbital.flightStep(ship, target, [], 1 / 120), 'lost', 'Orbit: deriva não pode durar para sempre');
}

// Echo: o código real do gerador, busca e colisão, sem depender do canvas.
const echo = games.echo;
const abyss = new Function('CELL', echo.slice(echo.indexOf('  function neighbors'), echo.indexOf('  // ── fim da estação')) +
  '; return { station, distances, pathTo, canStand, move, investigate };')(40);
for (const [cols, rows] of [[23, 11], [13, 11], [23, 7]]) {
  for (let seed = 1; seed <= 24; seed++) {
    const map = abyss.station(cols, rows, seed), d = abyss.distances(map, map.start);
    assert.deepStrictEqual(map, abyss.station(cols, rows, seed), 'Echo: mesma semente gera a mesma estação');
    assert.ok(map.cells.every((wall, id) => wall || d[id] >= 0), 'Echo: todo corredor é acessível');
    assert.strictEqual(new Set([map.start, map.exit, ...map.shards]).size, 5, 'Echo: origem, saída e memórias distintas');
    assert.ok(map.patrols.length >= 3, 'Echo: há posições para os três sentinelas');
    for (const id of [...map.shards, map.exit, ...map.patrols]) {
      assert.ok(d[id] > 0 && !map.cells[id], 'Echo: objetivo ou sentinela fora de parede');
      const route = abyss.pathTo(map, map.start, id);
      assert.strictEqual(route.at(-1), id, 'Echo: caminho chega ao destino');
      let previous = map.start;
      for (const step of route) {
        const distance = Math.abs(step % cols - previous % cols) + Math.abs(Math.floor(step / cols) - Math.floor(previous / cols));
        assert.strictEqual(distance, 1, 'Echo: sentinela não corta paredes em diagonal');
        previous = step;
      }
    }
    const player = { x: 60, y: 60 };
    for (let i = 0; i < 100; i++) abyss.move(map, player, -2, -2);
    assert.ok(player.x >= 48 && player.y >= 48, 'Echo: paredes externas contêm o jogador com seu raio');
    assert.ok(abyss.canStand(map, player.x, player.y, 8), 'Echo: colisão preserva uma posição válida');
    for (let x = 0; x < cols; x++) assert.ok(map.cells[x] && map.cells[(rows - 1) * cols + x], 'Echo: bordas fechadas');
  }
}
{
  const map = abyss.station(23, 11, 7), hunter = { x: 64, y: 60, route: [], alert: 0 };
  const sound = { x: 60, y: 60 };
  assert.ok(abyss.investigate(map, hunter, sound, 420), 'Echo: sentinela escuta som próximo');
  assert.strictEqual(hunter.route[0], map.start, 'Echo: primeiro centraliza para não cortar a quina');
  const originalRoute = [...hunter.route];
  sound.x = 800;
  assert.deepStrictEqual(hunter.route, originalRoute, 'Echo: segue a origem do som, não o jogador em tempo real');
  assert.ok(!abyss.investigate(map, hunter, sound, 100), 'Echo: som fora do alcance não alerta');
  assert.deepStrictEqual(hunter.route, originalRoute, 'Echo: som distante não substitui o destino');
}
for (const key of ['orbit', 'echo']) assert.match(games[key], new RegExp(`pb = Neon\\.best\\.update\\('${key}', score\\)`),
  `${key}: o recorde deve usar a mesma chave do menu`);

// Jungle: percorre a expedição real com saltos e cipós em três taxas de quadros.
const jungle = games.jungle;
const J = new Function('W', jungle.slice(jungle.indexOf('  const FLOOR'), jungle.indexOf('  // ── fim da física')) +
  '; return { expedition, step, ROOMS, vineAt, logAt, FLOOR, hurt };')(800);
assert.match(jungle, /pb = Neon\.best\.update\('jungle', run.score\)/, 'Jungle: recorde usa a chave do menu');
for (const fps of [30, 60, 120]) {
  const s = J.expedition();
  let grabs = 0;
  for (let i = 0; i < fps * 180 && s.status === 'playing'; i++) {
    const r = J.ROOMS[s.room], v = J.vineAt(s.t), input = { right: true };
    if (s.hanging) { input.right = false; input.jump = v.x > 555 && v.vx > 0; }
    else if (r.vine && s.x < 270) {
      if (s.grounded && s.x >= 218) { input.right = false; input.jump = v.x < 222 && v.vx > 0; }
      else if (!s.grounded) input.right = false;
    }
    if (s.grounded && !r.vine) input.jump = r.pits.some(([a]) => a - s.x > 0 && a - s.x < 25);
    if (s.grounded && [...r.logs.map(x => J.logAt(x, s.t)), ...r.snakes]
      .some(x => x - s.x > 0 && x - s.x < 70)) input.jump = true;
    J.step(s, 1 / fps, input);
    if (s.events.includes('grab')) grabs++;
    s.events.length = 0;
  }
  assert.strictEqual(s.status, 'won', `Jungle: todas as telas atravessáveis a ${fps} fps`);
  assert.strictEqual(s.lives, 3, 'Jungle: saltos permitem evitar todo dano');
  assert.strictEqual(grabs, J.ROOMS.filter(r => r.vine).length, 'Jungle: percurso usa cada cipó');
  assert.ok(s.collected.every(Boolean) && s.score > 6000, 'Jungle: tesouros e bônus entram no placar');
  const final = JSON.stringify(s);
  J.step(s, 1, { right: true, jump: true });
  assert.strictEqual(JSON.stringify(s), final, 'Jungle: vitória congela a partida e o bônus');
}
{
  const s = J.expedition();
  s.room = 1; s.x = 400;
  for (let i = 0; i < 60 && s.lives === 3; i++) J.step(s, 1 / 60, {});
  assert.strictEqual(s.lives, 2, 'Jungle: cair no poço custa uma vida');
  assert.strictEqual(s.x, s.safeX, 'Jungle: queda volta a uma margem segura');
  J.hurt(s);
  assert.strictEqual(s.lives, 2, 'Jungle: retorno protege contra dano repetido');
  s.invincible = 0; s.x = 722;
  J.step(s, 1 / 60, {}); J.step(s, 1 / 60, {});
  assert.strictEqual(s.score, 1000, 'Jungle: um tesouro só pontua uma vez');
  s.x = -1; J.step(s, 1 / 60, {});
  assert.strictEqual(s.room, 0, 'Jungle: pode voltar para buscar tesouros');
  assert.ok(s.collected[1], 'Jungle: voltar preserva a coleta');
  s.room = J.ROOMS.length - 1; s.x = 801; J.step(s, 1 / 60, {});
  assert.strictEqual(s.status, 'playing', 'Jungle: templo exige todos os tesouros');
  s.time = 0.001; J.step(s, 1 / 60, {});
  assert.strictEqual(s.status, 'lost', 'Jungle: relógio zerado termina a partida');
  assert.strictEqual(s.time, 0, 'Jungle: tempo não fica negativo');
  const fresh = J.expedition();
  for (let i = 0; i < 3; i++) { fresh.invincible = 0; J.hurt(fresh); }
  assert.strictEqual(fresh.status, 'lost', 'Jungle: terceira queda encerra a expedição');
  assert.ok(J.expedition().collected.every(v => !v), 'Jungle: reinício devolve os tesouros');
}

// Pulse: atravessa os dez setores com os comandos reais, em três taxas de quadros.
const pulse = games.pulse;
const P = new Function(pulse.slice(pulse.indexOf('  const FLOOR'), pulse.indexOf('  // ── fim da física')) +
  '; return { expedition, step, damage, respawn, level, FLOOR, SECTORS, DEATH_TIME };')();
assert.match(pulse, /pb = Neon\.best\.update\('pulse', run.score\)/, 'Pulse: recorde usa a chave do menu');
assert.strictEqual(P.SECTORS.length, 10, 'Pulse: a cidade tem dez setores');
// Piloto: corre, salta buraco e mira o pisão prevendo onde vai cair. Quando a
// conta diz que vai raspar a lateral, usa o segundo salto ou solta o direcional.
const PILOT_AIRTIME = 0.78, G = 1650;
const hostil = e => e.alive && !e.stun && e.kind !== 'flyer' && e.kind !== 'bomber';
function scrape(s, e) {
  if (s.vy <= 0) return e.x - s.x > 0 && e.x - s.x < 80 && s.y > e.y - 26;
  const queda = (e.y - 26) - s.y;
  if (queda < 0) return false;
  const t = (Math.sqrt(s.vy * s.vy + 2 * G * queda) - s.vy) / G;
  const dx = (e.x + e.dir * e.speed * t) - (s.x + s.vx * t);
  return dx > 27 && dx < 110;
}
function pilot(s) {
  const pit = s.map.pits.some(([a, b]) => a - s.x < 84 && b > s.x && s.x < a);
  const over = s.map.pits.some(([a, b]) => s.x > a - 12 && s.x < b + 12);
  const air = s.map.enemies.some(e => e.alive && !e.stun && (e.kind === 'flyer' || e.kind === 'bomber') &&
    e.x - s.x > -40 && e.x - s.x < 150 && e.y < s.y - 40);
  let foe = false;
  for (const e of s.map.enemies) {
    if (!hostil(e)) continue;
    const dx = e.x - s.x;
    if (dx < 24 || dx > 320 || Math.abs(e.y - s.y) > 70) continue;
    const speed = e.kind === 'charger' ? e.speed + e.rush * e.dash : e.speed;
    const reach = (262 + (e.dir < 0 ? speed : -speed)) * PILOT_AIRTIME - (e.kind === 'spiker' ? 70 : 0);
    if (dx <= reach) foe = true;
  }
  const spike = s.map.enemies.some(e => hostil(e) && e.kind === 'spiker' &&
    e.x - s.x > -30 && e.x - s.x < 80 && e.y > s.y);
  // Perto de buraco nada de frear: cair no vazio é pior que raspar.
  const gap = s.map.pits.some(([a, b]) => a - s.x < 260 && b > s.x - 40);
  const raspa = !s.grounded && !over && !gap && s.map.enemies.some(e => hostil(e) && Math.abs(e.x - s.x) < 220 && scrape(s, e));
  const shot = s.map.shots.some(b => !b.boom && b.x - s.x > -30 && b.x - s.x < 150 && Math.abs(b.y - s.y + 17) < 44);
  const need = pit || foe || shot;
  const blocked = !pit && air;
  const jump = s.grounded && need && !blocked ||
    !s.grounded && s.jumps < 2 && (s.vy > 0 && (over || shot || spike) || raspa);
  return { right: !(raspa && s.jumps >= 2) && !(s.grounded && need && blocked), jump, jumpHeld: true, pulse: !s.cooldown };
}
for (const fps of [30, 60, 120]) {
  for (let sector = 0; sector < P.SECTORS.length; sector++) {
    const s = P.expedition(sector);
    for (let i = 0; i < fps * 90 && (s.status === 'playing' || s.status === 'dying'); i++) {
      P.step(s, 1 / fps, pilot(s));
      s.events.length = 0;
    }
    assert.strictEqual(s.status, sector === P.SECTORS.length - 1 ? 'won' : 'cleared',
      `Pulse: setor ${sector + 1} atravessável a ${fps} fps`);
    const final = JSON.stringify(s);
    P.step(s, 1, { right: true, jump: true });
    assert.strictEqual(JSON.stringify(s), final, 'Pulse: conclusão congela a fase e seu bônus');
  }
  // Terreno sozinho: sem nenhum inimigo, a geometria da fase tem que fechar —
  // nenhum buraco maior que o salto, nenhuma borda sem saída.
  for (let sector = 0; sector < P.SECTORS.length; sector++) {
    const s = P.expedition(sector);
    s.map.enemies.length = 0;
    for (let i = 0; i < fps * 90 && (s.status === 'playing' || s.status === 'dying'); i++) {
      P.step(s, 1 / fps, pilot(s));
      s.events.length = 0;
    }
    assert.strictEqual(s.status, sector === P.SECTORS.length - 1 ? 'won' : 'cleared',
      `Pulse: terreno do setor ${sector + 1} vencível a ${fps} fps`);
  }
  // Caminho secreto: sair da plataforma de apoio e saltar entre as três do pulso.
  for (const sector of [0, 5]) {
    const s = P.expedition(sector);
    const ghosts = s.map.platforms.filter(p => p.kind === 'ghost').sort((a, b) => a.x - b.x);
    s.x = ghosts[0].x - 60; s.y = 276;
    const targets = [ghosts[0].x + 38, ghosts[1].x + 38, s.map.prism.x];
    let target = 0, landed = false;
    for (let i = 0; i < fps * 4 && !s.prisms; i++) {
      const goal = targets[target];
      P.step(s, 1 / fps, { right: s.x < goal - 7, left: s.x > goal + 7, jumpHeld: true, jump: s.grounded, pulse: i === 0 });
      if (s.grounded && Math.abs(s.x - goal) < 20) { target = Math.min(2, target + 1); landed = true; }
    }
    assert.ok(landed && s.prisms === 1 && s.pulse > 0, `Pulse: prisma do setor ${sector + 1} alcançável antes do pulso expirar a ${fps} fps`);
  }
}
{
  // Fases mais longas a cada setor, e nenhum salto obrigatório maior que o pulo.
  const first = P.level(0), last = P.level(9);
  assert.ok(last.len > first.len + 3000, 'Pulse: os setores crescem ao longo da cidade');
  for (let i = 0; i < P.SECTORS.length; i++) {
    const m = P.level(i);
    assert.ok(m.pits.every(([a, b]) => b - a <= 190), `Pulse: buracos do setor ${i + 1} cabem num salto`);
    assert.ok(m.enemies.every(e => m.pits.every(([a, b]) => e.a > b + 60 || e.b < a - 60)),
      `Pulse: ninguém patrulha sobre o vazio no setor ${i + 1}`);
    assert.ok(m.checkpoints.length >= 2 && m.checkpoints.every(c => m.pits.every(([a, b]) => c < a || c > b)),
      `Pulse: checkpoints do setor ${i + 1} ficam no chão`);
  }
  // A variedade cresce: o primeiro setor só tem robôs andando, o último tem tudo.
  assert.deepStrictEqual([...new Set(P.level(0).enemies.map(e => e.kind))], ['walker'], 'Pulse: o setor 1 apresenta um inimigo só');
  const tarde = new Set(P.level(9).enemies.map(e => e.kind));
  assert.ok(tarde.size >= 5, 'Pulse: os setores finais misturam vários inimigos');
}
{
  const s = P.expedition();
  const box = s.map.platforms.find(p => p.kind === 'box');
  s.x = box.x + 19; s.y = P.FLOOR;
  for (let i = 0; i < 40; i++) P.step(s, 1 / 60, { jump: i === 0, jumpHeld: true });
  assert.ok(box.used, 'Pulse: bater por baixo abre o bloco');
  const pontos = s.score;
  for (let i = 0; i < 60; i++) P.step(s, 1 / 60, { jump: i === 0, jumpHeld: true });
  assert.strictEqual(s.score, pontos, 'Pulse: bloco usado não duplica moeda');
  const e = s.map.enemies[0]; s.x = e.x; s.y = e.y - 28; s.vy = 160; s.grounded = false;
  P.step(s, 1 / 60, {});
  assert.ok(!e.alive && s.vy < 0 && s.lives === 3, 'Pulse: pisão derrota o inimigo e rebate');
  const near = s.map.enemies[1], far = s.map.enemies[s.map.enemies.length - 1];
  s.x = near.x; s.y = P.FLOOR;
  P.step(s, 1 / 60, { pulse: true });
  assert.ok(near.stun > 0 && !far.stun && s.lives === 3, 'Pulse: só atordoa inimigos no alcance e protege do contato');
  const cooldown = s.cooldown;
  P.step(s, 1 / 60, { pulse: true });
  assert.ok(s.cooldown < cooldown, 'Pulse: não reativa durante a recarga');
}
{
  // Espinhudo: pisar machuca, a não ser depois que o pulso o desliga.
  const s = P.expedition(9);
  const spiker = s.map.enemies.find(e => e.kind === 'spiker');
  assert.ok(spiker, 'Pulse: os setores finais têm inimigos espinhudos');
  s.x = spiker.x; s.y = spiker.y - 28; s.vy = 160; s.grounded = false; s.invincible = 0;
  P.step(s, 1 / 60, {});
  assert.ok(spiker.alive && s.status === 'dying' && s.lives === 2, 'Pulse: pisar no espinhudo custa um coração');
  for (let i = 0; i < 120; i++) P.step(s, 1 / 60, {});
  assert.strictEqual(s.status, 'playing', 'Pulse: a volta acontece sozinha depois do efeito');
  spiker.x = s.x + 200;
  s.invincible = 0;
  P.step(s, 1 / 60, { pulse: true });
  assert.ok(spiker.stun > 0, 'Pulse: o pulso desliga o espinhudo');
  s.x = spiker.x; s.y = spiker.y - 28; s.vy = 160; s.grounded = false;
  P.step(s, 1 / 60, {});
  assert.ok(!spiker.alive && s.lives === 2, 'Pulse: espinhudo atordoado pode ser pisado');
}
{
  // Torre atira, e o pulso aceso derrete o tiro antes de ele chegar.
  const s = P.expedition(9);
  const turret = s.map.enemies.find(e => e.kind === 'turret');
  assert.ok(turret, 'Pulse: a cidade tem torres que atiram');
  s.invincible = 0;
  // Fixa Lumi no alcance da torre a cada quadro: o teste é da mira, não do chão.
  for (let i = 0; i < 300 && !s.map.shots.length; i++) {
    s.x = turret.x - 300; s.y = P.FLOOR; s.vy = 0;
    P.step(s, 1 / 60, {});
  }
  assert.ok(s.map.shots.length, 'Pulse: a torre dispara quando Lumi se aproxima');
  const shot = s.map.shots[0];
  assert.ok(shot.vx < 0, 'Pulse: o tiro vai na direção de quem chegou');
  shot.x = s.x + 120;
  P.step(s, 1 / 60, { pulse: true });
  assert.strictEqual(s.map.shots.length, 0, 'Pulse: o pulso limpa os tiros em volta');
  s.pulse = 0; s.cooldown = 0;
  s.map.shots.push({ x: s.x + 20, y: s.y - 15, vx: -210, vy: 0, kind: 'laser', t: 5, boom: 0 });
  P.step(s, 1 / 60, {});
  assert.ok(s.status === 'dying' && s.lives === 2, 'Pulse: tomar um tiro custa um coração');
}
{
  // Bomba de drone: acerta na cabeça e, se errar, ainda estoura no chão.
  const s = P.expedition(9);
  s.invincible = 0;
  s.map.shots.push({ x: s.x + 5, y: P.FLOOR - 120, vx: 0, vy: 50, kind: 'bomb', t: 5, boom: 0 });
  let caiu = false;
  for (let i = 0; i < 120 && !caiu; i++) { P.step(s, 1 / 60, {}); caiu = s.events.includes('hurt'); s.events.length = 0; }
  assert.ok(caiu && s.lives === 2 && s.status === 'dying', 'Pulse: a bomba acerta quem está embaixo dela');
  for (let i = 0; i < 120 && s.status === 'dying'; i++) { P.step(s, 1 / 60, {}); s.events.length = 0; }
  s.invincible = 0;
  s.map.shots.push({ x: s.x + 40, y: P.FLOOR - 120, vx: 0, vy: 50, kind: 'bomb', t: 5, boom: 0 });
  let boom = false;
  for (let i = 0; i < 120 && !boom; i++) { P.step(s, 1 / 60, {}); boom = s.events.includes('boom'); s.events.length = 0; }
  assert.ok(boom && s.lives === 1, 'Pulse: o estouro no chão pega quem está perto');
}
{
  // Morte com efeito: o corpo é arremessado e só depois Lumi volta ao checkpoint.
  const s = P.expedition();
  s.x = s.map.checkpoints[0] + 40; s.y = P.FLOOR; s.vy = 0;
  P.step(s, 1 / 60, {});
  assert.strictEqual(s.checkpoint, s.map.checkpoints[0], 'Pulse: bandeira salva o retorno');
  const antes = s.x;
  s.y = 900; P.step(s, 1 / 60, {});
  assert.ok(s.status === 'dying' && s.lives === 2, 'Pulse: cair no vazio custa uma vida e começa o efeito');
  P.step(s, 1 / 60, {});
  assert.ok(Math.abs(s.x - antes) < 1 && s.status === 'dying', 'Pulse: o efeito roda antes de qualquer teletransporte');
  for (let i = 0; i < 120 && s.status === 'dying'; i++) P.step(s, 1 / 60, {});
  assert.ok(s.x === s.checkpoint && s.y === P.FLOOR && s.invincible > 0 && s.status === 'playing',
    'Pulse: terminado o efeito, Lumi reaparece no checkpoint protegido');
  assert.strictEqual(s.map.shots.length, 0, 'Pulse: a volta limpa os tiros em voo');
  P.damage(s); assert.strictEqual(s.lives, 2, 'Pulse: retorno tem invulnerabilidade');
  for (const _ of [0, 1]) {
    s.invincible = 0; P.damage(s);
    for (let i = 0; i < 120 && s.status === 'dying'; i++) P.step(s, 1 / 60, {});
  }
  assert.strictEqual(s.status, 'lost', 'Pulse: terceira morte encerra a partida');
  assert.strictEqual(P.expedition().score, 0, 'Pulse: reinício zera a partida');
  const next = P.expedition(1, { score: 900, prisms: 1, lives: 1 });
  assert.ok(next.score === 900 && next.prisms === 1 && next.lives === 2, 'Pulse: próximo setor preserva coleta e recupera um coração');
  for (const active of [false, true]) {
    const ghost = P.expedition();
    const first = ghost.map.platforms.filter(p => p.kind === 'ghost').sort((a, b) => a.x - b.x)[0];
    ghost.x = first.x + 30; ghost.y = first.y - 2; ghost.vy = 180; ghost.grounded = false; ghost.pulse = active ? 2 : 0;
    P.step(ghost, 1 / 60, {});
    assert.strictEqual(ghost.grounded, active, 'Pulse: plataforma secreta só sustenta com o poder ativo');
  }
  const jumps = P.expedition();
  P.step(jumps, 1 / 60, { jump: true, jumpHeld: true });
  P.step(jumps, 1 / 60, { jump: true, jumpHeld: true });
  const vy = jumps.vy;
  P.step(jumps, 1 / 60, { jump: true, jumpHeld: true });
  assert.ok(jumps.jumps === 2 && jumps.vy > vy, 'Pulse: não existe terceiro salto no ar');
}

// Recentes: usa as funções reais de registro e ordenação, inclusive sem storage.
{
  const values = new Map(), tileOrder = ['jungle', 'tetris', 'pong'].map(key => ({ dataset: { key } }));
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  let current = null, now = 100, ordered = [];
  const visit = new Function('$', 'localStorage', 'Date', `${block(core, '  function rememberVisit()')}; return rememberVisit;`)(
    () => current, storage, { now: () => now++ });
  const sort = new Function('tileOrder', 'tiles', 'localStorage', `${block(menu, '  function sortTiles()')}; return sortTiles;`)(
    tileOrder, { appendChild: tile => ordered.push(tile.dataset.key) }, storage);
  const order = () => { ordered = []; sort(); return ordered; };
  assert.deepStrictEqual(order(), ['jungle', 'tetris', 'pong'], 'Recentes: sem histórico mantém a ordem do catálogo');
  visit();
  assert.strictEqual(values.size, 0, 'Recentes: visitar o menu não registra um jogo');
  current = tileOrder[2]; visit();
  assert.deepStrictEqual(order(), ['pong', 'jungle', 'tetris'], 'Recentes: jogo aberto sobe ao topo');
  current = tileOrder[1]; visit();
  assert.deepStrictEqual(order(), ['tetris', 'pong', 'jungle'], 'Recentes: ordena pela última abertura, não pelo recorde');
  current = tileOrder[2]; visit();
  assert.deepStrictEqual(order(), ['pong', 'tetris', 'jungle'], 'Recentes: reabrir atualiza a posição');
  values.set('neon-last-played-jungle', 'inválido');
  assert.deepStrictEqual(order(), ['pong', 'tetris', 'jungle'], 'Recentes: histórico inválido não quebra o menu');
  storage.getItem = storage.setItem = () => { throw new Error('Storage indisponível'); };
  assert.doesNotThrow(visit, 'Recentes: armazenamento bloqueado não impede abrir o jogo');
  assert.deepStrictEqual(order(), ['jungle', 'tetris', 'pong'], 'Recentes: armazenamento bloqueado mantém o catálogo');
  assert.match(core, /addEventListener\('pageshow', rememberVisit\)/, 'Recentes: reabrir pelo histórico registra a visita');
  assert.match(menu, /addEventListener\('pageshow', sortTiles\)/, 'Recentes: voltar pelo histórico reordena o menu');
  assert.match(menu, /addEventListener\('storage', sortTiles\)/, 'Recentes: outra aba atualiza o menu');
}

// PWA: caminho errado no manifest ou no SHELL do sw.js so aparece offline, tarde demais.
// E o menu precisa pre-carregar os jogos no MESMO cache que o sw.js le.
const sw = read('sw.js');
const cacheName = sw.match(/const CACHE = '([^']+)'/)[1];
const shell = sw.match(/const SHELL = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
const icons = JSON.parse(read('manifest.webmanifest')).icons.map(i => i.src);
for (const file of [...shell, ...icons]) {
  if (file === '.') continue;
  assert.ok(fs.existsSync(path.join(__dirname, file.split('?')[0])), `PWA: arquivo referenciado não existe — ${file}`);
}
assert.ok(menu.includes(`caches.open('${cacheName}')`), `index.html deve pré-carregar no cache '${cacheName}'`);
assert.ok(menu.includes('manifest.webmanifest'), 'index.html deve linkar o manifest');

// sem theme-color a barra de status do PWA volta pro branco ao entrar num jogo
for (const [name, html] of Object.entries(games)) {
  assert.ok(html.includes('<meta name="theme-color" content="#080d1c">'),
    `${name}: falta a theme-color, o PWA fica branco fora do quadro`);
  assert.ok(html.includes('rel="manifest"'), `${name}: falta o link do manifest`);
}
assert.ok(JSON.parse(read('manifest.webmanifest')).theme_color === '#080d1c',
  'A theme_color do manifest tem que bater com a das páginas');

// o sw manda codigo do proprio site pela rede primeiro; o resto sai do cache
const ehCodigo = new Function('self', `${block(sw, 'function ehCodigo(req)')}; return ehCodigo;`)(
  { location: { origin: 'https://exemplo.com' } });
const req = (url, mode) => ({ url, mode: mode || 'no-cors' });
assert.ok(ehCodigo(req('https://exemplo.com/games/neon-siege.html', 'navigate')), 'Página do jogo vem da rede');
assert.ok(ehCodigo(req('https://exemplo.com/assets/js/neon-core.js')), 'O core vem da rede');
assert.ok(ehCodigo(req('https://exemplo.com/assets/css/neon-theme.css')), 'O tema vem da rede');
assert.ok(ehCodigo(req('https://exemplo.com/games/neon-pong.html')), 'O preload de jogos também revalida');
assert.ok(ehCodigo(req('https://exemplo.com/manifest.webmanifest')), 'O manifest acompanha o tema');
assert.ok(!ehCodigo(req('https://exemplo.com/assets/fonts/space-mono-400-latin.woff2')), 'Fonte sai do cache');
assert.ok(!ehCodigo(req('https://exemplo.com/assets/icon-192.png')), 'Ícone sai do cache');
assert.ok(!ehCodigo(req('https://fonts.googleapis.com/css2?family=X', 'navigate')), 'Cross-origin sai do cache');
// sem await o SW dorme antes de gravar e a versão nova nunca entra no cache
assert.match(sw, /await c\.put\(req, res\.clone\(\)\)/,
  'O sw precisa aguardar a gravação no cache');

assert.ok(+css.match(/toast-out[^;]*\s([\d.]+)s forwards/)[1] >= 3, 'O toast deve ficar visível por pelo menos 3s');
assert.match(css, /toast-in[^,]*forwards/, 'O toast deve permanecer visível após a entrada');


// Brawl: o gerador de andares roda em Node. Sem fase fixa, o que garante o
// "ate onde voce chega" e que cada andar venha mais cheio e mais duro que o anterior.
const brawl = games.brawl;
const bIni = brawl.indexOf('  // \u2500\u2500 gera\u00e7\u00e3o \u2500\u2500');
const bFim = brawl.indexOf('  // \u2500\u2500 fim da gera\u00e7\u00e3o \u2500\u2500');
assert.ok(bIni > 0 && bFim > bIni, 'brawl: marcadores do gerador nao encontrados');
const B = new Function('Neon', 'ZMAX', brawl.slice(bIni, bFim) + '; return { montarAndar, HEROIS, TIPOS, ARMAS };')(
  { rand: (a, b) => a + Math.random() * (b - a), choice: arr => arr[(Math.random() * arr.length) | 0] }, 215);
assert.strictEqual(Object.keys(B.HEROIS).length, 3, 'brawl: tres protagonistas');
for (const h of Object.values(B.HEROIS)) assert.ok(h.vida > 0 && h.vel > 0 && h.dano > 0 && h.especial, `brawl: lutador ${h.nome} incompleto`);
let capangasAntes = 0, vidaAntes = 0;
for (let n = 1; n <= 30; n++) {
  const a = B.montarAndar(n);
  const tipos = a.ondas.flatMap(o => o.inimigos);
  const capangas = tipos.filter(t => t !== 'chefe').length;
  assert.ok(capangas >= capangasAntes, `brawl: andar ${n} tem menos inimigos (${capangas}) que o anterior (${capangasAntes})`);
  assert.ok(a.vidaMult > vidaAntes, `brawl: resistencia nao cresce no andar ${n}`);
  capangasAntes = capangas; vidaAntes = a.vidaMult;
  for (const t of tipos) assert.ok(B.TIPOS[t], `brawl: tipo desconhecido ${t} no andar ${n}`);
  assert.strictEqual(tipos.includes('chefe'), n % 5 === 0, `brawl: chefe so a cada 5 andares (andar ${n})`);
  assert.ok(a.ondas.every(o => o.x > 100 && o.x < a.largura - 100), `brawl: gatilho de onda fora do andar ${n}`);
  assert.ok(a.quebraveis.every(q => q.x > 100 && q.x < a.largura - 100 && q.z >= 0 && q.z <= 215), `brawl: quebravel fora do chao no andar ${n}`);
}
assert.ok(B.montarAndar(1).ondas.flatMap(o => o.inimigos).every(t => t === 'capanga'), 'brawl: o primeiro andar so tem capanga');

// ── NEON SALTO ─────────────────────────────────────
// O bloco de fisica roda em Node com um piloto automatico. E o que garante que
// todo carro pousa limpo em toda rampa, que cada habilidade (largada, nitro,
// crista, nariz) vale metros de verdade e que os desbloqueios por recorde sao
// alcancaveis com o que o jogador tem na hora.
const salto = games.salto;
const sIni = salto.indexOf('  // \u2500\u2500 f\u00edsica \u2500\u2500');
const sFim = salto.indexOf('  // \u2500\u2500 fim da f\u00edsica \u2500\u2500');
assert.ok(sIni > 0 && sFim > sIni, 'salto: marcadores do bloco de fisica nao encontrados');
assert.ok(!/Math\.random/.test(salto.slice(sIni, sFim)), 'salto: a fisica tem que ser deterministica');
const SJ = new Function(salto.slice(sIni, sFim)
  + '; return { CARROS, RAMPAS, POUSO, CAPOTOU, novoSalto, passo, piloto, inclinacaoEm, chaoDepois };')();
const sSTEP = 1 / 120;
function saltar(ci, ri, controle) {
  const s = SJ.novoSalto(ci, ri), evs = [];
  for (let i = 0; i < 120 * 60 && s.fase !== 'fim'; i++) {
    SJ.passo(s, sSTEP, controle(s));
    evs.push(...s.ev.map(e => e.tipo));
    s.ev.length = 0;
  }
  assert.strictEqual(s.fase, 'fim', `salto: ${SJ.CARROS[ci].nome} em ${SJ.RAMPAS[ri].nome} nunca terminou`);
  return { s, evs };
}
const sVariante = (tira) => s => { const i = SJ.piloto(s); tira(s, i); return i; };
const semNitro = sVariante((s, i) => { if (s.fase === 'reta') i.segura = false; });
const semLargada = sVariante((s, i) => { if (s.fase === 'reta' && !s.largou) i.toque = false; });
const semCrista = sVariante((s, i) => { if (s.fase === 'rampa') i.toque = false; });
const narizBaixo = sVariante((s, i) => { if (s.fase === 'ar') i.segura = s.pitch < 0.05 + SJ.inclinacaoEm(SJ.RAMPAS[s.rampa]); });
const semNada = sVariante((s, i) => { if (s.fase === 'reta') { i.segura = false; if (!s.largou) i.toque = false; } if (s.fase === 'rampa') i.toque = false; });

assert.strictEqual(SJ.CARROS.length, 5, 'salto: cinco carros');
assert.strictEqual(SJ.RAMPAS.length, 8, 'salto: oito rampas');
const melhorCom = (carros, rampas, controle) => Math.max(...carros.flatMap(ci => rampas.map(ri => saltar(ci, ri, controle).s.distancia)));
for (const [ci, c] of SJ.CARROS.entries()) for (const [ri, r] of SJ.RAMPAS.entries()) {
  const rot = `salto: ${c.nome} em ${r.nome}`;
  const { s, evs } = saltar(ci, ri, SJ.piloto);
  assert.strictEqual(s.pouso, 'limpo', `${rot}: o piloto capotou (${s.pouso})`);
  assert.ok(!evs.includes('superaqueceu'), `${rot}: o piloto pulsando a 92% nao pode superaquecer`);
  assert.ok(evs.includes('largada') && evs.includes('crista'), `${rot}: o piloto tem que acertar largada e crista`);
  assert.ok(s.distancia > 100 && s.distancia < 260, `${rot}: salto fora de escala (${s.distancia} m)`);
  assert.ok(s.t < 25, `${rot}: um salto nao pode passar de 25 s (${s.t.toFixed(1)}s)`);
  // cada habilidade vale metros; sem nenhuma ainda da pra pousar limpo (crianca joga)
  const nada = saltar(ci, ri, semNada).s;
  assert.strictEqual(nada.pouso, 'limpo', `${rot}: so nivelar o nariz ja tem que pousar limpo`);
  assert.ok(saltar(ci, ri, semNitro).s.distancia < s.distancia - 20, `${rot}: o nitro tem que valer mais de 20 m`);
  assert.ok(saltar(ci, ri, semLargada).s.distancia < s.distancia - 4, `${rot}: a largada perfeita tem que valer mais de 4 m`);
  assert.ok(saltar(ci, ri, semCrista).s.distancia < s.distancia - 8, `${rot}: a crista no ponto tem que valer mais de 8 m`);
  // o Muro e "duro no ar" (sust baixa), entao planar vale menos nele por desenho
  assert.ok(saltar(ci, ri, narizBaixo).s.distancia < s.distancia - 5 * c.sust, `${rot}: planar de nariz alto tem que valer mais de ${5 * c.sust} m`);
  // segurar o nitro ate cortar e pior do que pulsar: e o que faz o medidor importar
  const afobado = saltar(ci, ri, sVariante((s, i) => { if (s.fase === 'reta') i.segura = s.corte <= 0; }));
  assert.ok(afobado.evs.includes('superaqueceu'), `${rot}: segurar o nitro direto tem que superaquecer`);
  assert.ok(afobado.s.distancia < s.distancia - 15, `${rot}: superaquecer tem que custar mais de 15 m`);
}
// nenhum carro e o melhor em toda rampa: cada um vence em alguma
const vencedores = new Set(SJ.RAMPAS.map((_, ri) => {
  const d = SJ.CARROS.map((_, ci) => saltar(ci, ri, SJ.piloto).s.distancia);
  return d.indexOf(Math.max(...d));
}));
assert.ok(vencedores.size >= 2, `salto: um carro so ganha em todas as rampas (${[...vencedores]})`);
// desbloqueios: o recorde que abre cada item tem que ser alcancavel so com o que ja esta aberto
const abertos = pbr => ({ carros: SJ.CARROS.map((c, i) => c.libera <= pbr ? i : -1).filter(i => i >= 0), rampas: SJ.RAMPAS.map((r, i) => r.libera <= pbr ? i : -1).filter(i => i >= 0) });
const metas = [...SJ.CARROS, ...SJ.RAMPAS].map(i => i.libera).filter(m => m > 0).sort((a, b) => a - b);
assert.ok(metas.length >= 3, 'salto: pelo menos tres desbloqueios');
for (const meta of metas) {
  const antes = abertos(meta - 1);
  const alcance = melhorCom(antes.carros, antes.rampas, SJ.piloto);
  assert.ok(alcance >= meta * 1.05, `salto: a meta de ${meta} m nao e alcancavel com o que esta aberto antes dela (piloto faz ${alcance.toFixed(1)} m)`);
  assert.ok(melhorCom(antes.carros, antes.rampas, semNada) < meta, `salto: a meta de ${meta} m sai sem usar nenhuma habilidade`);
}
assert.strictEqual(abertos(0).carros.length, 1, 'salto: comeca com um carro so');
assert.ok(abertos(0).rampas.length >= 3, 'salto: comeca com pelo menos tres rampas');
// capotar conta 70%: pousar de bico ainda e um salto, so vale menos
{
  const bico = saltar(0, 0, sVariante((s, i) => { if (s.fase === 'ar') i.segura = false; })).s;
  assert.strictEqual(bico.pouso, 'bico', 'salto: soltar o nariz o voo inteiro capota de bico');
  assert.strictEqual(bico.distancia, Math.round(bico.dist * SJ.CAPOTOU * 10) / 10, 'salto: capotar conta 70% da distancia');
  const traseira = saltar(0, 1, sVariante((s, i) => { if (s.fase === 'ar') i.segura = true; })).s;
  assert.strictEqual(traseira.pouso, 'traseira', 'salto: segurar o nariz o voo inteiro capota de traseira');
}
// queimar a largada trava o motor e custa o salto inteiro
{
  const queimou = saltar(0, 0, sVariante((s, i) => { if (s.fase === 'largada') i.toque = true; }));
  assert.ok(queimou.evs.includes('queimou') && !queimou.evs.includes('largada'), 'salto: tocar na contagem queima a largada');
  assert.ok(queimou.s.distancia < saltar(0, 0, SJ.piloto).s.distancia - 5, 'salto: queimar a largada tem que custar metros');
}
// o abismo e um vao de verdade: o chao depois da crista fica la embaixo
assert.ok(SJ.chaoDepois(SJ.RAMPAS[3], 10) < -20, 'salto: o abismo tem que ser fundo');
assert.ok(SJ.chaoDepois(SJ.RAMPAS[2], 50) < -5, 'salto: a prancha desce depois da crista');
assert.strictEqual(SJ.chaoDepois(SJ.RAMPAS[0], 50), 0, 'salto: a classica e plana');
// mesma entrada, mesmo salto
assert.strictEqual(saltar(2, 3, SJ.piloto).s.distancia, saltar(2, 3, SJ.piloto).s.distancia, 'salto: o resultado tem que ser deterministico');


// ── NEON PINBALL ───────────────────────────────────
// A mesa inteira roda em Node: o bloco de fisica sai do fonte, um piloto joga
// partidas completas e a bola e solta parada em cada ponto livre da mesa. Foi
// assim que apareceram o vao entre as pontas dos flippers que segurava a bola,
// o bolsao atras do banco de alvos e a saida estreita do inlane.
const pinball = games.pinball;
const pIni = pinball.indexOf('  // ── física ──');
const pFim = pinball.indexOf('  // ── fim da física ──');
assert.ok(pIni > 0 && pFim > pIni, 'pinball: marcadores do bloco de fisica nao encontrados');
assert.ok(!/Math\.random/.test(pinball.slice(pIni, pFim)), 'pinball: a fisica tem que ser deterministica');
const PB = new Function(pinball.slice(pIni, pFim)
  + '; return { K, MESA, ALVOS, CX, R, novoJogo, passo, piloto, pontaFlipper };')();
const pSTEP = 1 / 120;
const pNada = () => ({ L: false, R: false, carrega: false, nudge: null });
// roda ate `ate(s, eventos)` ou o tempo acabar; a bola nunca pode atravessar a mesa
function jogar(s, segundos, controle, ate) {
  const evs = [];
  for (let i = 0; i < segundos * 120; i++) {
    PB.passo(s, pSTEP, controle ? controle(s, i) : pNada());
    evs.push(...s.ev.map(e => e.tipo));
    s.ev.length = 0;
    const b = s.bola;
    if (s.fase === 'vivo') assert.ok(b.x > 10 && b.x < 440 && b.y > 0, `pinball: bola atravessou a mesa em (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);
    if (ate && ate(s, evs)) break;
  }
  return evs;
}
const pSolta = (x, y, vx = 0, vy = 0) => { const s = PB.novoJogo(); s.bola = { x, y, vx, vy }; s.fase = 'vivo'; return s; };
const embolo = f => s => ({ ...pNada(), carrega: s.fase === 'embolo' && s.forca < f });

// embolo cheio: a bola passa o portao, contorna o arco e desce pelo campo
{
  const s = PB.novoJogo(); let topo = 1e9;
  const evs = jogar(s, 4, embolo(1), st => { if (st.fase === 'vivo') topo = Math.min(topo, st.bola.y); return false; });
  assert.ok(evs.includes('lancou'), 'pinball: soltar o embolo carregado lanca a bola');
  assert.ok(topo < 40, `pinball: no embolo cheio a bola tem que chegar ao teto (chegou a y=${topo.toFixed(0)})`);
  assert.ok(!evs.includes('volta'), 'pinball: lancamento cheio nao pode voltar pra canaleta');
}
// embolo fraco: a bola volta e descansa no embolo de novo, sem gastar bola
{
  const s = PB.novoJogo();
  const evs = jogar(s, 6, embolo(0.15), (st, e) => e.includes('volta'));
  assert.ok(evs.includes('volta'), 'pinball: lancamento fraco volta pra canaleta');
  assert.strictEqual(s.fase, 'embolo', 'pinball: bola que volta espera no embolo');
  assert.strictEqual(s.bolaN, 1, 'pinball: voltar pra canaleta nao gasta bola');
}
// flipper: bola parada no meio do flipper esquerdo, um toque leva ela ate os bumpers
{
  const piv = PB.MESA.flippers.L.piv, tip = PB.pontaFlipper('L', PB.MESA.flippers.L.rest);
  const s = pSolta(piv.x + (tip.x - piv.x) * 0.5, piv.y + (tip.y - piv.y) * 0.5 - 22);
  let topo = 1e9;
  const evs = jogar(s, 3, (st, i) => ({ ...pNada(), L: i >= 12 && i < 40 }),
    st => { if (st.fase === 'vivo') topo = Math.min(topo, st.bola.y); return false; });
  assert.ok(evs.includes('bate'), 'pinball: o flipper batendo na bola avisa');
  assert.ok(topo < 380, `pinball: o tiro do flipper tem que alcancar os bumpers (subiu ate y=${topo.toFixed(0)})`);
}
// flipper parado nao segura a bola: ela escorrega pela ponta e drena
{
  const s = pSolta(PB.CX, 600);
  const evs = jogar(s, 6, null, (st, e) => e.includes('nova'));
  assert.ok(evs.includes('dreno'), 'pinball: bola solta no meio drena entre os flippers');
  assert.strictEqual(s.bolaN, 2, 'pinball: drenar passa pra bola 2');
  assert.strictEqual(s.fase, 'embolo', 'pinball: a bola nova espera no embolo');
}
// bola salva: drenar logo depois do lancamento devolve a bola; a segunda vez nao
{
  const s = PB.novoJogo();
  jogar(s, 2, embolo(1), st => st.fase === 'vivo');
  s.bola = { x: PB.CX, y: 780, vx: 0, vy: 300 };
  let evs = jogar(s, 2, null, (st, e) => e.includes('salva') || e.includes('dreno'));
  assert.ok(evs.includes('salva') && !evs.includes('dreno'), 'pinball: dentro da janela a bola e salva');
  assert.strictEqual(s.bolaN, 1, 'pinball: bola salva nao conta');
  jogar(s, 2, embolo(1), st => st.fase === 'vivo');
  s.bola = { x: PB.CX, y: 780, vx: 0, vy: 300 };
  evs = jogar(s, 2, null, (st, e) => e.includes('salva') || e.includes('dreno'));
  assert.ok(evs.includes('dreno') && !evs.includes('salva'), 'pinball: a bola salva arma uma vez so por bola');
}
// banco de alvos: derrubar os tres da o bonus e eles sobem de novo
{
  const s = PB.novoJogo(); s.fase = 'vivo';
  const evs = [];
  [-26, 0, 26].forEach(t => {
    const [x, y] = PB.ALVOS.p(t, 30);
    s.bola = { x, y, vx: -PB.ALVOS.n.x * 500, vy: -PB.ALVOS.n.y * 500 };
    evs.push(...jogar(s, 0.5, null, (st, e) => e.includes('alvo')));
  });
  assert.strictEqual(evs.filter(e => e === 'alvo').length, 3, 'pinball: cada alvo cai uma vez');
  assert.ok(evs.includes('banco'), 'pinball: os tres alvos derrubados fecham o banco');
  assert.ok(s.score >= 3 * 500 + 5000, `pinball: banco vale os alvos mais o bonus (deu ${s.score})`);
  assert.deepStrictEqual(s.alvos, [false, false, false], 'pinball: alvos derrubados ficam embaixo');
  jogar(s, 1.2, null);
  assert.deepStrictEqual(s.alvos, [true, true, true], 'pinball: o banco sobe de novo um segundo depois');
}
// faixas do topo: quatro letras acesas viram multiplicador; o flipper gira as letras
{
  const s = PB.novoJogo(); s.fase = 'vivo';
  const evs = [];
  for (const f of PB.MESA.faixas) {
    s.bola = { x: f.x, y: f.y - 30, vx: 0, vy: 200 };
    evs.push(...jogar(s, 0.4, null, (st, e) => e.includes('faixa')));
  }
  assert.strictEqual(evs.filter(e => e === 'faixa').length, 4, 'pinball: cada faixa acende uma letra');
  assert.ok(evs.includes('neon'), 'pinball: N-E-O-N completo avisa');
  assert.strictEqual(s.mult, 2, 'pinball: o multiplicador sobe pra 2');
  assert.deepStrictEqual(s.letras, [false, false, false, false], 'pinball: as letras apagam pra proxima volta');
  s.bola = { x: 220, y: 500, vx: 0, vy: 0 };
  s.letras = [true, false, false, false];
  PB.passo(s, pSTEP, { ...pNada(), R: true });
  assert.deepStrictEqual(s.letras, [false, true, false, false], 'pinball: flipper direito gira as letras pra direita');
  PB.passo(s, pSTEP, pNada());
  PB.passo(s, pSTEP, { ...pNada(), L: true });
  assert.deepStrictEqual(s.letras, [true, false, false, false], 'pinball: flipper esquerdo gira de volta');
}
// poco: captura, segura, ejeta e nao recaptura na hora
{
  const sc = PB.MESA.saucer;
  const s = pSolta(sc.x, sc.y);
  let evs = jogar(s, 0.1, null, (st, e) => e.includes('saucer'));
  assert.ok(evs.includes('saucer'), 'pinball: o poco captura a bola');
  assert.strictEqual(s.fase, 'saucer');
  assert.strictEqual(s.score, 2000, 'pinball: o poco vale 2000 no multiplicador 1');
  evs = jogar(s, 2, null, (st, e) => e.includes('ejeta'));
  assert.ok(evs.includes('ejeta'), 'pinball: o poco devolve a bola');
  jogar(s, 0.5, null);
  assert.ok(Math.hypot(s.bola.x - sc.x, s.bola.y - sc.y) > 60, 'pinball: a bola ejetada sai de perto do poco');
  assert.strictEqual(s.fase, 'vivo', 'pinball: o poco nao recaptura a bola que acabou de sair');
}
// portao de mao unica: a bola que desce pelo lado direito volta pro campo, nao pra canaleta
{
  const s = pSolta(418, 150);
  const evs = jogar(s, 8, null, (st, e) => e.includes('volta') || e.includes('nova'));
  assert.ok(!evs.includes('volta'), 'pinball: o portao devolve pro campo a bola que desce pela direita');
  assert.ok(evs.includes('dreno'), 'pinball: e ela segue pelo campo ate drenar');
}
// busca de bola: parada em equilibrio em cima de um separador, leva um toque e volta a rolar
{
  const s = pSolta(208, 100 - 4 - PB.R);
  const evs = jogar(s, 5, null, (st, e) => e.includes('busca'));
  assert.ok(evs.includes('busca'), 'pinball: bola parada em equilibrio recebe a busca');
  jogar(s, 1, null);
  assert.ok(s.bola.y > 110, 'pinball: depois da busca a bola cai do separador');
}
// piloto: uma partida inteira termina, pontua e e deterministica
{
  const s = PB.novoJogo();
  const evs = jogar(s, 600, PB.piloto, st => st.fase === 'fim');
  assert.strictEqual(s.fase, 'fim', 'pinball: o piloto tem que terminar a partida em 10 minutos');
  assert.strictEqual(evs.filter(e => e === 'dreno').length, 3, 'pinball: tres bolas, tres drenos');
  assert.ok(s.score > 1000, `pinball: o piloto tem que pontuar (fez ${s.score})`);
  assert.ok(evs.includes('bumper'), 'pinball: uma partida inteira passa pelos bumpers');
  const s2 = PB.novoJogo();
  jogar(s2, 600, PB.piloto, st => st.fase === 'fim');
  assert.strictEqual(s2.score, s.score, 'pinball: mesma entrada, mesma partida');
}
// varredura: bola solta parada em qualquer ponto livre acaba drenando ou no embolo
{
  const dentroTri = (x, y, [[ax, ay], [bx, by], [cx, cy]]) => {
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  // dentro dos slingshots e da cavidade fechada atras do banco a bola nao chega
  const solidos = [...PB.MESA.slings.map(sl => sl.pts), [[20, 378], PB.ALVOS.p(40, -12), PB.ALVOS.p(-40, -12)]];
  const presas = [];
  for (let y = 40; y < 760; y += 20) for (let x = 30; x < 425; x += 20) {
    if (solidos.some(t => dentroTri(x, y, t))) continue;
    const s = pSolta(x, y);
    jogar(s, 14, null, st => st.fase !== 'vivo' && st.fase !== 'saucer');
    if (s.fase === 'vivo') presas.push(`(${x},${y})→(${s.bola.x.toFixed(0)},${s.bola.y.toFixed(0)})`);
  }
  assert.deepStrictEqual(presas, [], `pinball: a bola fica presa quando solta em: ${presas.join(' ')}`);
}


// ── NEON PLANADOR ──────────────────────────────────
// O voo inteiro roda em Node: o bloco de fisica sai do fonte e um piloto voa
// sem obstaculos, com obstaculos e de todo jeito errado. Foi assim que o trim
// de angulo fixo apareceu dando loop no lancamento e oscilando ate o chao.
const planador = games.planador;
const gIni = planador.indexOf('  // ── física ──');
const gFim = planador.indexOf('  // ── fim da física ──');
assert.ok(gIni > 0 && gFim > gIni, 'planador: marcadores do bloco de fisica nao encontrados');
assert.ok(!/Math\.random/.test(planador.slice(gIni, gFim)), 'planador: a fisica so pode usar o gerador com semente');
const GL = new Function(planador.slice(gIni, gFim) + '; return { K, novoVoo, lancar, passo, piloto, gerar };')();
const gSTEP = 1 / 120;
const gNada = () => ({ pitch: 0, lado: 0 });
function voar(s, controle, segundos = 150, ate) {
  const evs = [];
  for (let i = 0; i < segundos * 120 && s.fase !== 'fim'; i++) {
    GL.passo(s, gSTEP, controle(s));
    evs.push(...s.ev.map(e => e.tipo));
    s.ev.length = 0;
    if (s.fase === 'voo') assert.ok(Math.abs(s.x) <= GL.K.LARG + 1e-9, `planador: o aviao saiu do corredor (x=${s.x.toFixed(1)})`);
    if (ate && ate(s)) break;
  }
  return evs;
}
const lancado = (forca, semente = 1, obst = false, lado = 0) => { const s = GL.novoVoo(semente, obst); GL.lancar(s, forca, lado); return s; };
// aviao ja no ar, reto e nivelado, pra testar um objeto especifico no caminho
const emVoo = (x, y, z, v, objs) => { const s = GL.novoVoo(1, false); s.fase = 'voo'; s.x = x; s.y = y; s.z = z; s.vz = v; s.vy = 0; s.th = 0; s.v = v; s.objs.push(...objs); return s; };

// cenario: mesma semente, mesmo cenario; nada na zona segura; tudo dentro do corredor e ao alcance
{
  const a = GL.novoVoo(7), b = GL.novoVoo(7), c = GL.novoVoo(8);
  GL.gerar(a, 3000); GL.gerar(b, 3000); GL.gerar(c, 3000);
  assert.deepStrictEqual(a.objs, b.objs, 'planador: a mesma semente tem que gerar o mesmo cenario');
  assert.notDeepStrictEqual(a.objs, c.objs, 'planador: sementes diferentes geram cenarios diferentes');
  assert.ok(a.objs.length > 60, `planador: 3000 m tem que ter cenario (${a.objs.length} objetos)`);
  assert.ok(a.objs.every(o => o.z >= GL.K.SEGURO), 'planador: nada nasce na zona segura do lancamento');
  assert.ok(a.objs.every(o => Math.abs(o.x === undefined ? o.x0 : o.x) <= 10), 'planador: objeto fora do corredor');
  assert.ok(a.objs.filter(o => o.tipo === 'torre').every(o => o.h < 45), 'planador: torre alta demais nao da pra passar');
  assert.ok(a.objs.filter(o => o.tipo === 'anel').every(o => o.y >= 4 && o.y <= 50), 'planador: anel fora do alcance');
  for (const t of ['torre', 'laje', 'anel', 'termica', 'drone', 'portal']) assert.ok(a.objs.some(o => o.tipo === t), `planador: falta ${t} no cenario`);
}
// voo livre: o piloto voa longe e mais que sem tocar; segurar estola e mergulhar crava
{
  const bot = lancado(1); voar(bot, GL.piloto);
  assert.strictEqual(bot.fimPor, 'pouso', 'planador: o piloto pousa suave');
  assert.ok(bot.dist > 450, `planador: o piloto tem que passar de 450 m (fez ${bot.dist.toFixed(0)})`);
  const solto = lancado(1); voar(solto, gNada);
  assert.ok(solto.dist > 200, `planador: sem tocar o aviao ainda plana (fez ${solto.dist.toFixed(0)})`);
  assert.ok(bot.dist > solto.dist * 1.3, `planador: ajudar tem que valer metros (piloto ${bot.dist.toFixed(0)} vs solto ${solto.dist.toFixed(0)})`);
  const meio = lancado(0.5); voar(meio, GL.piloto);
  assert.ok(meio.dist < bot.dist * 0.75, `planador: meia forca no estilingue voa bem menos (${meio.dist.toFixed(0)})`);
  const segura = lancado(1);
  const evS = voar(segura, () => ({ pitch: 1, lado: 0 }));
  assert.ok(evS.includes('estol'), 'planador: nariz alto o tempo todo estola');
  assert.ok(segura.dist < 120, `planador: quem estola cai perto (${segura.dist.toFixed(0)})`);
  const mergulha = lancado(1); voar(mergulha, () => ({ pitch: -1, lado: 0 }));
  assert.ok(mergulha.dist < 80 && mergulha.fimPor === 'chao', 'planador: mergulhar direto crava no chao');
  let minVz = 99;
  voar(lancado(1), GL.piloto, 150, st => { minVz = Math.min(minVz, st.vz); return false; });
  assert.ok(minVz > 0, 'planador: o aviao nunca pode dar loop e voar pra tras');
}
// desvio: inclinar leva pro lado, para na borda do corredor e custa planeio
{
  const s = lancado(1); let x3 = 0;
  voar(s, () => ({ pitch: 0, lado: 1 }), 150, st => { if (st.t >= 3 && !x3) x3 = st.x; return false; });
  assert.ok(x3 > 5, `planador: tres segundos inclinado tem que andar pro lado (x=${x3.toFixed(1)})`);
  assert.ok(Math.abs(s.x - GL.K.LARG) < 0.01 || s.fase === 'fim', 'planador: a borda do corredor segura o aviao');
  const reto = lancado(1); voar(reto, gNada);
  assert.ok(s.dist < reto.dist, 'planador: voar inclinado o tempo todo afunda mais que voar reto');
}
// torre no caminho: reto bate e a distancia congela na batida; desviando passa
{
  const torre = { tipo: 'torre', z: 30, x: 0, w: 6, h: 40 };
  const bate = emVoo(0, 10, 20, 20, [{ ...torre }]);
  const evs = voar(bate, gNada, 30);
  assert.ok(evs.includes('bateu'), 'planador: torre no caminho derruba o aviao');
  assert.strictEqual(bate.fimPor, 'torre', 'planador: o fim diz no que bateu');
  assert.strictEqual(bate.fase, 'fim', 'planador: depois da batida o aviao cai ate o chao e o voo acaba');
  assert.ok(bate.dist > 27 && bate.dist < 30, `planador: a distancia e a da batida, nao a da queda (${bate.dist.toFixed(1)})`);
  const desvia = emVoo(0, 10, 10, 20, [{ ...torre }]);
  const evD = voar(desvia, () => ({ pitch: 0, lado: 1 }), 30, st => st.z > 40);
  assert.ok(!evD.includes('bateu') && desvia.z > 40, 'planador: inclinando a tempo o aviao passa ao lado da torre');
}
// portal: pelo buraco ganha impulso, na parede bate
{
  const portal = { tipo: 'portal', z: 30, x: 0, y: 20, r: GL.K.PORTAL_R, passou: false };
  const passa = emVoo(0, 20, 25, 20, [{ ...portal }]);
  const evP = voar(passa, gNada, 5, st => st.z > 35);
  assert.ok(evP.includes('portal') && !evP.includes('bateu'), 'planador: pelo buraco do portal o aviao passa e ganha impulso');
  const bate = emVoo(7, 20, 25, 20, [{ ...portal }]);
  const evB = voar(bate, gNada, 5, st => st.z > 35 || st.fase !== 'voo');
  assert.ok(evB.includes('bateu') && bate.fimPor === 'portal', 'planador: fora do buraco a parede do portal derruba');
}
// anel: passar por dentro da um impulso
{
  const s = emVoo(0, 20, 25, 20, [{ tipo: 'anel', z: 30, x: 0, y: 20, r: GL.K.ANEL_R, pego: false }]);
  const evs = voar(s, gNada, 3, st => st.aneis > 0);
  assert.ok(evs.includes('anel'), 'planador: o anel conta quando o aviao passa por dentro');
  assert.ok(s.v > 20 + 4, `planador: o anel empurra o aviao (20 -> ${s.v.toFixed(1)} m/s)`);
}
// termica: a coluna de ar levanta o aviao
{
  const termica = { tipo: 'termica', z: 20, x: 0, r: GL.K.TERM_R, w: 50, forca: GL.K.TERMICA, entrou: false };
  const com = lancado(0.6), sem = lancado(0.6);
  com.objs.push(termica);
  const ate = st => st.z >= 70;
  const evs = voar(com, gNada, 30, ate); voar(sem, gNada, 30, ate);
  assert.ok(evs.includes('termica'), 'planador: entrar na termica avisa');
  assert.ok(com.y > sem.y + 3, `planador: a termica tem que levantar o aviao (${com.y.toFixed(1)} vs ${sem.y.toFixed(1)} m)`);
}
// pouso: deslizar no chao ainda conta metros
{
  const s = lancado(0.4); let toque = 0;
  const evs = voar(s, gNada, 30, st => { if (st.fase === 'desliza' && !toque) toque = st.z; return false; });
  assert.ok(evs.includes('pousou') && evs.includes('fim'), 'planador: o voo termina num pouso');
  assert.ok(s.dist > toque + 2, `planador: o deslize depois do pouso soma distancia (${toque.toFixed(1)} -> ${s.dist.toFixed(1)})`);
}
// com obstaculos: o piloto que desvia sobrevive, quem nao desvia bate; tudo deterministico
{
  let soma = 0;
  for (const sem of [1, 2, 3, 4, 5, 6]) {
    const a = lancado(1, sem, true), b = lancado(1, sem, true);
    voar(a, GL.piloto, 200); voar(b, GL.piloto, 200);
    assert.strictEqual(a.fase, 'fim', `planador: o voo com obstaculos termina (semente ${sem})`);
    assert.strictEqual(a.dist, b.dist, 'planador: mesma semente e mesmo piloto, mesmo voo');
    assert.ok(a.dist > 150, `planador: o piloto desviando tem que passar de 150 m (semente ${sem}: ${a.dist.toFixed(0)} por ${a.fimPor})`);
    soma += a.dist;
  }
  assert.ok(soma / 6 > 350, `planador: na media o piloto tem que passar de 350 m com obstaculos (${(soma / 6).toFixed(0)})`);
  const cego = [1, 2, 3, 4, 5, 6].map(sem => { const s = lancado(1, sem, true); voar(s, gNada, 200); return s.fimPor; });
  assert.ok(cego.some(f => f === 'torre' || f === 'laje' || f === 'portal' || f === 'drone'), `planador: sem desviar, alguma hora bate (${cego.join(', ')})`);
}

// ── NEON NÚCLEO ────────────────────────────────────
// A economia e recortada do fonte. Posto fora da area liberada fica atras do
// gelo e nunca da pra comprar; preco que cai quebra a curva de evolucao.
{
  const nucleo = games.nucleo;
  const ini = nucleo.indexOf('  // ── economia ──');
  const fim = nucleo.indexOf('  // ── fim da economia ──');
  assert.ok(ini > 0 && fim > ini, 'nucleo: marcadores da economia nao encontrados');
  const N = new Function(nucleo.slice(ini, fim)
    + '; return { MUNDO, NUCLEO_MAX, PADS, VEIOS, custo, raioLiberado, capMochila };')();
  const ids = new Set();
  for (const p of N.PADS) {
    assert.ok(!ids.has(p.id), `nucleo: id repetido ${p.id}`);
    ids.add(p.id);
    assert.ok(p.req >= 1 && p.req <= N.NUCLEO_MAX, `nucleo: ${p.id} pede um nucleo que nao existe`);
    // o quadrado inteiro (e o predio 74px acima) tem que caber dentro do raio liberado
    const longe = Math.max(Math.hypot(Math.abs(p.x) + 32, Math.abs(p.y) + 32), Math.hypot(p.x, p.y - 96));
    assert.ok(longe < N.raioLiberado(p.req), `nucleo: ${p.id} fica atras do gelo no nucleo ${p.req}`);
    assert.ok(Math.abs(p.x) + 32 < N.MUNDO / 2 && Math.abs(p.y) + 32 < N.MUNDO / 2, `nucleo: ${p.id} sai do mundo`);
    const ini = p.tipo === 'reator' ? 1 : 0;
    for (let nv = ini; nv < p.max - 1; nv++)
      assert.ok(N.custo(p, nv + 1) > N.custo(p, nv), `nucleo: ${p.id} fica mais barato no nivel ${nv + 1}`);
  }
  for (const v of N.VEIOS)
    assert.ok(Math.hypot(v.x, v.y) + 58 < N.raioLiberado(v.req), `nucleo: veio em ${v.x},${v.y} fica atras do gelo`);
  // quadrados nao se sobrepoem: parar num nao pode pagar outro
  for (const a of N.PADS) for (const b of N.PADS)
    if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 70 || Math.abs(a.y - b.y) >= 70, `nucleo: ${a.id} encosta em ${b.id}`);
  // a primeira compra sai com uma ou duas viagens de mochila inicial
  const primeiro = Math.min(...N.PADS.filter(p => p.req === 1 && p.tipo !== 'reator').map(p => N.custo(p, 0)));
  assert.ok(primeiro <= N.capMochila(0) * 3, `nucleo: a primeira compra custa ${primeiro}, demora demais`);
  assert.strictEqual(N.NUCLEO_MAX, N.PADS.find(p => p.id === 'reator').max, 'nucleo: o posto do nucleo vai ate o nivel maximo');
}

console.log(`${names.length} jogos OK: ${names.sort().join(', ')}`);

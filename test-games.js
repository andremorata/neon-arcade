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
const BEST = { flappy: 'passed', hoops: 'score', siege: 'score', darts: 'youScore', archer: 'youScore' };
for (const [key, variable] of Object.entries(BEST)) {
  assert.match(games[key], new RegExp(`pb\\s*=\\s*Neon\\.best\\.update\\('${key}', ${variable}\\)`),
    `O ${key} deve atualizar o recorde em memória`);
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

// dica de girar: so jogo deitado ganha area girando. Quadrado, 4:3 e em pe, nao.
const hintSrc = block(core, '  function addRotateHint()');
const makeHint = new Function('document', 'getComputedStyle', `${hintSrc}; return addRotateHint;`);
const hintFor = (arw, arh) => {
  const filhos = [];
  const stage = { querySelector: () => filhos[0] || null, appendChild: c => filhos.push(c) };
  const doc = { querySelector: () => stage, createElement: () => ({}) };
  makeHint(doc, () => ({ getPropertyValue: k => (k === '--arw' ? arw : arh) }))();
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
// rim, não o vão inteiro. A bola e as pontas têm tamanho fixo, então escalar o
// vão inteiro encolhe o corredor mais do que devia e o aro fica apertado.
const gapSrc = games.hoops.match(/const GAP_W = ([^;]+);/)[1];
const travessia = (W, speed) => {
  const R = 15, RIM_R = 6, KX = W / 900;
  const GAP_W = new Function('KX', 'R', 'RIM_R', `return ${gapSrc};`)(KX, R, RIM_R);
  return (GAP_W - 2 * (R + RIM_R)) / speed;
};
const tDeitado = travessia(900, 210), tEmPe = travessia(450, 105);
assert.ok(Math.abs(tDeitado - tEmPe) < 0.01,
  `Hoops: travessia de ${tDeitado.toFixed(3)}s deitado contra ${tEmPe.toFixed(3)}s em pé; o aro em pé fica apertado`);
assert.ok(Math.abs(travessia(900, 270) - travessia(450, 135)) < 0.01,
  'Hoops: na velocidade máxima a travessia também tem que bater nos dois formatos');

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
assert.match(travaMobile, /position: fixed/,
  'Em celular a página de jogo precisa ser fixa, senão a tela rola durante o jogo');

// PWA: caminho errado no manifest ou no SHELL do sw.js so aparece offline, tarde demais.
// E o menu precisa pre-carregar os jogos no MESMO cache que o sw.js le.
const sw = read('sw.js');
const cacheName = sw.match(/const CACHE = '([^']+)'/)[1];
const shell = sw.match(/const SHELL = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
const icons = JSON.parse(read('manifest.webmanifest')).icons.map(i => i.src);
for (const file of [...shell, ...icons]) {
  if (file === '.') continue;
  assert.ok(fs.existsSync(path.join(__dirname, file)), `PWA: arquivo referenciado não existe — ${file}`);
}
assert.ok(menu.includes(`caches.open('${cacheName}')`), `index.html deve pré-carregar no cache '${cacheName}'`);
assert.ok(menu.includes('manifest.webmanifest'), 'index.html deve linkar o manifest');

// sem theme-color a barra de status do PWA volta pro branco ao entrar num jogo
for (const [name, html] of Object.entries(games)) {
  assert.ok(html.includes('<meta name="theme-color" content="#04001a">'),
    `${name}: falta a theme-color, o PWA fica branco fora do quadro`);
  assert.ok(html.includes('rel="manifest"'), `${name}: falta o link do manifest`);
}
assert.ok(JSON.parse(read('manifest.webmanifest')).theme_color === '#04001a',
  'A theme_color do manifest tem que bater com a das páginas');

// o sw manda codigo do proprio site pela rede primeiro; o resto sai do cache
const ehCodigo = new Function('self', `${block(sw, 'function ehCodigo(req)')}; return ehCodigo;`)(
  { location: { origin: 'https://exemplo.com' } });
const req = (url, mode) => ({ url, mode: mode || 'no-cors' });
assert.ok(ehCodigo(req('https://exemplo.com/games/neon-siege.html', 'navigate')), 'Página do jogo vem da rede');
assert.ok(ehCodigo(req('https://exemplo.com/assets/js/neon-core.js')), 'O core vem da rede');
assert.ok(ehCodigo(req('https://exemplo.com/assets/css/neon-theme.css')), 'O tema vem da rede');
assert.ok(!ehCodigo(req('https://exemplo.com/assets/fonts/space-mono-400-latin.woff2')), 'Fonte sai do cache');
assert.ok(!ehCodigo(req('https://exemplo.com/assets/icon-192.png')), 'Ícone sai do cache');
assert.ok(!ehCodigo(req('https://fonts.googleapis.com/css2?family=X', 'navigate')), 'Cross-origin sai do cache');
// sem await o SW dorme antes de gravar e a versão nova nunca entra no cache
assert.match(sw, /await c\.put\(req, res\.clone\(\)\)/,
  'O sw precisa aguardar a gravação no cache');

assert.ok(+css.match(/toast-out[^;]*\s([\d.]+)s forwards/)[1] >= 3, 'O toast deve ficar visível por pelo menos 3s');
assert.match(css, /toast-in[^,]*forwards/, 'O toast deve permanecer visível após a entrada');

console.log(`${names.length} jogos OK: ${names.sort().join(', ')}`);

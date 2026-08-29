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
const BEST = { flappy: 'passed', hoops: 'score', siege: 'score', darts: 'youScore', archer: 'youScore', piano: 'score', bomber: 'score', enduro: 'score', racha: 'score', runner: 'score' };
// o slug grava dentro de fim(venceu), com bonus antes, entao fica fora do BEST
assert.match(games.slug, /pb = Neon\.best\.update\('slug', score\)/, 'O Slug precisa gravar o recorde');
// o breach grava dentro de fim(venceu), com bonus antes, entao fica fora do BEST
assert.match(games.breach, /pb = Neon\.best\.update\('breach', score\)/, 'O Breach precisa gravar o recorde');
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
// rim, não o vão inteiro. Duas coisas têm que bater nos dois formatos: o tempo
// de travessia e a folga medida em bolas. A segunda é o que quebrava quando a
// bola não escalava junto — em pé sobravam 7 unidades contra 44 deitado.
const gapSrc = games.hoops.match(/const GAP_W = ([^;]+);/)[1];
const raioSrc = games.hoops.match(/const R = ([^,]+), RIM_R = ([^;]+);/);
const aro = W => {
  const KX = W / 900;
  const ev = src => new Function('KX', `return ${src};`)(KX);
  const R = ev(raioSrc[1]), RIM_R = ev(raioSrc[2]);
  const GAP_W = new Function('KX', 'R', 'RIM_R', `return ${gapSrc};`)(KX, R, RIM_R);
  return { corredor: GAP_W - 2 * (R + RIM_R), R };
};
const travessia = (W, speed) => aro(W).corredor / speed;
const folga = W => aro(W).corredor / (2 * aro(W).R);   // corredor medido em bolas
assert.ok(Math.abs(folga(900) - folga(450)) < 0.01,
  `Hoops: folga de ${folga(900).toFixed(2)} bolas deitado contra ${folga(450).toFixed(2)} em pé; ` +
  'em pé o aro fica apertado porque a bola não escala junto com o mundo');
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
assert.strictEqual(pele(true, true, true, true).glow, '#00f0ff', 'Phantom manda na cor acima de tudo');
assert.strictEqual(pele(false, true, true, true).glow, '#ffb300', 'Turbo vem depois do phantom');
assert.strictEqual(pele(false, false, true, true).glow, '#ff8c1a', 'Frenzy vem depois do turbo');
assert.strictEqual(pele(false, false, false, true).glow, '#5b8cff', 'Slow é o último boost');
const padrao = pele(false, false, false, false);
assert.ok(padrao.a && padrao.b && padrao.glow, 'Sem boost nenhum a cobra ainda tem cor');
for (const [nome, p] of [['phantom', pele(true)], ['turbo', pele(0, 1)], ['padrão', padrao]]) {
  assert.notStrictEqual(p.a, p.b, `${nome}: as duas pontas do gradiente não podem ser iguais`);
}

// swipe encadeado: sem reancorar a origem, um gesto vira uma curva só
assert.match(games.snake, /swipe\.x = e\.clientX; swipe\.y = e\.clientY;/,
  'O swipe do Snake precisa reancorar a origem a cada curva');

// o glitch do logo lê o texto de um data-, preenchido pelo core em vez de 14 arquivos
assert.match(css, /content: attr\(data-glitch\)/, 'O tema precisa do ::after com attr(data-glitch)');
assert.match(core, /h1\.dataset\.glitch = h1\.textContent\.trim\(\)/,
  'O core precisa preencher data-glitch, senão o ::after fica vazio');

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

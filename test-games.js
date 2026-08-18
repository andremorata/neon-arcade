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

assert.ok(+css.match(/toast-out[^;]*\s([\d.]+)s forwards/)[1] >= 3, 'O toast deve ficar visível por pelo menos 3s');
assert.match(css, /toast-in[^,]*forwards/, 'O toast deve permanecer visível após a entrada');

console.log(`${names.length} jogos OK: ${names.sort().join(', ')}`);

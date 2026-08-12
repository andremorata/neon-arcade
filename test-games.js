'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const pong = read('games/neon-pong.html');
const flappy = read('games/neon-flappy.html');
const css = read('assets/css/neon-theme.css');

for (const html of [pong, flappy]) {
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(Boolean).at(-1);
  new Function(script);
}

const start = pong.indexOf('  function bounce(onPlayer)');
let depth = 0, end = -1;
for (let i = pong.indexOf('{', start); i < pong.length; i++) {
  if (pong[i] === '{') depth++;
  else if (pong[i] === '}' && !--depth) { end = i + 1; break; }
}
const bounce = pong.slice(start, end);
const makeHit = new Function('Neon', 'particles', 'els', `
  const PAD_H=110; let rally=0,maxRally=0,playerY=300,aiY=300;
  let ball={x:0,y:300,vx:1,vy:0}; ${bounce}
  return onPlayer => { ball.vx=onPlayer?-1:1; bounce(onPlayer); return {...ball}; };
`);
const hit = makeHit({ audio: { sfx: { paddle() {} } }, toast() {} }, { burst() {} }, { rally: {} });

assert.ok(hit(true).vx > 0, 'A bola deve sair da raquete do jogador para a direita');
assert.ok(hit(false).vx < 0, 'A bola deve sair da raquete da CPU para a esquerda');
assert.match(flappy, /pb\s*=\s*Neon\.best\.update\('flappy', passed\)/, 'O Flappy deve atualizar o recorde em memória');
assert.ok(+css.match(/toast-out[^;]*\s([\d.]+)s forwards/)[1] >= 3, 'O toast deve ficar visível por pelo menos 3s');
assert.match(css, /toast-in[^,]*forwards/, 'O toast deve permanecer visível após a entrada');
console.log('Flappy e Pong: OK');

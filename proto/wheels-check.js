'use strict';
// Recorta o bloco de física do proto/wheels.html e roda em Node. Trava o feel:
// carro parado assenta na mola, bot fecha a pista, loop tem limiar de velocidade,
// mesma entrada dá o mesmo resultado.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'wheels.html'), 'utf8');
const ini = html.indexOf('// ── física ──'), fim = html.indexOf('// ── fim da física ──');
assert.ok(ini > 0 && fim > ini, 'marcadores do bloco de física não encontrados');
const F = new Function(html.slice(ini, fim) + '; return { K, STEP, PISTAS, compilar, novoCarro, passo };')();

// bot: gás no chão; no ar nivela o chassi com os pedais
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const K = F.K;
function bot(car) {
  if (car.chao > 0) { car.gas = true; car.freio = false; return; }
  // Controle de rotação, não de ângulo: mira a velocidade de giro que leva o
  // chassi ao nível e aciona o pedal que falta. Mirar o ângulo direto oscilava,
  // e a oscilação piorava sempre que a gente subia o `tilt`.
  const alvo = Math.max(-K.tilt, Math.min(K.tilt, -wrap(car.a) * 5));
  car.gas = alvo < car.w - 0.4;
  car.freio = alvo > car.w + 0.4;
}
function roda(pista, car, segundos, controle) {
  const n = Math.round(segundos / F.STEP);
  for (let i = 0; i < n && !car.morto && car.x < pista.fim; i++) {
    controle(car);
    F.passo(car, pista, F.STEP);
  }
  return car;
}

// 1. parado: assenta na mola sem andar, com as duas rodas no chão
const pista = F.compilar(F.PISTAS[0].pecas);
assert.ok(pista.segs.length > 50 && pista.fim > 3000, 'pista compilada curta demais');
const parado = roda(pista, F.novoCarro(pista), 2, () => {});
assert.ok(Math.abs(parado.vx) < 1 && Math.abs(parado.vy) < 1, `carro parado não pode andar (vx=${parado.vx}, vy=${parado.vy})`);
assert.strictEqual(parado.chao, 2, 'carro parado tem as duas rodas no chão');
assert.ok(Math.abs(parado.a) < 0.02, `carro parado fica nivelado (a=${parado.a})`);
const sag = F.K.g / 2 / F.K.mola;
for (const r of parado.rodas) assert.ok(Math.abs(r.comp - sag) < 1, `mola assenta perto de ${sag.toFixed(1)}px (comp=${r.comp})`);

// 2. o bot fecha toda pista da lista sem morrer, e pega quase todas as moedas
const voltas = F.PISTAS.map(({ nome, pecas }) => {
  const p = F.compilar(pecas);
  const c = roda(p, F.novoCarro(p), 120, bot);
  assert.ok(!c.morto, `${nome}: bot morreu (${c.morto}) em x=${c.x.toFixed(0)} seg=${c.seg}`);
  assert.ok(c.x >= p.fim, `${nome}: bot não chegou (x=${c.x.toFixed(0)} de ${p.fim.toFixed(0)})`);
  assert.ok(p.fim > 4000, `${nome}: pista curta demais (${p.fim.toFixed(0)}px)`);
  assert.ok(c.moedas >= p.moedas.length * 0.5, `${nome}: bot pegou só ${c.moedas} de ${p.moedas.length} moedas`);
  return { nome, fim: p.fim, moedas: `${c.moedas}/${p.moedas.length}` };
});
const volta = roda(pista, F.novoCarro(pista), 120, bot);

// 3. determinismo: duas voltas iguais terminam no mesmo ponto
const a = roda(pista, F.novoCarro(pista), 12, bot), b = roda(pista, F.novoCarro(pista), 12, bot);
assert.strictEqual(a.x, b.x); assert.strictEqual(a.y, b.y); assert.strictEqual(a.a, b.a);

// 4. loop de raio 100: devagar volta pra trás, no meio cai de teto, rápido passa.
// Limiar teórico sqrt(5·g·R) ≈ 707 px/s mais as perdas; hoje fica entre 700 e 750.
const mini = F.compilar([['reta', 300], ['loop', 100], ['reta', 400], ['chegada']]);
const lancar = v => { const c = F.novoCarro(mini); c.x = 200; c.vx = v; return roda(mini, c, 6, () => {}); };
const lento = lancar(450), meio = lancar(650), rapido = lancar(950);
assert.ok(lento.x < 500, `a 450 px/s o carro não pode passar do loop (x=${lento.x.toFixed(0)})`);
assert.strictEqual(meio.morto, 'teto', `a 650 px/s o carro tem que cair de teto no loop (morto=${meio.morto}, x=${meio.x.toFixed(0)})`);
assert.ok(!rapido.morto && rapido.x > 500, `a 950 px/s o carro tem que fechar o loop (morto=${rapido.morto}, x=${rapido.x.toFixed(0)})`);

// 5. flip: no ar, gás segurado gira pra trás
const ar = F.novoCarro(pista); ar.y -= 400; ar.vy = -300;
roda(pista, ar, 0.6, c => { c.gas = true; });
assert.ok(ar.w < -3, `gás no ar tem que girar pra trás (w=${ar.w})`);

// 6. o flip conta na hora em que fecha a volta, não no pouso. Salto alto com o
// gás preso: o evento tem que sair enquanto o carro ainda está no ar.
const flip = F.novoCarro(pista); flip.y -= 500; flip.vy = -260; flip.vx = 300;
let noAr = null, aoPousar = 0;
for (let i = 0; i < 3 * 240 && !flip.morto; i++) {
  flip.gas = true;
  F.passo(flip, pista, F.STEP);
  for (const e of flip.ev) if (e.tipo === 'flip') { if (flip.chao === 0) noAr = e; else aoPousar++; }
  flip.ev.length = 0;
}
assert.ok(noAr, 'o flip tem que ser contado ainda no ar');
assert.strictEqual(noAr.sentido, 'back', 'gás preso no ar dá backflip');

// 7. loop não conta como flip: as duas rodas ficam na pista o tempo todo
const mloop = F.compilar([['reta', 300], ['loop', 100], ['reta', 400], ['chegada']]);
const lc = F.novoCarro(mloop); lc.x = 200; lc.vx = 950;
let flipsNoLoop = 0;
for (let i = 0; i < 4 * 240 && !lc.morto && lc.x < mloop.fim; i++) {
  F.passo(lc, mloop, F.STEP);
  for (const e of lc.ev) if (e.tipo === 'flip') flipsNoLoop++;
  lc.ev.length = 0;
}
assert.strictEqual(flipsNoLoop, 0, `passar no loop não é flip (contou ${flipsNoLoop})`);

// 8. booster: com o mesmo trecho, a esteira entrega mais velocidade que o motor
const semB = F.compilar([['reta', 900], ['chegada']]);
const comB = F.compilar([['reta', 300], ['booster', 300], ['reta', 300], ['chegada']]);
const vFinal = p => { const c = roda(p, F.novoCarro(p), 4, x => { x.gas = true; }); return Math.hypot(c.vx, c.vy); };
const [v0, v1] = [vFinal(semB), vFinal(comB)];
assert.ok(v1 > v0 + 100, `booster tem que acelerar (sem=${v0.toFixed(0)} com=${v1.toFixed(0)})`);

// 9. toda pista precisa de pelo menos um salto onde dá pra fechar um backflip:
// o giro leva 2π/tilt segundos e ainda sobra tempo pra nivelar antes do chão.
const precisa = 2 * Math.PI / F.K.tilt + 0.25;
const flipavel = [];
for (const { nome, pecas } of F.PISTAS) {
  const p = F.compilar(pecas);
  const c = F.novoCarro(p);
  let maior = 0;
  for (let i = 0; i < 120 * 240 && !c.morto && c.x < p.fim; i++) {
    bot(c);
    F.passo(c, p, F.STEP);
    for (const e of c.ev) if (e.tipo === 'pouso') maior = Math.max(maior, e.ar);
    c.ev.length = 0;
  }
  assert.ok(maior >= precisa, `${nome}: maior voo é ${maior.toFixed(2)}s, precisa de ${precisa.toFixed(2)}s pra um flip`);
  flipavel.push(`${nome} ${maior.toFixed(2)}s`);
}

console.log(`wheels OK: loop volta a 450, cai a 650 e passa a 950 px/s; flip conta no ar (precisa de ${precisa.toFixed(2)}s, maior voo: ${flipavel.join(', ')})`);
for (const v of voltas) console.log(`  ${v.nome}: ${v.fim.toFixed(0)}px, moedas ${v.moedas}`);

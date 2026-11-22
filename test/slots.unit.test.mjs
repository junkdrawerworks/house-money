// The slot machines' arithmetic: the reel engine, and what each machine pays back over the long run, checked against
// the figures each machine's help text quotes (its RETURN).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../shared/reels.js';
import * as cb from '../cherry-bell/js/machine.js';
import * as oe from '../odds-and-ends/js/machine.js';
import * as ml from '../motherlode/js/machine.js';

const pct = x => Math.round(x * 1000) / 10;

test('lines read left to right, with wilds standing in', () => {
  const pays = { a: { 3: 10, 4: 20, 5: 50 }, w: { 3: 100 } };
  assert.deepEqual(R.evalLine(['a', 'a', 'a', 'b', 'a'], pays, { wild: 'w' }), { sym: 'a', count: 3, pay: 10 });
  assert.deepEqual(R.evalLine(['w', 'a', 'w', 'a', 'b'], pays, { wild: 'w' }), { sym: 'a', count: 4, pay: 20 });
  assert.deepEqual(R.evalLine(['w', 'w', 'w', 'a', 'b'], pays, { wild: 'w' }), { sym: 'w', count: 3, pay: 100 });
  assert.equal(R.evalLine(['b', 'a', 'a', 'a', 'a'], pays, { wild: 'w' }).pay, 0);
  assert.equal(R.evalLine(['s', 'w', 'w'], { s: { 3: 5 } }, { wild: 'w', not: ['s'] }).pay, 0);
});

test('the window reads down from the stop', () => {
  const reels = [{ strip: ['a', 'b', 'c', 'd'] }];
  assert.deepEqual(R.window(reels, [0], 3, 1), [['d', 'a', 'b']]);
  assert.deepEqual(R.window(reels, [3], 3, 0), [['d', 'a', 'b']]);
});

test('scatter odds add up to one', () => {
  const d = R.scatterOdds(ml.REELS, ml.SCATTER);
  assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('strips keep lanterns and pennies apart', () => {
  for (const reel of ml.REELS) {
    const L = reel.strip.length;
    reel.strip.forEach((s, i) => { if (s === ml.SCATTER) for (let k = 1; k < 4; k++) assert.notEqual(reel.strip[(i + k) % L], s); });
  }
});

test('Cherry Bell pays back what its glass says (exact)', () => {
  const w = cb.REELS.map(R.weightsOf), T = w.map(a => a.reduce((x, y) => x + y));
  const L = cb.REELS.map(r => r.strip.length);
  let one = 0, three = 0, hit = 0;
  for (let a = 0; a < L[0]; a++) for (let b = 0; b < L[1]; b++) for (let c = 0; c < L[2]; c++) {
    const p = w[0][a] * w[1][b] * w[2][c] / (T[0] * T[1] * T[2]);
    const g = R.window(cb.REELS, [a, b, c], cb.ROWS, cb.ANCHOR);
    const r1 = cb.pay(g, 1);
    one += p * r1.coins; three += p * cb.pay(g, 3).coins / 3; if (r1.coins) hit += p;
  }
  console.log(`Cherry Bell: ${pct(one)}% on 1–2 coins, ${pct(three)}% on 3; pays on 1 pull in ${(1 / hit).toFixed(2)}`);
  assert.equal(pct(one), cb.RETURN.low);
  assert.equal(pct(three), cb.RETURN.max);
  assert.equal(pct(hit), cb.RETURN.hit);
  assert.ok(one > .92 && three < .97);
  // three sevens on three coins pay the jackpot
  const sevens = R.window(cb.REELS, [0, 0, 0], 3, 1);
  assert.equal(cb.pay(sevens, 3).coins, cb.JACKPOT);
  assert.equal(cb.pay(sevens, 1).coins, 200);
});

test('Odds & Ends pays back what its help says (exact)', () => {
  const L = oe.REELS.map(r => r.strip.length);
  let ev = 0, hit = 0, n = 0;
  for (let a = 0; a < L[0]; a++) for (let b = 0; b < L[1]; b++) for (let c = 0; c < L[2]; c++) {
    const g = R.window(oe.REELS, [a, b, c], oe.ROWS, oe.ANCHOR);
    const t = R.evalLines(g, oe.LINES, oe.PAYS, { wild: oe.WILD }).reduce((x, y) => x + y.pay, 0);
    n++; ev += t / oe.LINES.length; if (t) hit++;
  }
  const line = R.lineReturn(oe.REELS, oe.PAYS, { wild: oe.WILD }).ev;
  console.log(`Odds & Ends: ${pct(ev / n)}%; on five lines, 1 spin in ${(n / hit).toFixed(2)} wins`);
  assert.ok(Math.abs(line - ev / n) < 1e-9, 'every line pays back the same');
  assert.equal(pct(ev / n), oe.RETURN.rtp);
  assert.equal(pct(hit / n), oe.RETURN.hit);
  assert.ok(ev / n > .92 && ev / n < .97);
});

test('Motherlode pays back what its help says (lines and lanterns exact, free spins from a long seeded run)', () => {
  const lines = R.lineReturn(ml.REELS, ml.PAYS, { wild: ml.WILD, not: [ml.SCATTER] }).ev;
  const so = R.scatterOdds(ml.REELS, ml.SCATTER);
  const rng = R.seeded(2026);
  const N = 12000;
  let scatter = 0, feature = 0, trig = 0;
  so.forEach((p, n) => {
    scatter += p * (ml.SCATTER_PAYS[n] || 0);
    if (n >= 3) {
      trig += p;
      let t = 0;
      for (let i = 0; i < N; i++) t += ml.feature(ml.FREE_SPINS[n], rng);
      feature += p * t / N / ml.LINE_COUNT;
    }
  });
  let hit = 0;
  const H = 60000;
  for (let i = 0; i < H; i++) if (ml.play(R.pickStops(ml.REELS, rng)).units > 0) hit++;
  const rtp = lines + scatter + feature;
  console.log(`Motherlode: ${pct(rtp)}% (lines ${pct(lines)}, lanterns ${pct(scatter)}, free spins ${pct(feature)}); 1 spin in ${(H / hit).toFixed(2)} wins; free spins 1 in ${Math.round(1 / trig)}`);
  assert.ok(Math.abs(rtp * 100 - ml.RETURN.rtp) < 1.2, `return ${pct(rtp)} vs ${ml.RETURN.rtp}`);
  assert.ok(Math.abs(hit / H * 100 - ml.RETURN.hit) < 1);
  assert.equal(Math.round(1 / trig), ml.RETURN.feature);
  assert.ok(rtp > .92 && rtp < .97);
});

test('Motherlode: sticky pickaxes stay put and stand in', () => {
  const stops = [0, 0, 0, 0, 0];
  const held = [[1, 0], [2, 1], [3, 2]];
  const r = ml.play(stops, held);
  for (const [c, rr] of held) assert.equal(r.grid[c][rr], ml.WILD);
  for (const p of held) assert.ok(r.picks.some(q => q[0] === p[0] && q[1] === p[1]));
});

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

// Motherlode's free spins, exactly: a chain over which cells hold a sticky pickaxe. The pickaxes land only on reels 2
// to 5, so there are 2^12 ways for them to be stuck. A spin's expected pay depends only on which cells are stuck (each
// line is one cell from each reel, and the reels are independent; a stuck cell is wild and hides any lantern under
// it), and each reel adds its own pickaxes to what's stuck. So the free spins' worth is worked out spin by spin from
// the last one back. Returns worth[k]: line bets paid over k free spins starting with nothing stuck.
function freeSpinsWorth(maxSpins) {
  const { REELS, LINES, PAYS, SCATTER_PAYS, WILD, SCATTER, ROWS } = ml;
  const n = REELS.length;
  const wildReels = REELS.map((r, c) => (r.strip.includes(WILD) ? c : -1)).filter(c => c >= 0);
  assert.ok(!REELS[0].strip.includes(WILD) && !PAYS[WILD], 'the chain counts on lines starting on a plain symbol');
  const bit = (c, r) => { const k = wildReels.indexOf(c); return k < 0 ? -1 : k * ROWS + r; };
  const NS = 1 << (wildReels.length * ROWS);
  const odds = REELS.map(R.symbolOdds);
  const views = REELS.map(reel => {
    const L = reel.strip.length, w = R.weightsOf(reel), T = w.reduce((a, b) => a + b, 0);
    return reel.strip.map((_, i) => ({ p: w[i] / T, col: Array.from({ length: ROWS }, (_, r) => reel.strip[(i + r) % L]) }));
  });
  const first = Object.keys(odds[0]).filter(s => PAYS[s]);
  const pay = new Float64Array(NS);
  for (let S = 0; S < NS; S++) {
    const stuck = (c, r) => { const b = bit(c, r); return b >= 0 && (S >> b) & 1; };
    let ev = 0;
    for (const line of LINES) for (const s of first) {
      let run = odds[0][s];
      for (let c = 1; c <= n && run; c++) {
        const q = c < n ? (stuck(c, line[c]) ? 1 : (odds[c][s] || 0) + (odds[c][WILD] || 0)) : 0;
        ev += run * (1 - q) * (PAYS[s][c] || 0);
        run *= q;
      }
    }
    let dist = [1];
    for (let c = 0; c < n; c++) {
      const here = [];
      for (const { p, col } of views[c]) { const k = col.filter((s, r) => s === SCATTER && !stuck(c, r)).length; here[k] = (here[k] || 0) + p; }
      const next = [];
      dist.forEach((a, i) => here.forEach((b, j) => { if (b) next[i + j] = (next[i + j] || 0) + a * b; }));
      dist = next.map(x => x || 0);
    }
    dist.forEach((p, k) => { ev += p * (SCATTER_PAYS[k] || 0) * LINES.length; });
    pay[S] = ev;
  }
  const mask = (1 << ROWS) - 1;
  const moves = wildReels.map(c => Array.from({ length: 1 << ROWS }, (_, rs) => {
    const m = new Map();
    for (const { p, col } of views[c]) { let x = rs; col.forEach((s, r) => { if (s === WILD) x |= 1 << r; }); m.set(x, (m.get(x) || 0) + p); }
    return [...m];
  }));
  const worth = [0];
  let V = new Float64Array(NS);
  for (let k = 1; k <= maxSpins; k++) {
    const W = new Float64Array(NS);
    for (let S = 0; S < NS; S++) {
      let acc = [[0, 1]];
      wildReels.forEach((_, j) => {
        const rs = (S >> (j * ROWS)) & mask, next = [];
        for (const [b, p] of acc) for (const [x, q] of moves[j][rs]) next.push([b | (x << (j * ROWS)), p * q]);
        acc = next;
      });
      W[S] = pay[S] + acc.reduce((a, [S2, p]) => a + p * V[S2], 0);
    }
    V = W; worth[k] = V[0];
  }
  return worth;
}

test('Motherlode pays back what its help says (exact: lines, lanterns and free spins)', () => {
  const lines = R.lineReturn(ml.REELS, ml.PAYS, { wild: ml.WILD, not: [ml.SCATTER] }).ev;
  const so = R.scatterOdds(ml.REELS, ml.SCATTER);
  const worth = freeSpinsWorth(Math.max(...Object.values(ml.FREE_SPINS)));
  let scatter = 0, feature = 0, trig = 0;
  so.forEach((p, n) => {
    scatter += p * (ml.SCATTER_PAYS[n] || 0);
    if (ml.FREE_SPINS[n]) { trig += p; feature += p * worth[ml.FREE_SPINS[n]] / ml.LINE_COUNT; }
  });
  const rtp = lines + scatter + feature;
  console.log(`Motherlode: ${(rtp * 100).toFixed(3)}% (lines ${pct(lines)}, lanterns ${pct(scatter)}, free spins ${pct(feature)}); free spins 1 in ${(1 / trig).toFixed(1)}, worth ${(feature / trig).toFixed(1)} times the bet on average`);
  assert.equal(pct(rtp), ml.RETURN.rtp);
  assert.equal(Math.round(1 / trig), ml.RETURN.feature);
  assert.ok(feature / trig >= 25, 'the free spins are worth 25 times the bet or more on average');
  assert.ok(rtp > .92 && rtp < .97);

  // the chain against the machine's own free spins, played out: a long seeded run of each comes to what the chain
  // says, within four standard errors
  const rng = R.seeded(2026), N = 40000;
  for (const n of Object.keys(ml.FREE_SPINS).map(Number)) {
    const k = ml.FREE_SPINS[n];
    let t = 0, t2 = 0;
    for (let i = 0; i < N; i++) { const u = ml.feature(k, rng); t += u; t2 += u * u; }
    const mean = t / N, se = Math.sqrt((t2 / N - mean * mean) / N);
    console.log(`Motherlode, ${k} free spins: ${(mean / ml.LINE_COUNT).toFixed(2)} times the bet played out (±${(se / ml.LINE_COUNT).toFixed(2)}), ${(worth[k] / ml.LINE_COUNT).toFixed(2)} worked out`);
    assert.ok(Math.abs(mean - worth[k]) < 4 * se, `${k} free spins: played out ${mean / ml.LINE_COUNT} vs ${worth[k] / ml.LINE_COUNT}`);
  }
});

test('Motherlode wins about as often as its help says (a long seeded run)', () => {
  const rng = R.seeded(2026);
  let hit = 0;
  const H = 60000;
  for (let i = 0; i < H; i++) if (ml.play(R.pickStops(ml.REELS, rng)).units > 0) hit++;
  console.log(`Motherlode: 1 spin in ${(H / hit).toFixed(2)} wins`);
  assert.ok(Math.abs(hit / H * 100 - ml.RETURN.hit) < 1);
});

test('Motherlode: sticky pickaxes stay put and stand in', () => {
  const stops = [0, 0, 0, 0, 0];
  const held = [[1, 0], [2, 1], [3, 2]];
  const r = ml.play(stops, held);
  for (const [c, rr] of held) assert.equal(r.grid[c][rr], ml.WILD);
  for (const p of held) assert.ok(r.picks.some(q => q[0] === p[0] && q[1] === p[1]));
});

test('Cherry Bell names a win in the right number: two cherries pay, a cherry pays', () => {
  assert.deepEqual(cb.TABLE.map((t, i) => `${t.name} ${cb.pays(i)}`).slice(-3), ['Three cherries pay', 'Two cherries pay', 'A cherry pays']);
  assert.ok(cb.TABLE.every((t, i) => (cb.pays(i) === 'pays') === (t.name === 'A cherry')));
});

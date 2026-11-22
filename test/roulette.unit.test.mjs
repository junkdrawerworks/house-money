import test from 'node:test';
import assert from 'node:assert/strict';
import * as w from '../roulette/js/wheel.js';

test('the wheel: 37 pockets in single-zero order, 18 red and 18 black, alternating', () => {
  assert.equal(w.ORDER.length, 37);
  assert.deepEqual([...w.ORDER].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(w.REDS.size, 18);
  assert.equal(w.color(0), 'green');
  assert.equal(w.color(32), 'red');
  assert.equal(w.color(26), 'black');
  for (let i = 1; i < 36; i++) assert.notEqual(w.color(w.ORDER[i]), w.color(w.ORDER[i + 1]), `pockets ${i} and ${i + 1}`);
  // red and black on the layout: 1 red, 2 black, 10 black, 11 black, 19 red, 28 black
  assert.deepEqual([1, 2, 10, 11, 19, 28].map(w.color), ['red', 'black', 'black', 'black', 'red', 'black']);
});

test('payouts', () => {
  const cases = { n17: 35, n0: 35, 's17-20': 17, 's17-18': 17, 's0-2': 17, 't0-1-2': 11, st4: 11, c17: 8, b: 8, l4: 5,
    d2: 2, col3: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
  for (const [k, p] of Object.entries(cases)) assert.equal(w.payout(k), p, k);
});

test('what each bet covers', () => {
  assert.deepEqual(w.numbers('c17'), [17, 18, 20, 21]);
  assert.deepEqual(w.numbers('st34'), [34, 35, 36]);
  assert.deepEqual(w.numbers('l31'), [31, 32, 33, 34, 35, 36]);
  assert.deepEqual(w.numbers('col1').slice(0, 3), [1, 4, 7]);
  assert.equal(w.numbers('col2').length, 12);
  assert.equal(w.numbers('red').includes(0), false);
  // not bets: 3–4 aren't next to each other on the layout, a corner can't start in the third column, no row past 36
  for (const k of ['s3-4', 's18-19', 'c3', 'c33', 'st2', 'l34', 'n37', 's0-4', 'x', 's5-5', 'c0']) assert.equal(w.valid(k), false, k);
  assert.equal(w.label('s17-20'), 'split 17–20');
  assert.equal(w.label('c17'), 'corner 17–21');
});

// Every bet on the layout: 37 straights, 60 splits, 2 trios, 12 streets, 22 corners, the first four, 11 lines, 12 outside.
function allBets() {
  const keys = new Set();
  for (let n = 0; n <= 36; n++) for (const k of w.betsOn(n)) keys.add(k);
  for (const k of ['d1', 'd2', 'd3', 'col1', 'col2', 'col3', 'red', 'black', 'odd', 'even', 'low', 'high']) keys.add(k);
  return [...keys];
}

test('every bet on the layout can be reached from the numbers it covers', () => {
  const keys = allBets();
  const count = p => keys.filter(k => k.startsWith(p)).length;
  assert.equal(count('n'), 37);
  assert.equal(keys.filter(k => /^s/.test(k) && !/^st/.test(k)).length, 60);
  assert.equal(count('t'), 2);
  assert.equal(count('st'), 12);
  assert.equal(count('c') - count('col'), 22);
  assert.equal(keys.filter(k => /^l\d/.test(k)).length, 11);
  assert.ok(keys.includes('b'));
  for (const k of keys) {
    assert.ok(w.valid(k), k);
    for (const n of w.numbers(k)) if (!['d', 'col', 'red', 'black', 'odd', 'even', 'low', 'high'].some(p => k.startsWith(p))) assert.ok(w.betsOn(n).includes(k), `${k} from ${n}`);
  }
});

test('the house keeps 1 in 37 on every bet', () => {
  for (const k of allBets()) {
    let back = 0;
    for (let n = 0; n <= 36; n++) back += w.settle({ [k]: 1 }, n).back;
    assert.ok(Math.abs(back / 37 - 36 / 37) < 1e-12, `${k}: ${back / 37}`);
  }
});

test('settling a spread of bets', () => {
  const bets = { n17: 5, 's17-20': 10, red: 25, d1: 10, c13: 4 };
  const r = w.settle(bets, 17);
  // 17 is black: n17 pays 175 + 5, split 170 + 10, d2 isn't on, red loses, d1 loses, c13 (13,14,16,17) pays 32 + 4
  assert.equal(r.wagered, 54);
  assert.equal(r.back, 180 + 180 + 36);
  assert.equal(r.wins.length, 3);
  assert.equal(w.settle(bets, 0).back, 0);
});

test('draw lands on every pocket, about equally', () => {
  const seen = new Array(37).fill(0);
  for (let i = 0; i < 37000; i++) seen[w.draw()]++;
  assert.ok(seen.every(c => c > 800 && c < 1200), seen.join(','));
});

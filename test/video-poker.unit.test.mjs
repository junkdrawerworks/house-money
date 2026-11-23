import test from 'node:test';
import assert from 'node:assert/strict';
import * as vp from '../video-poker/js/poker.js';
import { returns } from './vp-return.mjs';

// '10h Jh Qh Kh Ah' → cards
const R = { A: 1, J: 11, Q: 12, K: 13 };
const H = str => str.split(' ').map(t => ({ r: R[t.slice(0, -1)] || Number(t.slice(0, -1)), s: t.slice(-1) }));
const id = (str, g) => vp.evaluate(H(str), g)?.id || null;
const held = (str, g) => vp.advise(H(str), g).held.map((h, i) => (h ? i : -1)).filter(i => i >= 0).join('');

test('every hand rank', () => {
  assert.equal(id('10h Jh Qh Kh Ah'), 'royal');
  assert.equal(id('Ah Kh Qh Jh 10h'), 'royal');
  assert.equal(id('9s 10s Js Qs Ks'), 'straight-flush');
  assert.equal(id('As 2s 3s 4s 5s'), 'straight-flush', 'the wheel, suited');
  assert.equal(id('7c 7d 7h 7s 2d'), 'four');
  assert.equal(id('3c 3d 3h 9s 9d'), 'full-house');
  assert.equal(id('2d 9d Jd 4d Kd'), 'flush');
  assert.equal(id('5c 6d 7h 8s 9d'), 'straight');
  assert.equal(id('Ac 2d 3h 4s 5d'), 'straight', 'ace low');
  assert.equal(id('10c Jd Qh Ks Ad'), 'straight', 'ace high');
  assert.equal(id('Qc Kd Ah 2s 3d'), null, 'no wrapping round');
  assert.equal(id('8c 8d 8h Ks 2d'), 'three');
  assert.equal(id('4c 4d Kh Ks 2d'), 'two-pair');
  assert.equal(id('Jc Jd 5h 8s 2d'), 'jacks');
  assert.equal(id('Ac Ad 5h 8s 2d'), 'jacks');
  assert.equal(id('10c 10d 5h 8s 2d'), null, 'tens are too low');
  assert.equal(id('Ac Kd 5h 8s 2d'), null);
});

test('the nine-six pay table', () => {
  assert.equal(vp.payFor('royal', 1), 250);
  assert.equal(vp.payFor('royal', 4), 1000);
  assert.equal(vp.payFor('royal', 5), 4000);
  assert.equal(vp.payFor('full-house', 1), 9);
  assert.equal(vp.payFor('flush', 1), 6);
  assert.equal(vp.payFor('flush', 5), 30);
  assert.equal(vp.payFor('straight-flush', 5), 250);
  assert.equal(vp.payFor('jacks', 3), 3);
  assert.equal(vp.payFor('two-pair', 2), 4);
});

test('deal and draw, paid by coin size', () => {
  const s = vp.fresh();
  s.coins = 5; s.coin = 25;
  vp.deal(s, () => 0);
  assert.equal(s.hand.length, 5); assert.equal(s.deck.length, 47);
  const kept = s.hand.slice();
  s.held = [true, true, false, false, false];
  const next = s.deck.slice(0, 3);
  vp.draw(s);
  assert.deepEqual(s.hand.slice(0, 2), kept.slice(0, 2));
  assert.deepEqual(s.hand.slice(2), next);
  assert.equal(s.phase, 'done');
  if (s.result) assert.equal(s.result.pay, vp.payFor(s.result.id, 5) * 25);
});

test('the strategy card', () => {
  assert.equal(held('10h Jh Qh Kh 2c'), '0123', 'four to a royal');
  assert.equal(held('10h Jh Qh Kh 9h'), '01234', 'a made straight flush');
  assert.equal(held('10h Jh Qh Kh 3h'), '0123', 'four to a royal over a flush');
  assert.equal(held('Jc Jd 5h 8s 2d'), '01', 'high pair');
  assert.equal(held('Jh Qh Kh 2c 2d'), '012', 'three to a royal over a low pair');
  assert.equal(held('4c 4d 9h 10h Jh'), '01', 'low pair over three to a straight flush');
  assert.equal(held('2h 7h 9h Kh 3s'), '0123', 'four to a flush');
  assert.equal(held('5c 6d 7h 8s Kd'), '0123', 'open straight');
  assert.equal(held('Jh Qh 3c 7d 9s'), '01', 'two suited high cards');
  assert.equal(held('Ac Kd Qh 3s 7c'), '12', 'two lowest high cards');
  assert.equal(held('Ac 2d 5h 8s 9c'), '0', 'one high card');
  assert.equal(held('2c 4d 6h 8s 9d'), '', 'draw five');
  assert.equal(held('7c 7d 7h Ks 2d'), '012', 'three of a kind');
  assert.equal(held('4c 4d Kh Ks 2d'), '0123', 'two pair');
});

test('Bonus Poker: four of a kind split by rank, on the 8/5 pay table', () => {
  assert.equal(id('Ac Ad Ah As 2d', 'bonus'), 'four-aces');
  assert.equal(id('2c 2d 2h 2s Kd', 'bonus'), 'four-low');
  assert.equal(id('4c 4d 4h 4s Kd', 'bonus'), 'four-low');
  assert.equal(id('5c 5d 5h 5s Kd', 'bonus'), 'four');
  assert.equal(id('Kc Kd Kh Ks Ad', 'bonus'), 'four');
  assert.equal(id('10h Jh Qh Kh Ah', 'bonus'), 'royal');
  assert.equal(id('Jc Jd 5h 8s 2d', 'bonus'), 'jacks');
  assert.equal(id('3c 3d 3h 9s 9d', 'bonus'), 'full-house');
  assert.deepEqual(['royal', 'four-aces', 'straight-flush', 'four-low', 'four', 'full-house', 'flush', 'straight', 'three', 'two-pair', 'jacks']
    .map(h => vp.payFor(h, 1, 'bonus')), [250, 80, 50, 40, 25, 8, 5, 4, 3, 2, 1]);
  assert.equal(vp.payFor('royal', 5, 'bonus'), 4000);
  assert.equal(vp.payFor('four-aces', 5, 'bonus'), 400);
  // Records counts every four of a kind as one
  assert.deepEqual(vp.counters('four-aces', 'bonus'), { four: 1 });
  assert.deepEqual(vp.counters('four-low', 'bonus'), { four: 1 });
  assert.deepEqual(vp.makers(H('Ac Ad Ah As 2d'), 'four-aces', 'bonus'), [0, 1, 2, 3]);
});

test('Deuces Wild: every 2 is wild, on the Not So Ugly Ducks pay table', () => {
  const g = 'deuces';
  assert.equal(id('10h Jh Qh Kh Ah', g), 'royal', 'a natural royal');
  assert.equal(id('2c 2d 2h 2s Kd', g), 'four-deuces');
  assert.equal(id('2c Jh Qh Kh Ah', g), 'wild-royal');
  assert.equal(id('2c 2d 10s Qs As', g), 'wild-royal');
  assert.equal(id('2c 7d 7h 7s 7c', g), 'five');
  assert.equal(id('2c 2d 2h 9s 9d', g), 'five');
  assert.equal(id('2c 5h 6h 7h 9h', g), 'straight-flush');
  assert.equal(id('2c Ah 3h 4h 5h', g), 'straight-flush', 'the wheel, with a deuce');
  assert.equal(id('2c 9d 9h 9s 4d', g), 'four');
  assert.equal(id('2c 2d 9h 9s 4d', g), 'four');
  assert.equal(id('2c 9d 9h 4s 4d', g), 'full-house', 'two pair and a deuce');
  assert.equal(id('3c 3d 3h 9s 9d', g), 'full-house');
  assert.equal(id('2h 4h 8h Jh Kh', g), 'flush', 'a deuce of the suit');
  assert.equal(id('2c 4h 8h Jh Kh', g), 'flush', 'a deuce of another suit');
  assert.equal(id('2c 5d 6h 8s 9d', g), 'straight');
  assert.equal(id('2c 9d 9h 4s 5d', g), 'three');
  assert.equal(id('2c 2d 9h 4s Kd', g), 'three');
  assert.equal(id('Kc Kd Kh 4s 5d', g), 'three');
  assert.equal(id('2c 9d 8h 4s Kd', g), null, 'a deuce and nothing: a pair pays nothing here');
  assert.equal(id('Kc Kd 5h 5s 9d', g), null, 'two pair pays nothing here');
  assert.equal(id('Ac Ad 5h 8s 9d', g), null);
  assert.deepEqual(['royal', 'four-deuces', 'wild-royal', 'five', 'straight-flush', 'four', 'full-house', 'flush', 'straight', 'three']
    .map(h => vp.payFor(h, 1, g)), [250, 200, 25, 16, 10, 4, 4, 3, 2, 1]);
  assert.equal(vp.payFor('royal', 5, g), 4000);
  // the everyday wild hands aren't counted in Records; the rare ones are, and a natural royal is a royal
  assert.deepEqual([vp.counters('royal', g), vp.counters('four-deuces', g), vp.counters('four', g), vp.counters('straight-flush', g)],
    [{ royal: 1 }, { 'four-deuces': 1 }, {}, {}]);
  assert.deepEqual(vp.makers(H('2c 9d 9h 4s 5d'), 'three', g), [0, 1, 2]);
  assert.deepEqual(vp.makers(H('9d 2c 2s 2h 2d'), 'four-deuces', g), [1, 2, 3, 4]);
});

test('Deuces Wild: the strategy card', () => {
  const g = 'deuces';
  assert.equal(held('2c 2d 2h 2s Kd', g), '01234', 'four deuces');
  assert.equal(held('2c 2d 2h 5s Kd', g), '012', 'three deuces');
  assert.equal(held('2c 2d 10h Jh 4s', g), '0123', 'four to a royal with two deuces');
  assert.equal(held('2c 2d 9h 4s Kd', g), '01', 'two deuces');
  assert.equal(held('9s 10s Js Qs Ks', g), '1234', 'four to a royal over a straight flush');
  assert.equal(held('2c 9d 9h 4s 4d', g), '01234', 'a full house with a deuce');
  assert.equal(held('2c 5h 6h 7h Kd', g), '0123', 'four to a straight flush with a deuce');
  assert.equal(held('2c 9d 9h 4s 5d', g), '012', 'three of a kind');
  assert.equal(held('2c 9d 8h 4s Kd', g), '0', 'a deuce alone');
  assert.equal(held('Kc Kd 5h 5s 9d', g), '0123', 'both pairs');
  assert.equal(held('Kc Kd 5h 8s 9d', g), '01', 'a pair');
  assert.equal(held('Kc 4c 7c 9c 9d', g), '0123', 'four to a flush over a pair');
  assert.equal(held('3c 6d 8h Js Kd', g), '', 'draw five');
});

test('Bonus Poker plays the same strategy card', () => {
  assert.equal(held('10h Jh Qh Kh 2c', 'bonus'), '0123');
  assert.equal(held('Ac Ad Ah As 2d', 'bonus'), '0123');
  assert.equal(held('Jc Jd 5h 8s 2d', 'bonus'), '01');
});

test('the draw pays by the game the hand was dealt in', () => {
  const s = vp.fresh();
  assert.equal(s.game, 'jacks');
  s.game = 'deuces'; s.coins = 5; s.coin = 5;
  vp.deal(s, () => 0);
  s.hand = H('2c 9d 9h 4s Kd'); s.deck = H('9s 3h 8d');
  s.held = [true, true, true, false, false];
  vp.draw(s);
  assert.deepEqual([s.result.id, s.result.pay], ['four', 4 * 5 * 5]);
});

// Every hand a deck can deal, every way to hold it: what each machine pays back played perfectly (Wizard of Odds:
// wizardofodds.com/games/video-poker/tables/ gives 0.995439 for 9/6 Jacks or Better, 0.991660 for 8/5 Bonus Poker,
// 0.997283 for Not So Ugly Ducks Deuces Wild), and played the strategy card's way, as the help sheet says.
for (const g of vp.GAMES) {
  test(`${g.name}: what it pays back, worked out exactly`, () => {
    const r = returns({ evaluate: c => vp.evaluate(c, g.id), pay: h => vp.payFor(h, 5, g.id), advise: c => vp.advise(c, g.id), wild: g.wild });
    assert.ok(Math.abs(r.best - g.back) < 5e-7, `${g.name} played perfectly: ${r.best}`);
    assert.ok(Math.abs(r.card - g.card) < 5e-7, `${g.name} played by the strategy card: ${r.card}`);
    assert.ok(g.back < 1, `${g.name} keeps a house edge`);
  });
}

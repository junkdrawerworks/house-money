import test from 'node:test';
import assert from 'node:assert/strict';
import * as vp from '../video-poker/js/poker.js';

// '10h Jh Qh Kh Ah' → cards
const R = { A: 1, J: 11, Q: 12, K: 13 };
const H = str => str.split(' ').map(t => ({ r: R[t.slice(0, -1)] || Number(t.slice(0, -1)), s: t.slice(-1) }));
const id = str => vp.evaluate(H(str))?.id || null;

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
  const held = str => vp.advise(H(str)).held.map((h, i) => (h ? i : -1)).filter(i => i >= 0).join('');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../blackjack/js/game.js';

const C = (r, s = 's') => ({ r, s });
// A state whose shoe deals exactly these cards in this order (player, dealer up, player, hole, then hits).
function rigged(cards, bet = 10) {
  const s = g.fresh(() => 0.5);
  s.shoe = Array(250).fill(C(2, 'c')).concat([...cards].reverse());
  s.bet = bet;
  return s;
}

test('totals count aces soft and hard', () => {
  assert.deepEqual(g.total([C(1), C(6)]), { total: 17, soft: true });
  assert.deepEqual(g.total([C(1), C(6), C(10)]), { total: 17, soft: false });
  assert.deepEqual(g.total([C(1), C(1), C(9)]), { total: 21, soft: true });
  assert.equal(g.isBJ([C(1), C(13)]), true);
  assert.equal(g.isBJ([C(7), C(7), C(7)]), false);
});

test('a natural pays 3 to 2', () => {
  const s = rigged([C(1), C(9), C(12), C(8)]);
  g.deal(s);
  assert.equal(s.phase, 'done');
  const o = g.settle(s);
  assert.equal(o.back, 25);
  assert.equal(s.hands[0].result, 'blackjack');
});

test('dealer blackjack under an ace: insurance pays 2 to 1, hand loses', () => {
  const s = rigged([C(10), C(1), C(9), C(13)], 20);
  g.deal(s);
  assert.equal(s.phase, 'insurance');
  g.insure(s, 10);
  assert.equal(s.phase, 'done');
  const o = g.settle(s);
  assert.equal(s.hands[0].result, 'lose');
  assert.equal(o.back, 30);
  assert.equal(o.wagered, 30);
});

test('dealer stands on soft 17', () => {
  const s = rigged([C(10), C(1), C(8), C(6)]);
  g.deal(s); g.insure(s, 0);
  g.stand(s);
  assert.equal(s.phase, 'dealer');
  assert.equal(g.dealerHits(s), false);
  const o = g.settle(s);
  assert.equal(s.hands[0].result, 'win');
  assert.equal(o.back, 20);
});

test('double takes one card and doubles the bet', () => {
  const s = rigged([C(6), C(6), C(5), C(10), C(10), C(9)]);
  g.deal(s);
  assert.equal(g.can(s).double, true);
  g.double(s);
  assert.equal(s.hands[0].bet, 20);
  assert.equal(s.hands[0].cards.length, 3);
  assert.equal(s.phase, 'dealer');
  while (g.dealerStep(s));
  assert.equal(g.total(s.dealer).total, 25);
  const o = g.settle(s);
  assert.equal(o.back, 40);
});

test('split aces take one card each and a 21 there is not blackjack', () => {
  const s = rigged([C(1), C(9), C(1, 'h'), C(8), C(13), C(5)]);
  g.deal(s);
  assert.equal(g.can(s).split, true);
  g.split(s);
  assert.equal(s.hands.length, 2);
  assert.equal(s.phase, 'dealer');
  const o = g.settle(s);
  assert.equal(s.hands[0].result, 'win');
  assert.equal(s.hands[0].pay, 20);
  assert.equal(s.hands[1].result, 'lose');
  assert.equal(o.back, 20);
});

test('surrender gives half back', () => {
  const s = rigged([C(10), C(10, 'h'), C(6), C(9)]);
  g.deal(s);
  g.surrender(s);
  assert.equal(g.dealerPlays(s), false);
  const o = g.settle(s);
  assert.equal(o.back, 5);
});

test('the book', () => {
  const at = (cards, up) => { const s = rigged([cards[0], up, cards[1], C(7)]); g.deal(s); if (s.phase === 'insurance') g.insure(s, 0); return g.book(s)?.act; };
  assert.equal(at([C(10), C(6)], C(10)), 'surrender');
  assert.equal(at([C(10), C(6)], C(6)), 'stand');
  assert.equal(at([C(8), C(8)], C(10)), 'split');
  assert.equal(at([C(5), C(6)], C(10)), 'double');
  assert.equal(at([C(1), C(7)], C(9)), 'hit');
  assert.equal(at([C(1), C(7)], C(4)), 'double');
  assert.equal(at([C(10), C(2)], C(3)), 'hit');
  assert.equal(at([C(9), C(9)], C(7)), 'stand');
  assert.equal(at([C(5), C(5)], C(9)), 'double');
});

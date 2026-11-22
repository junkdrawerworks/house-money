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

// A round that ends as it's dealt (a natural, or the dealer's blackjack under an ace or a ten, insured or not) is
// settled there and then, so the table can always pay a saved 'done' round from its outcome after a reload.
test('every round that reaches done carries its outcome, not yet paid', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  const s = g.fresh(rng);
  let ended = 0, insured = 0;
  for (let i = 0; i < 20000; i++) {
    g.clear(s);
    s.bet = 10;
    g.deal(s, rng);
    if (s.phase === 'insurance') { g.insure(s, i % 2 ? 5 : 0); insured++; }
    if (s.phase !== 'done') continue;
    ended++;
    assert.ok(s.outcome, `round ${i}: done with no outcome`);
    assert.equal(s.paid, false, `round ${i}: settled but already marked paid`);
    assert.equal(s.hole, false, `round ${i}: the hole card still down on a settled round`);
    assert.equal(s.outcome.wagered, 10 + s.insurance);
  }
  // about one round in eleven ends as it's dealt, and one in thirteen offers insurance
  assert.ok(ended > 1000 && insured > 1000, `${ended} rounds ended on the deal, ${insured} offered insurance`);
});

test('a dealer blackjack under an ace after insurance is settled as the dealer peeks', () => {
  const s = rigged([C(10), C(1), C(9), C(13)], 20);
  g.deal(s);
  g.insure(s, 10);
  assert.equal(s.phase, 'done');
  assert.deepEqual([s.outcome.back, s.outcome.wagered, s.outcome.dealerBJ, s.paid], [30, 30, true, false]);
});

// ---------- half chips: an odd bet's half is kept, never lost ----------
// The next round in the same state, on a shoe that deals these cards.
function again(s, cards, bet) {
  g.clear(s);
  s.shoe = Array(250).fill(C(2, 'c')).concat([...cards].reverse());
  s.bet = bet;
  g.deal(s);
  return s;
}
const NATURAL = [C(1), C(9), C(13), C(8)];        // ace and king against 9 and 8
const SIXTEEN = [C(10), C(10, 'h'), C(6), C(9)];  // 16 against a ten: surrender

test('a natural on 25 pays 37 and keeps the half chip, and the next one pays 38', () => {
  const s = again(g.fresh(() => 0.5), NATURAL, 25);
  assert.equal(s.phase, 'done');
  assert.deepEqual([s.outcome.back - 25, s.outcome.half, s.carry], [37, 'kept', 1]);
  again(s, NATURAL, 25);
  assert.deepEqual([s.outcome.back - 25, s.outcome.half, s.carry], [38, 'paid', 0]);
  again(s, NATURAL, 100);
  assert.deepEqual([s.outcome.back - 100, s.outcome.half, s.carry], [150, null, 0], 'an even bet has no half');
});

test('surrender on 25 gives back 12 and keeps the half chip, and the next gives 13', () => {
  const s = again(g.fresh(() => 0.5), SIXTEEN, 25);
  g.surrender(s);
  let o = g.settle(s);
  assert.deepEqual([o.back, o.half, s.carry], [12, 'kept', 1]);
  again(s, SIXTEEN, 25); g.surrender(s); o = g.settle(s);
  assert.deepEqual([o.back, o.half, s.carry], [13, 'paid', 0]);
});

test('on 15: a natural pays 22, then 23; a kept half finishes a surrender too', () => {
  const s = again(g.fresh(() => 0.5), NATURAL, 15);
  assert.deepEqual([s.outcome.back - 15, s.carry], [22, 1]);
  again(s, NATURAL, 15);
  assert.deepEqual([s.outcome.back - 15, s.carry], [23, 0]);
  again(s, NATURAL, 15);
  again(s, SIXTEEN, 15); g.surrender(s);
  assert.deepEqual([g.settle(s).back, s.carry], [8, 0], 'half of 15 is 7 and a half, and the half kept from the natural makes 8');
});

test('settling a round twice pays it the same and keeps the half once', () => {
  const s = again(g.fresh(() => 0.5), NATURAL, 25);
  const first = s.outcome.back;
  g.settle(s); g.settle(s);
  assert.deepEqual([s.outcome.back, s.carry], [first, 1]);
});

test('the kept half survives a save and a reload, between rounds and in a round settled but not paid', () => {
  const save = s => JSON.parse(JSON.stringify(s));
  let s = save(again(g.fresh(() => 0.5), NATURAL, 25));
  assert.equal(s.carry, 1);
  s = save(again(s, NATURAL, 25));
  assert.deepEqual([s.outcome.back, s.carry, s.phase], [63, 0, 'done'], 'the half kept before the reload finishes this one');
  // a round settled, then reloaded and settled again (as a page that closed before the payout might): no second half
  s = save(again(s, NATURAL, 25));
  g.settle(s);
  assert.deepEqual([s.outcome.back, s.carry], [62, 1]);
});

test('over many naturals on 25 the payout averages exactly 37.5, and insurance stays a whole chip', () => {
  const s = g.fresh(() => 0.5);
  let won = 0;
  for (let i = 0; i < 1000; i++) { again(s, NATURAL, 25); won += s.outcome.back - 25; }
  assert.equal(won, 37500);
  assert.equal(s.carry, 0);
  const ins = again(g.fresh(() => 0.5), [C(10), C(1), C(9), C(13)], 25);
  g.insure(ins, 13);
  assert.equal(ins.insurance, 12, 'insurance on 25 is capped at 12');
});

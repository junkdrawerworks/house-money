import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../baccarat/js/game.js';

const C = (r, s = 's') => ({ r, s });
const supply = cards => { const a = [...cards]; return () => a.shift(); };

test('points and scores', () => {
  assert.equal(g.score([C(13), C(1)]), 1);
  assert.equal(g.score([C(9), C(8)]), 7);
  assert.equal(g.score([C(10), C(12)]), 0);
  assert.equal(g.score([C(7), C(8), C(9)]), 4);
});

test('the banker tableau, every case', () => {
  // The printed drawing chart: rows are the Banker's total 0–7, columns the Player's third card 0–9
  // (D draws, S stands), plus the column for a Player who stood.
  const chart = {
    0: 'DDDDDDDDDD', 1: 'DDDDDDDDDD', 2: 'DDDDDDDDDD',
    3: 'DDDDDDDDSD', 4: 'SSDDDDDDSS', 5: 'SSSSDDDDSS',
    6: 'SSSSSSDDSS', 7: 'SSSSSSSSSS',
  };
  for (let b = 0; b <= 7; b++) {
    for (let p3 = 0; p3 <= 9; p3++) assert.equal(g.bankerDraws(b, p3), chart[b][p3] === 'D', `banker ${b}, player's third ${p3}`);
    assert.equal(g.bankerDraws(b, null), b <= 5, `banker ${b}, player stood`);
  }
  for (let p = 0; p <= 9; p++) assert.equal(g.playerDraws(p), p <= 5);
});

test('a natural stops the coup', () => {
  const c = g.coup(supply([C(4), C(2), C(4), C(3), C(9), C(9)]));
  assert.equal(c.player.length, 2); assert.equal(c.banker.length, 2);
  assert.equal(c.natural, true); assert.equal(c.winner, 'P'); assert.equal(c.pt, 8);
});

test('player draws, banker draws by the tableau', () => {
  // Player 2+3 = 5 draws an 8; Banker 1+2 = 3 stands against an 8.
  const c = g.coup(supply([C(2), C(1), C(3), C(2), C(8), C(5)]));
  assert.equal(c.player.length, 3); assert.equal(c.banker.length, 2);
  assert.equal(c.pt, 3); assert.equal(c.bt, 3); assert.equal(c.winner, 'T');
  // Player stands on 6; Banker on 5 draws.
  const d = g.coup(supply([C(3), C(2), C(3), C(3), C(4)]));
  assert.equal(d.player.length, 2); assert.equal(d.banker.length, 3);
  assert.equal(d.bt, 9); assert.equal(d.winner, 'B');
});

test('payouts: banker less 5%, carried in twentieths', () => {
  const B = { winner: 'B', pPair: false, bPair: false };
  let r = g.payouts(B, { player: 0, banker: 10, tie: 0, pp: 0, bp: 0 }, 0);
  assert.equal(r.back, 19); assert.equal(r.carry, 10);
  r = g.payouts(B, { player: 0, banker: 10, tie: 0, pp: 0, bp: 0 }, r.carry);
  assert.equal(r.back, 20); assert.equal(r.carry, 0);
  r = g.payouts(B, { player: 0, banker: 100, tie: 0, pp: 0, bp: 0 }, 0);
  assert.equal(r.back, 195);
  const T = { winner: 'T', pPair: true, bPair: false };
  r = g.payouts(T, { player: 10, banker: 20, tie: 5, pp: 5, bp: 5 }, 0);
  assert.deepEqual(r.pay, { player: 10, banker: 20, tie: 45, pp: 60, bp: 0 });
  const P = { winner: 'P', pPair: false, bPair: true };
  r = g.payouts(P, { player: 10, banker: 20, tie: 5, pp: 0, bp: 5 }, 0);
  assert.equal(r.back, 20 + 60);
});

test('the house edges, worked out exactly for eight decks', () => {
  // Every way six cards can come off a full shoe, by point value (0 has the tens and pictures: 128 cards; 1–9 have 32).
  const counts = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
  const N = 416;
  const prob = { P: 0, B: 0, T: 0 };
  const seq = new Array(6);
  function go(i, w, left) {
    if (i === 6) {
      const c = g.coup(supply(seq.map(v => ({ r: v === 0 ? 10 : v, s: 's' }))));
      prob[c.winner] += w;
      return;
    }
    for (let v = 0; v <= 9; v++) {
      if (!counts[v]) continue;
      const ww = w * counts[v] / left;
      counts[v]--; seq[i] = v;
      go(i + 1, ww, left - 1);
      counts[v]++;
    }
  }
  go(0, 1, N);
  const banker = -(prob.B * 0.95 - prob.P);
  const player = -(prob.P - prob.B);
  const tie = -(prob.T * 8 - (1 - prob.T));
  assert.ok(Math.abs(prob.B - 0.458597) < 1e-5, `banker wins ${prob.B}`);
  assert.ok(Math.abs(prob.P - 0.446247) < 1e-5, `player wins ${prob.P}`);
  assert.ok(Math.abs(banker - 0.010579) < 1e-5, `banker edge ${banker}`);
  assert.ok(Math.abs(player - 0.012351) < 1e-5, `player edge ${player}`);
  assert.ok(Math.abs(tie - 0.143596) < 1e-5, `tie edge ${tie}`);
  // A pair is the first two cards of one rank: 13 ranks of 32 cards each.
  const pair = 13 * 32 * 31 / (416 * 415);
  assert.ok(Math.abs((1 - pair * 12) - 0.103614) < 1e-5);
});

test('deal, reveal stages, settle', () => {
  const s = g.fresh(() => 0.3);
  s.shoe = Array(300).fill(C(10, 'c')).concat([C(2), C(1), C(3), C(2), C(8), C(5)].reverse());
  s.bets.banker = 10;
  g.deal(s);
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(g.out(s), ['p0', 'b0', 'p1', 'b1']);
  assert.equal(g.advance(s), null, 'not until the four are turned');
  s.turned.push('p0', 'b0', 'p1', 'b1');
  assert.equal(g.advance(s), 'p2');
  s.turned.push('p2');
  // Player 2+3 = 5 draws an 8 (3); Banker 1+2 = 3 stands against an 8: no third card for the Banker.
  assert.equal(g.advance(s), null);
  const o = g.settle(s);
  assert.equal(s.coup.banker.length, 2);
  assert.equal(s.coup.winner, 'T');
  assert.equal(o.back, 10, 'a tie pushes the banker bet');
  assert.equal(o.wagered, 10);
  assert.equal(s.road.length, 1);
});

test('the big road', () => {
  const road = 'BBPPPTBBBBBBBP'.split('').map(w => ({ w }));
  const cells = g.bigRoad(road);
  const at = (c, r) => cells.find(x => x.c === c && x.r === r);
  assert.equal(at(0, 0).w, 'B'); assert.equal(at(0, 1).w, 'B');
  assert.equal(at(1, 2).w, 'P'); assert.equal(at(1, 2).ties, 1);
  assert.equal(at(2, 5).w, 'B'); assert.equal(at(3, 5).w, 'B', 'the seventh banker trails right');
  assert.equal(at(3, 0).w, 'P');
  assert.deepEqual(g.tally(road), { P: 4, B: 9, T: 1 });
});

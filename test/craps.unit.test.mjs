import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../craps/js/game.js';

const S = (point, bets) => ({ ...g.fresh(), point, bets: { ...bets } });
// the event for a spot in a roll's result
const ev = (r, spot) => r.events.find(e => e.spot === spot);

test('pass line: naturals, craps, a point made and a seven out', () => {
  let s = S(0, { pass: 10 });
  let r = g.roll(s, 3, 4);
  assert.equal(ev(r, 'pass').outcome, 'win'); assert.equal(r.toRack, 10); assert.equal(s.bets.pass, 10);
  r = g.roll(s, 5, 6); assert.equal(ev(r, 'pass').outcome, 'win');
  r = g.roll(s, 1, 1); assert.equal(ev(r, 'pass').outcome, 'lose'); assert.equal(s.bets.pass, undefined);

  s = S(0, { pass: 10 });
  r = g.roll(s, 2, 4); assert.equal(s.point, 6); assert.equal(r.events.length, 0);
  s.bets.passOdds = 50;
  r = g.roll(s, 3, 3);
  assert.equal(s.point, 0); assert.equal(r.point.made, true);
  assert.equal(ev(r, 'passOdds').win, 60); // 6 to 5
  assert.equal(r.toRack, 10 + 60 + 50);
  assert.equal(s.bets.pass, 10); assert.equal(s.bets.passOdds, undefined);

  s = S(4, { pass: 10, passOdds: 30 });
  r = g.roll(s, 3, 4);
  assert.equal(r.point.sevenOut, true); assert.equal(r.toRack, 0); assert.deepEqual(s.bets, {});
  assert.equal(r.call, 'Seven out, line away.');
});

test('true odds and lay odds pay right on every point', () => {
  const odds = { 4: 60, 10: 60, 5: 45, 9: 45, 6: 36, 8: 36 };
  const lay = { 4: 15, 10: 15, 5: 20, 9: 20, 6: 25, 8: 25 };
  for (const n of g.POINTS) {
    const a = Math.floor((n - 1) / 2) + 1, d = [a, n - a];
    let s = S(n, { pass: 10, passOdds: 30 });
    assert.equal(ev(g.roll(s, d[0], d[1]), 'passOdds').win, odds[n], `odds on ${n}`);
    s = S(n, { dontPass: 10, dontOdds: 30 });
    assert.equal(ev(g.roll(s, 3, 4), 'dontOdds').win, lay[n], `lay on ${n}`);
  }
});

test('don’t pass bars 12 and can come down after a point', () => {
  let s = S(0, { dontPass: 10 });
  let r = g.roll(s, 6, 6); assert.equal(ev(r, 'dontPass').outcome, 'push'); assert.equal(s.bets.dontPass, 10);
  r = g.roll(s, 1, 2); assert.equal(ev(r, 'dontPass').outcome, 'win');
  r = g.roll(s, 5, 6); assert.equal(ev(r, 'dontPass').outcome, 'lose');
  s = S(8, { dontPass: 10, pass: 10 });
  assert.equal(g.removable(s, 'dontPass'), true);
  assert.equal(g.removable(s, 'pass'), false);
  assert.equal(g.removable(S(0, { pass: 10 }), 'pass'), true);
});

test('place bets pay 9:5, 7:5, 7:6 and are off on the come-out', () => {
  const pays = { 4: 54, 10: 54, 5: 42, 9: 42, 6: 35, 8: 35 };
  for (const n of g.POINTS) {
    const a = Math.floor((n - 1) / 2) + 1;
    const s = S(n === 4 ? 10 : 4, { [`place${n}`]: 30 });
    const r = g.roll(s, a, n - a);
    assert.equal(ev(r, `place${n}`).win, pays[n], `place ${n}`);
    assert.equal(s.bets[`place${n}`], 30, 'stays up');
  }
  let s = S(0, { place6: 30, hard8: 5 });
  let r = g.roll(s, 3, 4); assert.equal(r.events.length, 0, 'off on the come-out'); assert.equal(s.bets.place6, 30);
  s = S(5, { place6: 30, place8: 6 });
  r = g.roll(s, 3, 4); assert.equal(r.toRack, 0); assert.deepEqual(s.bets, {});
  // paid down to whole chips
  s = S(4, { place6: 5 }); assert.equal(ev(g.roll(s, 3, 3), 'place6').win, 5);
});

test('come bets travel, win, lose, and their odds are off on the come-out', () => {
  let s = S(6, { come: 10 });
  let r = g.roll(s, 4, 5);
  assert.equal(ev(r, 'come').outcome, 'move'); assert.equal(s.bets.come9, 10); assert.equal(s.bets.come, undefined);
  assert.equal(g.can(s, 'comeOdds9').room, 40);
  s.bets.comeOdds9 = 20; s.bets.come = 10;
  r = g.roll(s, 4, 5); // the 9 wins and the new come bet lands on it
  assert.equal(ev(r, 'come9').win, 10); assert.equal(ev(r, 'comeOdds9').win, 30);
  assert.equal(r.toRack, 10 + 10 + 30 + 20);
  assert.equal(s.bets.come9, 10); assert.equal(s.bets.comeOdds9, undefined);
  // come-out seven: come bet loses, its odds come back
  s = S(0, { come5: 10, comeOdds5: 20 });
  r = g.roll(s, 3, 4); assert.equal(ev(r, 'come5').outcome, 'lose'); assert.equal(ev(r, 'comeOdds5').outcome, 'return'); assert.equal(r.toRack, 20);
  // come-out on its number: flat wins, odds come back unpaid
  s = S(0, { come5: 10, comeOdds5: 20 });
  r = g.roll(s, 2, 3); assert.equal(r.toRack, 10 + 10 + 20); assert.equal(s.point, 5);
  // come box: 7/11 win, craps lose
  s = S(4, { come: 10 }); assert.equal(ev(g.roll(s, 5, 6), 'come').outcome, 'win'); assert.equal(s.bets.come, 10);
  s = S(4, { come: 10 }); r = g.roll(s, 3, 4); assert.equal(ev(r, 'come').outcome, 'win'); assert.equal(r.toRack, 20); assert.equal(s.bets.come, undefined, 'no come box on the come-out');
  s = S(4, { come: 10 }); assert.equal(ev(g.roll(s, 1, 2), 'come').outcome, 'lose');
  assert.equal(g.can(S(0, {}), 'come').ok, false);
  assert.equal(g.can(S(6, {}), 'pass').ok, false);
  assert.equal(g.removable(S(6, { come8: 10 }), 'come8'), false);
});

test('don’t come travels and wins on a seven, lay odds working', () => {
  const s = S(6, { dontCome: 10 });
  g.roll(s, 4, 4); assert.equal(s.bets.dcome8, 10);
  s.bets.dcomeOdds8 = 30;
  const r = g.roll(s, 3, 4);
  assert.equal(ev(r, 'dcome8').win, 10); assert.equal(ev(r, 'dcomeOdds8').win, 25);
});

test('field, hardways and props', () => {
  const f = (a, b) => { const s = S(0, { field: 10 }); return ev(g.roll(s, a, b), 'field'); };
  assert.equal(f(1, 1).win, 20); assert.equal(f(6, 6).win, 30); assert.equal(f(4, 5).win, 10); assert.equal(f(3, 4).outcome, 'lose'); assert.equal(f(2, 3).outcome, 'lose');
  let s = S(5, { hard8: 10, hard6: 10, hard4: 10 });
  let r = g.roll(s, 4, 4); assert.equal(ev(r, 'hard8').win, 90); assert.equal(s.bets.hard8, 10);
  r = g.roll(s, 2, 4); assert.equal(ev(r, 'hard6').outcome, 'lose');
  r = g.roll(s, 2, 2); assert.equal(ev(r, 'hard4').win, 70);
  s = S(0, { any7: 10, anyCraps: 10, yo: 10, aces: 10, aceDeuce: 10, boxcars: 10 });
  r = g.roll(s, 5, 6); assert.equal(ev(r, 'yo').win, 150); assert.equal(ev(r, 'any7').outcome, 'lose');
  s = S(0, { any7: 10, anyCraps: 10, aces: 10 });
  r = g.roll(s, 1, 1); assert.equal(ev(r, 'anyCraps').win, 70); assert.equal(ev(r, 'aces').win, 300);
  s = S(0, { any7: 10 }); assert.equal(ev(g.roll(s, 1, 6), 'any7').win, 40);
});

test('odds limits: 3-4-5x behind the line, lay up to 6x', () => {
  assert.equal(g.can(S(4, { pass: 10 }), 'passOdds').room, 30);
  assert.equal(g.can(S(5, { pass: 10 }), 'passOdds').room, 40);
  assert.equal(g.can(S(8, { pass: 10 }), 'passOdds').room, 50);
  assert.equal(g.can(S(8, { dontPass: 10 }), 'dontOdds').room, 60);
  assert.equal(g.can(S(0, { pass: 10 }), 'passOdds').ok, false);
});

// Exact house edge per bet decided: the expected result of a bet of 30 (which every payout divides) from a state,
// following every roll until the bet is decided, as a fraction of the stake.
function edge(point, spot, extra = {}) {
  const memo = new Map();
  function value(pt, sp, bets) {
    const key = `${pt}|${sp}|${JSON.stringify(bets)}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, NaN);
    let decided = 0, stay = 0;
    const later = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const s = S(pt, bets);
      const r = g.roll(s, a, b);
      const e = r.events.find(x => x.spot === sp);
      const p = 1 / 36;
      if (e && e.outcome === 'win') decided += p * e.win / 30;
      else if (e && e.outcome === 'lose') decided -= p;
      else if (e && e.outcome === 'move') later.push([p, s.point, e.to, { [e.to]: 30 }]);
      // a roll that doesn't decide the bet: only the line cares that the point changed (place bets, hardways and
      // come bets are off, or not, on the same terms for their number and the seven, so it doesn't move their odds)
      else if (s.point === pt || !/^(pass|dontPass)$/.test(sp)) stay += p;
      else later.push([p, s.point, sp, { [sp]: 30, ...extra }]);
    }
    for (const [p, pt2, sp2, b2] of later) decided += p * value(pt2, sp2, b2);
    const v = decided / (1 - stay);
    memo.set(key, v);
    return v;
  }
  return value(point, spot, { [spot]: 30, ...extra });
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('house edges, exactly', () => {
  near(edge(0, 'pass'), -7 / 495);            // 1.414%
  // 1.364% per bet made; counted only over bets decided (the barred 12 is a push, not a decision) it's 1.403%
  near(edge(0, 'dontPass') * 35 / 36, -3 / 220);
  near(edge(4, 'come'), -7 / 495);
  near(edge(4, 'field'), -1 / 36);              // 2.78%
  near(edge(4, 'place6'), -1 / 66);             // 1.52%
  near(edge(4, 'place5'), -1 / 25);             // 4%
  near(edge(5, 'place4'), -1 / 15);             // 6.67%
  near(edge(4, 'hard8'), -1 / 11);              // 9.09%
  near(edge(5, 'hard10'), -1 / 9);              // 11.1%
  near(edge(0, 'any7'), -1 / 6);
  near(edge(0, 'anyCraps'), -1 / 9);
  near(edge(0, 'yo'), -1 / 9);
  near(edge(0, 'aces'), -5 / 36);
  near(edge(6, 'passOdds', { pass: 6 }), 0);
  near(edge(4, 'dontOdds', { dontPass: 5 }), 0);
});

// ---------- odds pay true odds exactly: the fraction of a chip is kept, never lost ----------

test('5 in odds on the 5 pays 7 and keeps the half, and the next pays 8', () => {
  const s = S(5, { pass: 5, passOdds: 5 });
  let r = g.roll(s, 2, 3);
  assert.deepEqual([ev(r, 'passOdds').win, s.carry, r.carry], [7, 15, { was: 0, now: 15 }]);
  s.point = 5; s.bets.passOdds = 5;
  r = g.roll(s, 1, 4);
  assert.deepEqual([ev(r, 'passOdds').win, s.carry], [8, 0]);
  // laying 5 against the 4 is owed 2½: 2, then 3
  const d = S(4, { dontPass: 5, dontOdds: 5 });
  r = g.roll(d, 3, 4);
  assert.deepEqual([ev(r, 'dontOdds').win, d.carry], [2, 15]);
  d.point = 4; d.bets.dontOdds = 5; d.bets.dontPass = 5;
  assert.equal(ev(g.roll(d, 3, 4), 'dontOdds').win, 3);
  // place bets are still paid down: 5 on the 6 pays 5, nothing kept
  const p = S(4, { place6: 5 });
  r = g.roll(p, 3, 3);
  assert.deepEqual([ev(r, 'place6').win, p.carry], [5, 0]);
});

// Every odds bet (pass, don't pass, come and don't come odds) on every point, for every amount up to 30 (every
// remainder an odds price can leave) and every fraction already kept: over the 36 rolls, what's paid now plus what's
// added to the fraction kept, against what's lost, comes to exactly nothing, in thirtieths of a chip. Not simulated:
// each roll is played once and weighted by its 1-in-36 chance.
test('odds on any amount have exactly no house edge, counting the fraction kept', () => {
  const setups = n => [
    ['passOdds', amt => S(n, { pass: 5, passOdds: amt })],
    ['dontOdds', amt => S(n, { dontPass: 5, dontOdds: amt })],
    [`comeOdds${n}`, amt => S(n === 4 ? 5 : 4, { [`come${n}`]: 5, [`comeOdds${n}`]: amt })],
    [`dcomeOdds${n}`, amt => S(n === 4 ? 5 : 4, { [`dcome${n}`]: 5, [`dcomeOdds${n}`]: amt })],
  ];
  let checked = 0;
  for (const n of g.POINTS) for (const [spot, make] of setups(n)) for (let amt = 1; amt <= 30; amt++) for (let c = 0; c < g.CARRY; c++) {
    let sum = 0, decided = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const s = { ...make(amt), carry: c };
      const e = g.roll(s, a, b).events.find(x => x.spot === spot);
      if (!e) continue;
      decided++;
      if (e.outcome === 'win') sum += e.win * g.CARRY + (s.carry - c);
      else if (e.outcome === 'lose') sum -= amt * g.CARRY;
      else assert.fail(`${spot} ${e.outcome}`);
    }
    assert.ok(decided > 0);
    assert.equal(sum, 0, `${spot} on the ${n}, ${amt} in odds with ${c}/30 kept`);
    checked++;
  }
  assert.equal(checked, 6 * 4 * 30 * 30);
});

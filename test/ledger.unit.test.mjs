// The books behind the cage and Records, as Google Drive saving puts devices together (shared/ledger.js): every
// worked example in the design, the merge in either order and repeated, devices that always sync matching one stack,
// Records exact with writes lost, and a stack that never goes below 0.
//
// What's guaranteed, and checked here:
//   - Records and the chips bet on the player's card are exact under any sync schedule, lost writes included.
//   - The stack is exact whenever each device syncs as it opens and as it's left.
//   - A device playing from an out-of-date stack adds its own wins and losses to the shared stack; the stack never
//     goes below 0, and stakes taken on two devices in the same dry spell count once.
// Not claimed: once the cage has covered chips two devices bet while apart, three or more devices out of touch can
// leave the stack a little higher in one order of syncs than another (the cover is the larger of two copies').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../shared/ledger.js';

const clone = o => structuredClone(o);
const empty = () => ({ app: 'house-money', v: 1, cage: L.cleanCage(null), records: L.cleanRecords(null), seen: {} });
const chips = d => L.cageTotals(d.cage).chips;
const card = d => L.cageTotals(d.cage).wagered;
const stakes = d => L.cageTotals(d.cage).stakes - 1;
// A device's totals as they'd be after some play: taken off the stack, paid back, wagered, picked back up.
function played(d, id, t, p, w = t, u = 0) {
  const s = (d.cage.dev[id] ||= { t: 0, p: 0, w: 0, u: 0, h: 0, r: 0 });
  s.t += t; s.p += p; s.w += w; s.u += u; s.r += 1;
  return d;
}
// n rounds at a table in Records
function rounds(d, id, tb, n, wagered = 0, back = 0) {
  for (let i = 0; i < n; i++) L.note(d.records, id, tb, { wagered: i ? 0 : wagered, back: i ? 0 : back }, '2026-11-22');
  return d;
}
const roundsAt = (d, tb) => L.recordsTotals(d.records).tables[tb]?.rounds || 0;
// One sync: the device and Drive both end up holding the two put together.
function sync(local, drive) { const m = drive ? L.mergeBody(local, drive) : clone(local); return [clone(m), clone(m)]; }

// A random number source that comes out the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return n => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n); };
}

test('1. a device’s first sync, with Drive empty: the file holds its section and the stack doesn’t move', () => {
  let P = played(empty(), 'P', 3400, 3050);
  assert.equal(chips(P), 650);
  let D;
  [P, D] = sync(P, null);
  assert.equal(chips(P), 650);
  assert.deepEqual(Object.keys(D.cage.dev), ['P']);
});

test('2. a second device’s first sync, after playing on its own: one stack, one starting 1,000', () => {
  let P = rounds(played(empty(), 'P', 3400, 3050), 'P', 'blackjack', 40), D;
  [P, D] = sync(P, null);
  let Lp = rounds(played(empty(), 'L', 2000, 2600, 2000, 100), 'L', 'blackjack', 25);
  assert.equal(chips(Lp), 1600);
  [Lp, D] = sync(Lp, D);
  [P, D] = sync(P, D);
  assert.equal(chips(P), 1000 + (3050 - 3400) + (2600 - 2000));
  assert.deepEqual([chips(P), chips(Lp)], [1250, 1250]);
  assert.equal(card(P), 5300);
  assert.equal(roundsAt(P, 'blackjack'), 65);
});

// From 1,250 on both, with Drive holding both sections.
function joined() {
  let P = played(empty(), 'P', 3400, 3050), Lp = played(empty(), 'L', 2000, 2600, 2000, 100), D;
  [P, D] = sync(P, null); [Lp, D] = sync(Lp, D); [P, D] = sync(P, D);
  return { P, Lp, D };
}

test('3. both playing at once, their syncs crossing: the phone’s next sync puts its own numbers back', () => {
  let { P, Lp, D } = joined();
  played(P, 'P', 100, 0); played(Lp, 'L', 50, 100);
  assert.deepEqual([chips(P), chips(Lp)], [1150, 1300]);
  // the laptop read Drive before the phone wrote, and wrote after it
  const old = clone(D);
  [P, D] = sync(P, D);
  [Lp, D] = sync(Lp, old);
  assert.equal(chips(D), 1300, 'Drive lost the phone’s write');
  [P, D] = sync(P, D); [Lp, D] = sync(Lp, D);
  assert.deepEqual([chips(P), chips(Lp)], [1200, 1200]);
  const settled = L.canon(D);
  for (let i = 0; i < 10; i++) { [P, D] = sync(P, D); [Lp, D] = sync(Lp, D); }
  assert.equal(L.canon(D), settled, 'ten more syncs each change nothing');
  assert.equal(card(P), 5450);
});

// From 1,200 on both, all synced.
function base() {
  let { P, Lp, D } = joined();
  played(P, 'P', 100, 0); played(Lp, 'L', 50, 100);
  [P, D] = sync(P, D); [Lp, D] = sync(Lp, D); [P, D] = sync(P, D);
  assert.equal(chips(D), 1200);
  return D;
}

test('4. one device offline for a week: both devices’ play counts once, and the card moves up on both', () => {
  const D0 = base();
  const A = played(clone(D0), 'P', 15000, 14200), B = played(clone(D0), 'L', 40000, 42500);
  assert.equal(chips(A), 400);
  assert.equal(card(A), 20450);
  assert.equal(chips(B), 3700);
  const M = L.mergeBody(A, L.mergeBody(B, D0));
  assert.equal(chips(M), 2900);
  assert.equal(card(M), 60450);
  assert.equal(L.canon(M), L.canon(L.mergeBody(L.mergeBody(D0, A), B)), 'in either order');
});

test('4b. both spend the same chips while apart: the stack stops at 0, the cage covers 850, Records keep both losses', () => {
  const D0 = base();
  const A = clone(D0), B = clone(D0);
  // real plays: the phone loses 1,150 at roulette, the laptop 900 at blackjack
  for (let i = 0; i < 23; i++) { assert.ok(L.take(A.cage, 'P', 50)); L.note(A.records, 'P', 'roulette', { wagered: 50, back: 0 }); }
  for (let i = 0; i < 9; i++) { assert.ok(L.take(B.cage, 'L', 100)); L.note(B.records, 'L', 'blackjack', { wagered: 100, back: 0 }); }
  assert.deepEqual([chips(A), chips(B)], [50, 300]);
  const M = L.mergeBody(A, B);
  assert.equal(chips(M), 0);
  assert.equal(M.cage.forgiven, 850);
  assert.equal(L.canon(M), L.canon(L.mergeBody(B, A)));
  const r = L.recordsTotals(M.records).tables;
  assert.equal(r.roulette.net + r.blackjack.net - (L.recordsTotals(D0.records).tables.blackjack?.net || 0), -2050);
});

test('4c. a stake taken on one device while away counts', () => {
  const D0 = base();
  const A = clone(D0), B = clone(D0);
  played(A, 'P', 1195, 0);
  assert.equal(chips(A), 5);
  assert.equal(L.stake(A.cage, 'P'), 2);
  assert.equal(chips(A), 1005);
  played(A, 'P', 0, 400, 0);
  played(B, 'L', 0, 2500, 0);
  const M = L.mergeBody(A, B);
  assert.equal(chips(M), 1200 - 1195 + 1000 + 400 + 2500);
  assert.equal(stakes(M), 1);
});

test('4d. both stake in the same dry spell: it counts once, as if it had all been on one device', () => {
  let D0 = base();
  played(D0, 'P', 1195, 0);
  const A = clone(D0), B = clone(D0);
  assert.equal(chips(A), 5);
  L.stake(A.cage, 'P'); L.stake(B.cage, 'L');
  played(A, 'P', 200, 0); played(B, 'L', 300, 600);
  const M = L.mergeBody(A, B);
  assert.equal(chips(M), 5 + 1000 - 200 + 300);
  assert.equal(stakes(M), 1);
  // the same play on one device, one after the other
  const one = clone(D0);
  L.stake(one.cage, 'P'); played(one, 'P', 200, 0); played(one, 'L', 300, 600);
  assert.equal(chips(one), chips(M));
});

test('5. a device that was wiped joins again with a new id: nothing lost, its fresh 1,000 not added', () => {
  const D0 = base();
  const A = played(clone(D0), 'P', 15000, 14200), B = played(clone(D0), 'L', 40000, 42500);
  rounds(A, 'P', 'roulette', 30);
  const W = L.mergeBody(L.mergeBody(D0, A), B);
  const R = played(empty(), 'P2', 150, 0);
  assert.equal(chips(R), 850);
  const M = L.mergeBody(R, W);
  assert.equal(chips(M), 2750);
  assert.equal(card(M), 60600);
  assert.equal(roundsAt(M, 'roulette'), 30, 'the old phone’s rounds stay');
  assert.deepEqual(Object.keys(M.cage.dev).sort(), ['L', 'P', 'P2']);
});

test('6. a deleted file is made again from any device’s copy, and two files made at once fold into one', () => {
  let { P, Lp, D } = joined();
  // the file deleted: the phone's copy holds every section as of its last sync
  const remade = clone(P);
  assert.equal(chips(remade), chips(D));
  // two devices each made a file: folding the later one into the first, either way round, gives the same
  const one = played(empty(), 'X', 300, 0), two = played(empty(), 'Y', 0, 500, 0);
  assert.equal(L.canon(L.mergeBody(one, two)), L.canon(L.mergeBody(two, one)));
  assert.equal(chips(L.mergeBody(one, two)), 1200);
});

// Random cages and Records whose stacks stay above 0 when put together, so the cage never covers anything.
function randomDoc(r, ids) {
  const d = empty();
  for (const id of ids) {
    if (r(3) === 0) continue;
    const t = r(5000), p = r(5000) + t; // never short, so no cover comes into it
    d.cage.dev[id] = { t, p, w: t + r(50), u: r(50), h: r(9000), r: r(100) };
    if (r(2)) d.cage.dev[id].felt = { at: r(5), tables: r(2) ? { craps: 1 + r(300) } : {} };
    for (const tb of ['blackjack', 'craps']) if (r(2)) L.note(d.records, id, tb, { wagered: r(100), back: r(200), add: { a: r(3) }, top: { z: r(9) } }, `2026-11-${10 + r(9)}`);
  }
  for (let n = 2; n < 2 + r(4); n++) if (r(2)) d.cage.stakes[n] = { amount: 1000, by: ids[r(ids.length)], at: r(3) };
  if (r(2)) d.seen[['blackjack', 'craps', 'roulette'][r(3)]] = 1;
  return d;
}

test('the merge gives the same in either order and when repeated, and three-way merges agree when the cage covers nothing', () => {
  const r = rng(7);
  for (let i = 0; i < 400; i++) {
    const ids = ['a', 'b', 'c'];
    // copies of one history: each a later or earlier view of the same sections
    const a = randomDoc(r, ids), b = randomDoc(r, ids), c = randomDoc(r, ids);
    const ab = L.mergeBody(a, b);
    assert.equal(L.canon(ab), L.canon(L.mergeBody(b, a)), 'either order');
    assert.equal(L.canon(L.mergeBody(ab, ab)), L.canon(ab), 'with itself');
    assert.equal(L.canon(L.mergeBody(ab, a)), L.canon(ab), 'again with one side');
    assert.equal(L.canon(L.mergeBody(L.mergeBody(a, b), c)), L.canon(L.mergeBody(a, L.mergeBody(b, c))), 'grouped either way');
    assert.equal(ab.cage.forgiven, 0);
  }
});

// Devices playing real rounds on their own copies, syncing with a shared Drive copy now and then.
//   pull: each device syncs before it plays, and push: after; every: the chance of a sync after a play is 1 in this;
//   lose: the percentage of writes to Drive lost (another device's write landed on top); away: device a is out of
//   touch for this many of every 1,000 plays.
function session({ seed, devices = 3, plays = 1500, pull = false, every = 1, lose = 0, away = 0 }) {
  const r = rng(seed), ids = Array.from({ length: devices }, (_, i) => `d${i}`);
  const loc = Object.fromEntries(ids.map(id => [id, empty()]));
  let drive = null, wagered = 0, net = 0, played = 0, shadow = L.START, taps = 0, lowest = Infinity;
  const touch = id => { const m = drive ? L.mergeBody(loc[id], drive) : clone(loc[id]); loc[id] = clone(m); return m; };
  for (let n = 0; n < plays; n++) {
    const id = ids[r(devices)], out = away && id === 'd0' && n % 1000 < away;
    if (pull && drive && !out) loc[id] = touch(id);
    const d = loc[id], bet = [1, 5, 25, 100][r(4)];
    if (chips(d) < 10) { L.stake(d.cage, id); taps++; shadow += L.START; }
    else if (L.take(d.cage, id, bet)) {
      const back = r(100) < 48 ? 2 * bet : 0;
      if (back) L.pay(d.cage, id, back);
      L.note(d.records, id, `t${r(3)}`, { wagered: bet, back }, '2026-11-22');
      played++; wagered += bet; net += back - bet; shadow += back - bet;
    }
    lowest = Math.min(lowest, chips(d));
    if (!out && r(every) === 0) {
      const before = drive;
      const m = touch(id);
      drive = lose && before && r(100) < lose ? before : m;
    }
    if (drive) lowest = Math.min(lowest, chips(drive));
  }
  // everyone syncs twice, nothing lost
  for (let k = 0; k < 2; k++) for (const id of ids) drive = touch(id);
  const r3 = ['t0', 't1', 't2'].map(tb => L.recordsTotals(drive.records).tables[tb] || { rounds: 0, wagered: 0, net: 0 });
  return {
    agree: ids.every(id => L.canon(loc[id]) === L.canon(drive)),
    rounds: r3.reduce((a, x) => a + x.rounds, 0) === played,
    recWagered: r3.reduce((a, x) => a + x.wagered, 0) === wagered,
    recNet: r3.reduce((a, x) => a + x.net, 0) === net,
    card: card(drive) === wagered,
    chips: chips(drive), shadow, lowest, forgiven: drive.cage.forgiven,
    books: chips(drive) === L.START + net + L.START * stakes(drive) + drive.cage.forgiven,
    taps, kept: stakes(drive),
  };
}

test('devices that sync before and after every play match one stack on one device exactly', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = session({ seed, pull: true });
    assert.ok(s.agree && s.rounds && s.recWagered && s.recNet && s.card && s.books, `seed ${seed}`);
    assert.equal(s.chips, s.shadow, `seed ${seed}: the stack is ${s.chips}, one device would have ${s.shadow}`);
    assert.equal(s.forgiven, 0, `seed ${seed}: the cage covered something`);
    assert.equal(s.kept, s.taps, `seed ${seed}: every stake kept`);
  }
});

test('Records and the card stay exact under any schedule, writes lost included, and the stack never goes below 0', () => {
  const schedules = [{}, { every: 20 }, { every: 20, lose: 30 }, { every: 5, away: 750 }, { every: 3, lose: 50, devices: 4 }];
  for (const o of schedules) {
    for (let seed = 1; seed <= 25; seed++) {
      const s = session({ seed, ...o });
      const at = `${JSON.stringify(o)} seed ${seed}`;
      assert.ok(s.agree, `${at}: devices disagree after two syncs each`);
      assert.ok(s.rounds && s.recWagered && s.recNet, `${at}: Records are off`);
      assert.ok(s.card, `${at}: the card is off`);
      assert.ok(s.books, `${at}: the stack isn’t 1,000 + wins and losses + stakes + the cage’s cover`);
      assert.ok(s.lowest >= 0 && s.chips >= 0, `${at}: the stack went below 0`);
      assert.ok(s.kept <= s.taps, `${at}: more stakes than were taken`);
    }
  }
});

test('nothing below 0, however broken the copy', () => {
  const d = L.cleanCage({ dev: { x: { t: 5000, p: 10 } } });
  assert.equal(L.cageTotals(d).chips, 0);
  assert.equal(d.forgiven, 3990);
  assert.equal(L.cageTotals(L.cleanCage({ dev: { x: { t: -5, p: 'lots', w: NaN } }, stakes: { 1: { amount: 9 }, x: {} }, forgiven: -3 })).chips, 1000);
  assert.equal(L.take(L.cleanCage(null), 'x', 1001), false, 'a device can’t bet chips it doesn’t see');
  // a file from somewhere else can't reach an object's prototype
  const evil = L.cleanCage(JSON.parse('{"dev":{"__proto__":{"t":5}}}'));
  assert.equal(Object.getPrototypeOf(evil.dev), Object.prototype);
  assert.equal(L.cageTotals(evil).chips, 1000);
});

test('a device says what it has out on the felt only when it changed, and others count it for a day', () => {
  const d = L.cleanCage(null), H = 3600e3;
  assert.equal(L.publishFelt(d, 'a', {}, 0), false, 'nothing to say, and no section yet');
  assert.equal(L.publishFelt(d, 'a', { craps: 200 }, 1000), true);
  assert.equal(L.publishFelt(d, 'a', { craps: 200 }, 2 * H), false, 'the same, and said recently');
  assert.equal(L.publishFelt(d, 'a', { craps: 200 }, 7 * H), true, 'said again after six hours');
  assert.deepEqual(L.feltElsewhere(d, 'b', 8 * H), { tables: { craps: 200 }, devices: 1 });
  assert.deepEqual(L.feltElsewhere(d, 'a', 8 * H), { tables: {}, devices: 0 }, 'not its own');
  assert.deepEqual(L.feltElsewhere(d, 'b', 32 * H), { tables: {}, devices: 0 }, 'not after a day without word');
  assert.equal(L.publishFelt(d, 'a', {}, 9 * H), true, 'all settled');
  assert.deepEqual(L.feltElsewhere(d, 'b', 9 * H).tables, {});
});

test('Records put together: counters summed, the biggest win and the earliest day kept', () => {
  const a = L.cleanRecords(null), b = L.cleanRecords(null);
  L.note(a, 'P', 'craps', { wagered: 10, back: 70, add: { pointsMade: 1 }, top: { longestHand: 9 } }, '2026-11-20');
  L.note(b, 'L', 'craps', { wagered: 10, back: 70, add: { pointsMade: 2 }, top: { longestHand: 4 } }, '2026-11-18');
  L.note(b, 'L', 'craps', { wagered: 5, back: 0 }, '2026-11-21');
  const t = L.recordsTotals(L.mergeRecords(a, b));
  assert.equal(t.since, '2026-11-18');
  assert.deepEqual(t.tables.craps, { rounds: 3, wagered: 25, net: 115, best: 60, bestOn: '2026-11-18', pointsMade: 3, longestHand: 9 });
  // note says when a round is the biggest win across every device
  assert.deepEqual(L.note(a, 'P', 'craps', { wagered: 10, back: 60 }, '2026-11-22'), { won: 50, best: false, first: false });
  // and when it's the first round at a table
  assert.deepEqual(L.note(a, 'P', 'roulette', { wagered: 10, back: 0 }, '2026-11-22'), { won: -10, best: false, first: true });
  assert.deepEqual(L.note(a, 'P', 'roulette', { wagered: 10, back: 360 }, '2026-11-22'), { won: 350, best: true, first: false });
});

test('cageFrom sets up a cage with the totals asked for', () => {
  const d = L.cageFrom({ chips: 3, wagered: 12000, high: 1100, stakes: 2 });
  assert.deepEqual(L.cageTotals(d), { chips: 3, wagered: 12000, high: 1100, stakes: 2 });
});

test('the player\'s card announced: kept from 0 to 3, and the higher of two copies, in either order', () => {
  assert.equal(L.cleanCage(null).told, 0);
  assert.equal(L.cleanCage({ told: 2 }).told, 2);
  assert.equal(L.cleanCage({ told: 9 }).told, 3);
  assert.equal(L.cleanCage({ told: 'silver' }).told, 0);
  const a = L.cleanCage({ told: 1 }), b = L.cleanCage({ told: 2 });
  assert.equal(L.mergeCage(a, b).told, 2);
  assert.equal(L.canon(L.mergeCage(a, b)), L.canon(L.mergeCage(b, a)));
  assert.equal(L.mergeBody(L.cleanBody({ app: 'house-money', cage: a }), L.cleanBody({ app: 'house-money', cage: b })).cage.told, 2);
});

test('milestones put together: every one earned on either copy, on the earlier day, in either order', () => {
  const a = L.cleanRecords({ ms: { royal: '2026-11-30', tie: '2026-11-20', junk: 'soon', __proto__: { x: 1 } } });
  const b = L.cleanRecords({ ms: { royal: '2026-11-28', sevens: '2026-11-29' } });
  assert.deepEqual(a.ms, { royal: '2026-11-30', tie: '2026-11-20' });
  assert.deepEqual(L.mergeRecords(a, b).ms, { royal: '2026-11-28', sevens: '2026-11-29', tie: '2026-11-20' });
  assert.equal(L.canon(L.mergeRecords(a, b)), L.canon(L.mergeRecords(b, a)));
  assert.equal(L.canon(L.mergeRecords(a, L.mergeRecords(a, b))), L.canon(L.mergeRecords(a, b)));
  // a file from before milestones has none
  assert.deepEqual(L.cleanRecords({ v: 1, dev: {} }).ms, {});
});

test('Start over: the copy with the later marker is kept whole, in either order, and play after it adds up as usual', () => {
  // a phone and a laptop that have played and synced
  const phone = { cage: L.cleanCage(null), records: L.cleanRecords(null) };
  assert.ok(L.take(phone.cage, 'P', 300)); L.note(phone.records, 'P', 'craps', { wagered: 300, back: 0 }, '2026-11-20');
  phone.records.ms.royal = '2026-11-20';
  const laptop = { cage: L.mergeCage(phone.cage, null), records: L.mergeRecords(phone.records, null) };
  assert.ok(L.take(laptop.cage, 'L', 100)); L.pay(laptop.cage, 'L', 400); L.note(laptop.records, 'L', 'roulette', { wagered: 100, back: 400 }, '2026-11-21');
  // the phone starts over; the laptop, not yet told, plays on
  const fresh = L.startOver('P', 5000);
  assert.deepEqual(L.cageTotals(fresh.cage), { chips: 1000, wagered: 0, high: 1000, stakes: 1 });
  assert.deepEqual([fresh.records.dev, fresh.records.ms, fresh.cage.told], [{}, {}, 0]);
  assert.ok(L.take(laptop.cage, 'L', 50));
  for (const [x, y] of [[fresh, laptop], [laptop, fresh]]) {
    const c = L.mergeCage(x.cage, y.cage), r = L.mergeRecords(x.records, y.records);
    assert.equal(L.canon(c), L.canon(fresh.cage), 'the old cage came back');
    assert.equal(L.canon(r), L.canon(fresh.records), 'the old Records came back');
  }
  // a file from Drive keeps the marker
  assert.deepEqual(L.cleanBody(JSON.parse(JSON.stringify({ app: 'house-money', ...fresh }))).cage.reset, { at: 5000, by: 'P' });
  // after it, both play on the same marker and put together as usual
  const p2 = { cage: structuredClone(fresh.cage), records: structuredClone(fresh.records) };
  const l2 = { cage: L.mergeCage(laptop.cage, fresh.cage), records: L.mergeRecords(laptop.records, fresh.records) };
  assert.ok(L.take(p2.cage, 'P', 10)); L.note(p2.records, 'P', 'blackjack', { wagered: 10, back: 0 }, '2026-11-22');
  assert.ok(L.take(l2.cage, 'L', 20)); L.pay(l2.cage, 'L', 40); L.note(l2.records, 'L', 'blackjack', { wagered: 20, back: 40 }, '2026-11-22');
  const c = L.mergeCage(p2.cage, l2.cage), r = L.mergeRecords(l2.records, p2.records);
  assert.equal(L.cageTotals(c).chips, 1010);
  assert.equal(L.recordsTotals(r).tables.blackjack.rounds, 2);
  assert.deepEqual(c.reset, { at: 5000, by: 'P' });
  assert.equal(L.canon(L.mergeCage(c, l2.cage)), L.canon(c));
  // a later Start over wins over an earlier one; the device breaks a tie
  const b = L.startOver('L', 6000), a2 = L.startOver('A', 6000);
  assert.deepEqual(L.mergeCage(fresh.cage, b.cage).reset, { at: 6000, by: 'L' });
  assert.deepEqual(L.mergeCage(b.cage, a2.cage).reset, L.mergeCage(a2.cage, b.cage).reset);
});

test('a device saving to Drive for the first time after a Start over there: its play joins the rest', () => {
  // the phone started over and played on to 1,200; a laptop that never saved there is at 3,000, with a Start over of
  // its own before that
  const drive = L.startOver('P', 5000);
  L.pay(drive.cage, 'P', 200); L.note(drive.records, 'P', 'roulette', { wagered: 100, back: 300 }, '2026-11-22');
  const own = L.startOver('L', 9000);
  L.pay(own.cage, 'L', 2000); L.note(own.records, 'L', 'blackjack', { wagered: 500, back: 2500 }, '2026-11-22');
  // put together as it is, the laptop's later marker would win and drop the phone's play
  assert.equal(L.cageTotals(L.mergeCage(own.cage, drive.cage)).chips, 3000);
  const joined = L.joining({ app: 'house-money', v: 1, ...own, seen: {} }, drive);
  assert.deepEqual([joined.app, joined.seen], ['house-money', {}], 'the rest of the body stays');
  for (const [x, y] of [[joined, drive], [drive, joined]]) {
    const c = L.mergeCage(x.cage, y.cage), r = L.mergeRecords(x.records, y.records);
    assert.equal(L.cageTotals(c).chips, 3200);
    assert.deepEqual(c.reset, { at: 5000, by: 'P' });
    assert.deepEqual([r.reset, Object.keys(L.recordsTotals(r).tables).sort()], [{ at: 5000, by: 'P' }, ['blackjack', 'roulette']]);
  }
  // Drive never started over: the laptop's own marker goes, and it still joins
  const plain = { cage: L.cleanCage(null), records: L.cleanRecords(null) };
  L.pay(plain.cage, 'P', 50);
  const j2 = L.joining(own, plain);
  assert.equal(j2.cage.reset, null);
  assert.equal(L.cageTotals(L.mergeCage(j2.cage, plain.cage)).chips, 3050);
});

// One long sitting at every table, played the way each page plays it, with the books checked after every round: every
// chip taken is paid back, kept or lost exactly once (counting the fractions blackjack, craps and baccarat keep), the
// round leaves nothing held, and at the end the stack plus what's on the felt comes to 1,000 a stake plus what Records
// says was won or lost. Seeded, so a failure comes back the same every time.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};
const events = new EventTarget();
globalThis.addEventListener = events.addEventListener.bind(events);
globalThis.dispatchEvent = events.dispatchEvent.bind(events);

const cage = await import('../shared/cage.js');
const records = await import('../shared/records.js');
const { seeded, pickStops, window: view, evalLines, keeper } = await import('../shared/reels.js');
const bj = await import('../blackjack/js/game.js');
const R = await import('../roulette/js/wheel.js');
const cr = await import('../craps/js/game.js');
const bac = await import('../baccarat/js/game.js');
const vp = await import('../video-poker/js/poker.js');
const CB = await import('../cherry-bell/js/machine.js');
const OE = await import('../odds-and-ends/js/machine.js');
const ML = await import('../motherlode/js/machine.js');

const ROUNDS = 3000;
// Before each round: the cage's stake when the rack is under 10 and nothing's out, as the page offers it.
const topUp = (felt = 0) => { if (cage.read().chips < cage.LOW && felt === 0) cage.stake({ id: 'none', felt: 0 }); };
// At the end: the stack, plus the felt, is 1,000 for every stake plus the net Records keeps for this table.
const books = (id, felt = 0) => {
  const c = cage.read();
  assert.equal(c.chips + felt, cage.START * c.stakes + records.table(id).net, `${id}: the chips don't add up`);
};

test('blackjack: every chip and half chip accounted for, over a long sitting with odd bets', () => {
  store.clear();
  const rng = seeded(7), s = bj.fresh(rng);
  for (let i = 0; i < ROUNDS; i++) {
    topUp();
    const bet = [10, 15, 25, 35][i % 4];
    if (cage.read().chips < bet) { if (cage.read().chips < 10) break; continue; }
    const carry0 = s.carry, c0 = cage.read().chips;
    let taken = bet; cage.take(bet); s.bet = bet; bj.deal(s, rng);
    if (s.phase === 'insurance') { const h = Math.floor(s.hands[0].bet / 2); if (i % 3 === 0 && cage.take(h)) { taken += h; bj.insure(s, h); } else bj.insure(s, 0); }
    while (s.phase === 'play') {
      let a = bj.book(s).act;
      if ((a === 'double' || a === 'split') && !cage.take(bj.hand(s).bet)) a = 'hit'; else if (a === 'double' || a === 'split') taken += bj.hand(s).bet;
      bj[a](s, rng);
    }
    while (bj.dealerStep(s, rng));
    if (s.phase === 'dealer') bj.settle(s);
    const o = s.outcome;
    assert.equal(o.wagered, taken);
    // in halves of a chip: what the hands are owed, against what's paid now and what's kept
    let owed = o.insurance * 2;
    for (const h of s.hands) owed += { surrender: h.bet, blackjack: h.bet * 5, win: h.bet * 4, push: h.bet * 2 }[h.result] || 0;
    assert.equal(o.back * 2 + s.carry - carry0, owed, 'the half-chip ledger');
    if (o.back) cage.pay(o.back);
    s.paid = true;
    records.note('blackjack', { wagered: o.wagered, back: o.back });
    assert.equal(cage.read().chips, c0 - taken + o.back);
    bj.clear(s);
    assert.deepEqual([s.hands.length, s.dealer.length, s.bet, s.insurance], [0, 0, 0, 0], 'the table is clear');
  }
  books('blackjack');
});

test('craps: bets on the layout, odds fractions and winnings all add up, roll after roll', () => {
  store.clear();
  const rng = seeded(11), s = cr.fresh();
  const put = (k, n) => { const c = cr.can(s, k, 500); n = Math.min(n, c.room); if (c.ok && n > 0 && cage.take(n)) s.bets[k] = (s.bets[k] || 0) + n; };
  let owed30 = 0, paid30 = 0;   // odds wins at exact true odds, in thirtieths, against what came back in whole chips
  const TRUE = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] }, LAY = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };
  for (let i = 0; i < ROUNDS * 3; i++) {
    topUp(cr.onFelt(s));
    if (!s.point) { put('pass', 5); put('dontPass', 7); }
    else { put('passOdds', 25); put('dontOdds', 30); put('come', 5); for (const n of cr.POINTS) put(`comeOdds${n}`, 15); put('place6', 6); put('field', 1); }
    if (!cr.onFelt(s)) continue;
    const felt0 = cr.onFelt(s), c0 = cage.read().chips, carry0 = s.carry, was = s.point;
    const r = cr.roll(s, cr.die(rng), cr.die(rng));
    const lost = r.events.filter(e => e.outcome === 'lose').reduce((a, e) => a + e.stake, 0);
    const won = r.events.filter(e => e.outcome === 'win').reduce((a, e) => a + e.win, 0);
    assert.equal(felt0 + won, cr.onFelt(s) + r.toRack + lost, 'every chip on the layout is still there, back in the rack, or lost');
    for (const e of r.events) {
      if (e.outcome !== 'win') continue;
      const m = /^(passOdds|dontOdds|comeOdds|dcomeOdds)(\d*)$/.exec(e.spot);
      if (!m) continue;
      const n = +m[2] || was, [to, fr] = (/^d/.test(m[1]) ? LAY : TRUE)[n];
      owed30 += e.stake * to * (cr.CARRY / fr); paid30 += e.win * cr.CARRY;
    }
    assert.equal(paid30 + s.carry, owed30, 'odds pay true odds exactly, with the fraction kept');
    for (const k of Object.keys(s.bets)) {
      const m = /^(comeOdds|dcomeOdds)(\d+)$/.exec(k);
      if (m) assert.ok(s.bets[(m[1] === 'comeOdds' ? 'come' : 'dcome') + m[2]], `${k} without its bet`);
      if (k === 'passOdds') assert.ok(s.point && s.bets.pass, 'odds without a pass bet');
      if (k === 'dontOdds') assert.ok(s.point && s.bets.dontPass, 'lay odds without a don’t pass bet');
    }
    if (r.toRack) cage.pay(r.toRack);
    if (r.wagered || r.back) records.note('craps', { wagered: r.wagered, back: r.back });
    assert.equal(cage.read().chips, c0 + r.toRack);
    void carry0;
  }
  books('craps', cr.onFelt(s));
});

test('baccarat: the Banker’s commission comes to exactly 5%, and the shoe is changed before it runs out', () => {
  store.clear();
  const rng = seeded(13), s = bac.fresh(rng);
  for (let i = 0; i < ROUNDS; i++) {
    topUp();
    const bets = { player: 0, banker: [10, 15, 25][i % 3], tie: i % 5 ? 0 : 5, pp: 0, bp: i % 7 ? 0 : 5 };
    const total = bac.staked(bets);
    if (cage.read().chips < total) { if (cage.read().chips < 10) break; continue; }
    const c0 = cage.read().chips, carry0 = s.carry;
    cage.take(total); s.bets = { ...bets };
    const before = s.shoe.length;
    bac.deal(s, rng);
    assert.ok(s.shuffled || before - s.shoe.length >= 4, 'cards came from the shoe');
    assert.ok(s.shoe.length >= bac.CUT - 6, 'dealt past the cut card');
    s.turned = []; while (s.phase === 'reveal') { s.turned = bac.out(s); if (bac.advance(s) === null) break; }
    const o = bac.settle(s), c = s.coup, b = s.bets;
    const tw = (c.winner === 'P' ? b.player * 40 : 0) + (c.winner === 'B' ? b.banker * 39 : 0)
      + (c.winner === 'T' ? (b.player + b.banker) * 20 + b.tie * 180 : 0) + (c.pPair ? b.pp * 240 : 0) + (c.bPair ? b.bp * 240 : 0);
    assert.equal(o.back * 20 + s.carry - carry0, tw, 'the twentieths ledger');
    if (o.back) cage.pay(o.back);
    s.paid = true;
    records.note('baccarat', { wagered: o.wagered, back: o.back });
    assert.equal(cage.read().chips, c0 - total + o.back);
    bac.clear(s);
    assert.equal(bac.staked(s.bets), 0);
  }
  books('baccarat');
});

test('roulette and video poker: a long sitting adds up', () => {
  store.clear();
  const rng = seeded(17);
  for (let i = 0; i < ROUNDS; i++) {
    topUp();
    const bets = { red: 5, n17: 1, 'c17': 2, d2: 3 }, total = 11;
    if (!cage.take(total)) continue;
    const r = R.settle(bets, R.draw(rng));
    if (r.back) cage.pay(r.back);
    records.note('roulette', { wagered: r.wagered, back: r.back });
  }
  books('roulette');
  store.clear();
  const s = vp.fresh();
  for (let i = 0; i < ROUNDS; i++) {
    topUp();
    s.coins = 5; s.coin = 1;
    if (!cage.take(5)) continue;
    vp.deal(s, rng); s.held = vp.advise(s.hand).held; vp.draw(s);
    assert.equal(new Set(s.hand.map(c => c.r + c.s)).size, 5, 'five different cards');
    const pay = s.result?.pay || 0;
    if (pay) cage.pay(pay);
    records.note('video-poker', { wagered: 5, back: pay });
  }
  books('video-poker');
});

test('the slot machines: spins add up, and Motherlode’s free spins leave nothing behind when they end', () => {
  for (const id of ['cherry-bell', 'odds-and-ends', 'motherlode']) {
    store.clear();
    const rng = seeded(19);
    const keep = keeper(id, { bet: 20, free: null }), s = keep.state;
    for (let i = 0; i < ROUNDS * 2; i++) {
      if (!s.free) topUp();
      const free = !!s.free;
      const bet = id === 'cherry-bell' ? 3 : id === 'odds-and-ends' ? 5 : free ? s.free.bet : 20;
      if (!free && !keep.stake(bet)) { if (cage.read().chips < 10) break; continue; }
      let win;
      if (id === 'cherry-bell') win = CB.pay(view(CB.REELS, pickStops(CB.REELS, rng), CB.ROWS, CB.ANCHOR), 3).coins;
      else if (id === 'odds-and-ends') win = evalLines(view(OE.REELS, pickStops(OE.REELS, rng), OE.ROWS, OE.ANCHOR), OE.LINES, OE.PAYS, { wild: OE.WILD }).reduce((a, w) => a + w.pay, 0);
      else {
        const sticky = free ? s.free.sticky : [];
        const r = ML.play(pickStops(ML.REELS, rng), sticky);
        for (const [c, row] of sticky) assert.equal(r.grid[c][row], ML.WILD, 'a stuck pickaxe stays');
        win = r.units * (bet / ML.LINE_COUNT);
        if (free) { s.free.left -= 1; s.free.won += win; s.free.sticky = r.picks; if (s.free.left <= 0) s.free = null; }
        else if (r.free) s.free = { left: r.free, total: r.free, sticky: [], won: 0, bet };
        if (s.free) assert.ok(s.free.left > 0 && s.free.left <= s.free.total, 'free spins left');
      }
      assert.ok(Number.isInteger(win));
      keep.begin({ win, wagered: free ? 0 : bet });
      keep.settle();
      assert.equal(keep.felt(), 0, 'nothing left out on the machine');
    }
    books(id);
  }
});

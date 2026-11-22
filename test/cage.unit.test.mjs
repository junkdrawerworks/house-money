// The cage: chips off the stack and back, the stake when you run dry (and only with nothing left out on any table),
// the player's card, and the slot machines' chips in play. Runs against a stand-in for the browser's localStorage.
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
const { keeper } = await import('../shared/reels.js');
const { TABLES } = await import('../shared/tables.js');

const set = c => localStorage.setItem(cage.KEY, JSON.stringify({ wagered: 0, high: 1000, stakes: 1, ...c }));
const felt = (id, n) => localStorage.setItem(`house-money.${id}`, JSON.stringify({ felt: n }));
const fresh = () => store.clear();

test('a fresh cage holds 1,000 chips and one stake', () => {
  fresh();
  assert.deepEqual(cage.read(), { chips: 1000, wagered: 0, high: 1000, stakes: 1 });
});

test('take, pay and unwager move chips and keep the count of chips bet', () => {
  fresh();
  assert.equal(cage.take(100).chips, 900);
  assert.equal(cage.read().wagered, 100);
  assert.equal(cage.take(901), null, 'more than the stack is refused');
  assert.equal(cage.read().chips, 900, 'and takes nothing');
  assert.equal(cage.take(0), null);
  assert.equal(cage.pay(250).chips, 1150);
  assert.equal(cage.read().high, 1150);
  // a bet picked back up before it played comes off the count too
  cage.take(40);
  const c = cage.pay(40, { unwager: 40 });
  assert.deepEqual([c.chips, c.wagered], [1150, 100]);
  // moving chips that were already bet isn't a new wager
  cage.take(10, { wager: false });
  assert.equal(cage.read().wagered, 100);
});

test('every table saves its chips out on the felt, and the cage adds them up', () => {
  fresh();
  assert.equal(cage.feltAll(), 0);
  felt('craps', 500); felt('roulette', 15);
  assert.equal(cage.feltAll(), 515);
  assert.deepEqual(cage.out().map(t => [t.id, t.felt]), [['roulette', 15], ['craps', 500]]);
  // the table you're at counts what it has out now, not what it last saved
  assert.equal(cage.feltAll({ id: 'roulette', felt: 0 }), 500);
  assert.equal(cage.feltAll({ id: 'blackjack', felt: 25 }), 540);
  // a missing or broken save counts as nothing out
  localStorage.setItem('house-money.baccarat', '{oops');
  localStorage.setItem('house-money.video-poker', JSON.stringify({ felt: -4 }));
  assert.equal(cage.feltAll(), 515);
  assert.ok(TABLES.every(t => typeof t.id === 'string'));
});

test('the cage offers a stake under 10 chips, only with nothing out on any table', () => {
  fresh();
  set({ chips: 10 });
  assert.equal(cage.canStake(), false, '10 chips is enough to play on');
  set({ chips: 9 });
  assert.equal(cage.canStake(), true);
  set({ chips: 3 });
  for (const t of TABLES) {
    felt(t.id, 5);
    assert.equal(cage.canStake(), false, `5 on ${t.id}'s felt`);
    assert.equal(cage.canStake({ id: TABLES.find(x => x.id !== t.id).id, felt: 0 }), false, `5 on ${t.id}'s felt, seen from another table`);
    felt(t.id, 0);
  }
  assert.equal(cage.canStake(), true);
  // at a table with a bet down that it hasn't saved yet
  assert.equal(cage.canStake({ id: 'roulette', felt: 5 }), false);
});

test('a stake adds another 1,000 to what you have, and counts it', () => {
  fresh();
  set({ chips: 6, wagered: 4000 });
  const c = cage.stake();
  assert.deepEqual([c.chips, c.stakes, c.wagered], [1006, 2, 4000]);
  assert.equal(cage.stake(), null, 'not again: 1,006 is plenty');
  assert.equal(cage.read().stakes, 2);
  set({ chips: 0, stakes: 4 });
  assert.deepEqual([cage.stake().chips, cage.read().stakes], [1000, 5]);
});

test('no stake while chips are out on a table', () => {
  fresh();
  set({ chips: 3 });
  felt('craps', 500);
  assert.equal(cage.stake(), null);
  assert.equal(cage.stake({ id: 'blackjack', felt: 0 }), null);
  assert.deepEqual([cage.read().chips, cage.read().stakes], [3, 1]);
  felt('craps', 0);
  assert.equal(cage.stake({ id: 'roulette', felt: 2 }), null, 'a bet down at this table counts too');
  assert.equal(cage.stake({ id: 'roulette', felt: 0 }).chips, 1003);
});

test('the books balance: chips plus felt is 1,000 a stake plus what the tables won or lost', () => {
  fresh();
  let net = 0;
  const books = () => cage.read().chips + cage.feltAll() === cage.START * cage.read().stakes + net;
  // lose down to 6, get staked, win a little, lose it all, get staked again
  cage.take(994); net -= 994; assert.ok(books());
  cage.stake(); assert.ok(books());
  cage.take(100); cage.pay(150); net += 50; assert.ok(books());
  cage.take(1056); net -= 1056; assert.equal(cage.read().chips, 0); assert.ok(books());
  cage.stake(); assert.ok(books());
  assert.equal(cage.read().stakes, 3);
});

test('the player\'s card: the tiers turn over exactly at 10,000, 50,000 and 250,000 bet', () => {
  const at = w => cage.tier(w).id;
  assert.deepEqual([at(0), at(9999), at(10000), at(49999), at(50000), at(249999), at(250000), at(1e7)],
    ['red', 'red', 'silver', 'silver', 'gold', 'gold', 'black', 'black']);
  assert.equal(cage.tier(9000).toNext, 1000);
  assert.equal(cage.tier(250000).next, null);
  fresh();
  set({ chips: 100, wagered: 50000 });
  assert.equal(cage.maxBet(500), 2500);
});

test('a slot machine counts the chips in a spin as out on the felt until the spin is paid', () => {
  fresh();
  set({ chips: 12 });
  const k = keeper('cherry-bell', { coins: 3, coin: 1 });
  assert.equal(k.felt(), 0);
  assert.equal(k.stake(3), true);
  assert.equal(cage.canStake({ id: 'cherry-bell', felt: k.felt() }), false, 'the cage waits on the spin');
  k.begin({ stops: [1, 2, 3], win: 0, wagered: 3 });
  assert.equal(k.felt(), 3);
  assert.equal(JSON.parse(localStorage.getItem('house-money.cherry-bell')).felt, 3, 'and says so to the floor and other tabs');
  assert.equal(cage.canStake(), false);
  k.settle();
  assert.equal(k.felt(), 0);
  assert.equal(JSON.parse(localStorage.getItem('house-money.cherry-bell')).felt, 0);
  assert.equal(cage.canStake(), true, '9 chips and nothing out: now the cage offers');
  // a pull the stack can't cover holds nothing
  set({ chips: 2 });
  assert.equal(k.stake(3), false);
  assert.equal(k.felt(), 0);
  // a free spin bets nothing
  assert.equal(k.stake(0), true);
  k.begin({ stops: [0, 0, 0], win: 40, wagered: 0 });
  assert.equal(k.felt(), 0);
  k.settle();
  assert.equal(cage.read().chips, 42);
});

test('the cage event fires with the chips already counted as out at the machine', () => {
  fresh();
  set({ chips: 12 });
  const k = keeper('odds-and-ends', {});
  let seen = null;
  const hear = () => { seen = cage.canStake({ id: 'odds-and-ends', felt: k.felt() }); };
  addEventListener('house-money:cage', hear);
  k.stake(5);
  events.removeEventListener('house-money:cage', hear);
  assert.equal(seen, false, 'the offer would have flashed up as the bet went in');
});

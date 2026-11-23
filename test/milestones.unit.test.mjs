// Milestones: what earns each one, that each is earned once, and what the table says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONES, earned, said } from '../shared/milestones.js';
import { TABLES } from '../shared/tables.js';

const all = Object.fromEntries(TABLES.map(t => [t.id, { rounds: 1 }]));
const one = (c, have = {}) => earned({ tables: { [c.id || 'blackjack']: { rounds: 1 } }, ...c }, have);

test('about twenty milestones, each with its own id, title and line', () => {
  assert.ok(MILESTONES.length >= 18 && MILESTONES.length <= 22);
  assert.equal(new Set(MILESTONES.map(m => m.id)).size, MILESTONES.length);
  for (const m of MILESTONES) assert.ok(m.title && /\.$/.test(m.what), m.id);
});

test('what earns each one', () => {
  assert.deepEqual(one({ id: 'blackjack', add: { blackjacks: 1, won: 1 } }), ['blackjack']);
  assert.deepEqual(one({ id: 'blackjack', add: { blackjacks: 0, won: 1 } }), []);
  assert.deepEqual(one({ id: 'roulette', add: { straightHits: 1 } }), ['straight-up']);
  assert.deepEqual(one({ id: 'craps', top: { longestHand: 9 } }), []);
  assert.deepEqual(one({ id: 'craps', top: { longestHand: 10 } }), ['hot-hand']);
  assert.deepEqual(one({ id: 'craps', top: { longestHand: 20 } }), ['hot-hand', 'on-fire']);
  assert.deepEqual(one({ id: 'baccarat', add: { tie: 1 } }), [], 'a tie with nothing on it');
  assert.deepEqual(one({ id: 'baccarat', add: { tie: 1 }, marks: ['tie'] }), ['tie']);
  assert.deepEqual(one({ id: 'video-poker', add: { royal: 1 } }), ['royal']);
  assert.deepEqual(one({ id: 'video-poker', add: { 'straight-flush': 1 } }), ['straight-flush']);
  assert.deepEqual(one({ id: 'video-poker', add: { four: 1 } }), ['four']);
  assert.deepEqual(one({ id: 'cherry-bell', marks: ['sevens'] }), ['sevens']);
  assert.deepEqual(one({ id: 'odds-and-ends', add: { jackpots: 1 } }), ['pennies']);
  assert.deepEqual(one({ id: 'motherlode', add: { features: 1 } }), ['free-spins']);
  assert.deepEqual(one({ id: 'motherlode', marks: ['lode'] }), ['mother-lode']);
  // the other tables' marks and counters don't count somewhere else
  assert.deepEqual(one({ id: 'craps', marks: ['sevens', 'tie', 'lode'], add: { royal: 1, jackpots: 1 } }), []);
  assert.deepEqual(one({ won: 999 }), []);
  assert.deepEqual(one({ won: 1000 }), ['four-figures']);
  assert.deepEqual(one({ cage: { chips: 500, high: 10000, wagered: 0 } }), ['ten-k']);
  assert.deepEqual(one({ cage: { chips: 500, high: 100000, wagered: 0 } }), ['ten-k', 'hundred-k']);
  assert.deepEqual(one({ cage: { chips: 0, high: 0, wagered: 9999 } }), []);
  assert.deepEqual(one({ cage: { chips: 0, high: 0, wagered: 250000 } }), ['silver', 'gold', 'black']);
  assert.deepEqual(earned({ tables: { ...all, craps: { rounds: 0 } } }), []);
  assert.deepEqual(earned({ tables: all }), ['grand-tour']);
  assert.deepEqual(earned({ tables: { blackjack: { rounds: 999 } } }), []);
  assert.deepEqual(earned({ tables: { blackjack: { rounds: 600 }, craps: { rounds: 400 } } }), ['regular']);
});

test('a milestone already earned isn\'t earned again', () => {
  assert.deepEqual(one({ id: 'video-poker', add: { royal: 1 }, won: 4000 }, { royal: '2026-11-30' }), ['four-figures']);
  assert.deepEqual(one({ id: 'video-poker', add: { royal: 1 }, won: 4000 }, { royal: '2026-11-30', 'four-figures': '2026-11-01' }), []);
});

test('what the table says', () => {
  assert.equal(said('blackjack'), 'That’s a milestone: first blackjack.');
  assert.equal(said('ten-k'), 'That’s a milestone: 10,000 in the rack.');
  assert.equal(said('mother-lode'), 'That’s a milestone: the mother lode.');
  // a new player's card has its own line at the table already
  assert.equal(said('silver'), '');
  assert.equal(said('nothing'), '');
});

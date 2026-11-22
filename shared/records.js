// What each table has seen: rounds played, chips wagered, chips won or lost, the biggest single win, and the day it
// came. One key for the whole floor, read fresh every time, like the cage, and kept one section per device so Google
// Drive saving can add devices together (shared/ledger.js has the shape). read() adds it up:
//
//   { tables: { blackjack: { rounds, wagered, net, best, bestOn, ...extra } }, since }

import * as L from './ledger.js';

export const KEY = 'house-money.records';

// The words Records shows for each table's own counters (extra, added up) and bests (max, kept highest). Every key a
// table writes is here, or left out on purpose in test/records.unit.test.mjs.
export const EXTRA = {
  blackjack: { blackjacks: 'Blackjacks', won: 'Rounds won' },
  roulette: { straightHits: 'Straight-up hits', zeros: 'Zeros' },
  craps: { pointsMade: 'Points made', longestHand: 'Longest hand (rolls)' },
  baccarat: { player: 'Player wins', banker: 'Banker wins', tie: 'Ties', naturals: 'Naturals' },
  'video-poker': { royal: 'Royal flushes', 'straight-flush': 'Straight flushes', four: 'Four of a kind', 'full-house': 'Full houses' },
  'cherry-bell': { jackpots: 'Jackpots' },
  'odds-and-ends': { jackpots: 'Jackpots' },
  motherlode: { features: 'Free-spin features', feature: 'Most won in free spins' },
};

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// The whole ledger, for Drive saving; read() and table() are what the pages use.
export function doc() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet */ }
  return L.cleanRecords(r);
}
// Saves the ledger and tells the page's other parts (the floor's tiles, Records) to look again.
export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* full or off */ }
  dispatchEvent(new CustomEvent('house-money:records'));
}

// Every device's counters added up, counting since the earliest day any of them started (today, before any).
export function read() {
  const r = L.recordsTotals(doc());
  return { tables: r.tables, since: r.since || today() };
}

export function table(id) {
  return { rounds: 0, wagered: 0, net: 0, best: 0, bestOn: null, ...(read().tables[id] || {}) };
}

// One round settled at a table. wagered: everything bet on it; back: everything paid back to the rack (stakes
// included). extra: counters of the table's own, added up ({ blackjacks: 1 }); max: ones kept highest
// ({ longestHand: 9 }). Returns { won, best }: what the round came to, and whether it's the table's biggest win yet.
export function note(id, { wagered = 0, back = 0, extra = {}, max = {} } = {}) {
  const d = doc();
  const r = L.note(d, L.device(), id, { wagered, back, add: extra, top: max }, today());
  save(d);
  // a round just settled at a table (the table's own line about it comes next)
  dispatchEvent(new CustomEvent('house-money:round', { detail: { id } }));
  return r;
}

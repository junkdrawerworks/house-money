// What each table has seen: rounds played, chips wagered, chips won or lost, the biggest single win, and the day it
// came. One key for the whole floor, read fresh every time, like the cage, and kept one section per device so Google
// Drive saving can add devices together (shared/ledger.js has the shape). read() adds it up:
//
//   { tables: { blackjack: { rounds, wagered, net, best, bestOn, ...extra } }, since }
// sitting(id) is the same table since you sat down, kept on this device only (see the end).

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
// ({ longestHand: 9 }). Returns { won, best, first }: what the round came to, whether it's the table's biggest win yet,
// and whether it's the first round there. The house-money:round event that follows carries the same, with the id.
export function note(id, { wagered = 0, back = 0, extra = {}, max = {} } = {}) {
  const d = doc();
  const r = L.note(d, L.device(), id, { wagered, back, add: extra, top: max }, today());
  try { localStorage.setItem(SITTING, JSON.stringify(sittingAdd(getSitting(), id, { wagered, back }, Date.now()))); } catch { /* full or off */ }
  save(d);
  // a round just settled at a table (the table's own line about it comes next)
  dispatchEvent(new CustomEvent('house-money:round', { detail: { id, ...r } }));
  return r;
}

// ---------- this sitting ----------
// What's been played since you sat down: kept on this device only, under SITTING, and never saved to Google Drive.
// A sitting ends after an hour with no round played anywhere on the floor (a phone keeps a page open for days, so
// closing the page doesn't end one):
//   { at, tables: { blackjack: { rounds, wagered, back } } }   at: when the last round was played
export const SITTING = 'house-money.sitting';
export const AWAY = 3600e3;
const count = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
function getSitting() { try { return JSON.parse(localStorage.getItem(SITTING)); } catch { return null; } }

// The sitting still going at `now`: a fresh one once AWAY has passed since its last round.
export function sittingOf(x, now) {
  const at = count(x?.at);
  if (!at || now - at > AWAY || now < at - AWAY) return { at: 0, tables: {} };
  const tables = {};
  for (const [id, t] of Object.entries(x.tables && typeof x.tables === 'object' ? x.tables : {})) {
    if (id === '__proto__') continue;
    tables[id] = { rounds: count(t?.rounds), wagered: count(t?.wagered), back: count(t?.back) };
  }
  return { at, tables };
}
// One round more at table id, at `now`.
export function sittingAdd(x, id, { wagered = 0, back = 0 }, now) {
  const s = sittingOf(x, now);
  const t = (s.tables[id] ||= { rounds: 0, wagered: 0, back: 0 });
  t.rounds += 1; t.wagered += count(wagered); t.back += count(back);
  s.at = now;
  return s;
}
// This sitting at table id: { rounds, wagered, net }.
export function sitting(id) {
  const t = sittingOf(getSitting(), Date.now()).tables[id];
  return t ? { rounds: t.rounds, wagered: t.wagered, net: t.back - t.wagered } : { rounds: 0, wagered: 0, net: 0 };
}

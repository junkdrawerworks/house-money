// What each table has seen: rounds played, chips wagered, chips won or lost, the biggest single win, and the day it
// came. One key for the whole floor, read fresh every time, like the cage, and kept one section per device so Google
// Drive saving can add devices together (shared/ledger.js has the shape). read() adds it up:
//
//   { tables: { blackjack: { rounds, wagered, net, best, bestOn, ...extra } }, since }
// sitting(id) is the same table since you sat down, kept on this device only (see the end).

import * as L from './ledger.js';
import * as cage from './cage.js';
import * as M from './milestones.js';

export const KEY = 'house-money.records';

// The words Records shows for each table's own counters (extra, added up) and bests (max, kept highest). Every key a
// table writes is here, or left out on purpose in test/records.unit.test.mjs.
export const EXTRA = {
  blackjack: { blackjacks: 'Blackjacks', won: 'Rounds won' },
  roulette: { straightHits: 'Straight-up hits', zeros: 'Zeros' },
  craps: { pointsMade: 'Points made', longestHand: 'Longest hand (rolls)' },
  baccarat: { player: 'Player wins', banker: 'Banker wins', tie: 'Ties', naturals: 'Naturals' },
  // straight flushes, fours of a kind and full houses at Jacks or Better and Bonus Poker (with deuces wild they're everyday hands)
  'video-poker': { royal: 'Royal flushes', 'straight-flush': 'Straight flushes', four: 'Four of a kind', 'full-house': 'Full houses',
    'four-deuces': 'Four deuces', 'wild-royal': 'Wild royal flushes', five: 'Five of a kind' },
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

// The milestones earned: { royal: '2026-11-30' }.
export const milestones = () => doc().ms;

export function table(id) {
  return { rounds: 0, wagered: 0, net: 0, best: 0, bestOn: null, ...(read().tables[id] || {}) };
}

// One round settled at a table. wagered: everything bet on it; back: everything paid back to the rack (stakes
// included). extra: counters of the table's own, added up ({ blackjacks: 1 }); max: ones kept highest
// ({ longestHand: 9 }); marks: rare moments of the table's own, for the milestones (shared/milestones.js). Returns
// { won, best, first, milestones }: what the round came to, whether it's the table's biggest win yet, whether it's the
// first round there, and the milestones it earned. The house-money:round event that follows carries the same, with
// the id. (A table pays the round into the rack before it calls this, so the stack it's earned on is the new one.)
export function note(id, { wagered = 0, back = 0, extra = {}, max = {}, marks = [] } = {}) {
  const d = doc();
  const r = L.note(d, L.device(), id, { wagered, back, add: extra, top: max }, today());
  r.milestones = M.earned({ id, won: r.won, add: extra, top: max, marks, tables: L.recordsTotals(d).tables, cage: cage.read() }, d.ms);
  for (const k of r.milestones) d.ms[k] = today();
  try { localStorage.setItem(SITTING, JSON.stringify(sittingAdd(getSitting(d.reset), id, { wagered, back }, Date.now()))); } catch { /* full or off */ }
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
// The sitting saved here, or none if it began before a Start over (reset: Records' marker, here or from another device
// through Google Drive), so the next round doesn't add on to it.
function getSitting(reset = null) {
  let x = null;
  try { x = JSON.parse(localStorage.getItem(SITTING)); } catch { /* none, or storage off */ }
  return reset && count(x?.at) <= reset.at ? null : x;
}

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
// This sitting at table id: { rounds, wagered, net }. Nothing, after Start over (here, or on another device).
export function sitting(id) {
  const t = sittingOf(getSitting(doc().reset), Date.now()).tables[id];
  return t ? { rounds: t.rounds, wagered: t.wagered, net: t.back - t.wagered } : { rounds: 0, wagered: 0, net: 0 };
}

// ---------- Start over ----------
// Every chip, the player's card, every record and milestone and this sitting go back to the start: 1,000 chips, a Red
// card, nothing played. Sound, Quick play, the how-to-play sheets seen and each table's own choices stay. With Google
// Drive saving on, the reset marker it leaves (shared/ledger.js) takes every other device back to the start at its next
// sync. Not while chips are out on a table (here, or another device's) or free spins wait: then it does nothing and
// returns false.
export const FLOOR_CARD = 'house-money.floor-card';
export const canStartOver = () => !cage.out().length && !cage.waiting().length && !cage.elsewhere().length;
export function startOver() {
  if (!canStartOver()) return false;
  // later than any Start over this device has heard of, even one from a device whose clock runs ahead, so it can't lose
  // to an older one at the next sync
  const at = Math.max(Date.now(), ...[cage.doc().reset, doc().reset].map(r => (r?.at || 0) + 1));
  const fresh = L.startOver(L.device(), at);
  try { localStorage.removeItem(SITTING); localStorage.removeItem(FLOOR_CARD); } catch { /* storage off */ }
  cage.save(fresh.cage);
  save(fresh.records);
  return true;
}

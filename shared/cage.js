// House Money's cage: one stack of play chips for every table on the floor.
// A table takes chips off the stack when a bet goes down on the felt (take) and pays chips back when it wins or the
// bet comes back (pay). It's read fresh every time, so a table in another tab never gets overwritten by a stale copy.
// The chips aren't money and can't be bought: when the stack runs low with nothing left out on a table, the cage
// stakes another 1,000 (stake).
//
// Saved in localStorage under KEY, one section per device, so Google Drive saving can put devices together without
// losing or double-counting a chip (shared/ledger.js has the shape). read() adds it up:
//   { chips, wagered, high, stakes }
//   chips    the stack in your rack
//   wagered  every chip ever bet (the player's card counts this)
//   high     the most the stack has ever held
//   stakes   how many times the cage has staked you

import { TABLES } from './tables.js';
import * as L from './ledger.js';

export const KEY = 'house-money.cage';
export const START = L.START;     // the first stake, and every one after
export const LOW = 10;            // under this, with nothing out on any table, the cage offers a stake

const whole = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : NaN; };

// The whole ledger, for Drive saving; read() is what the tables use.
export function doc() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  return L.cleanCage(c);
}
export const read = () => L.cageTotals(doc());

// Saves the ledger and tells the page (and its other parts) what the stack holds now.
export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or off: the table plays on */ }
  const c = L.cageTotals(d);
  dispatchEvent(new CustomEvent('house-money:cage', { detail: c }));
  return c;
}

// Chips off the stack and onto the felt. null (and nothing taken) when there aren't enough.
// wager: false for chips that only move (a bet picked back up and put down again isn't a new wager)
export function take(n, { wager = true } = {}) {
  const k = whole(n);
  if (!(k > 0)) return null;
  const d = doc();
  if (!L.take(d, L.device(), k, wager)) return null;
  return save(d);
}

// Chips back into the rack: a win, or a bet picked back up. A bet picked back up before it played takes its
// wager back off the count too (unwager). wager: chips to count on the player's card as bet now, for a table that
// counts its bets as each one is decided rather than as the chips go down (craps), with or without chips to pay.
export function pay(n, { unwager = 0, wager = 0 } = {}) {
  const k = whole(n) || 0, w = whole(wager) || 0;
  if (!(k > 0) && !(w > 0)) return read();
  const d = doc();
  L.pay(d, L.device(), k, whole(unwager) || 0, w);
  return save(d);
}

// The chips out on each table's felt: every table saves its own as `felt` under house-money.<id>, and they're still
// yours until they're settled. own: { id, felt } from the table you're at, whose live count stands in for what it last
// saved (a bet goes down a moment before it's saved). Returns [{ id, name, felt }] for the tables with chips out.
export function out(own = null) {
  const list = [];
  for (const t of TABLES) {
    let n = 0;
    if (own && own.id === t.id) n = whole(own.felt) || 0;
    else {
      try {
        const s = JSON.parse(localStorage.getItem(`house-money.${t.id}`));
        n = (s && whole(s.felt)) || 0;
      } catch { /* nothing saved there, or not readable: nothing out */ }
    }
    if (n > 0) list.push({ id: t.id, name: t.name, felt: n });
  }
  return list;
}

export const feltAll = (own = null) => out(own).reduce((a, t) => a + t.felt, 0);

// Rounds that play on without chips from the rack: Motherlode's free spins, saved as `free` while any are left. They
// bet nothing, so nothing is out on the felt, but the round isn't over, and the cage waits on them as on chips out.
// own: { id, waiting } from the table you're at, whose live word stands in for what it last saved. [{ id, name }]
export function waiting(own = null) {
  const list = [];
  for (const t of TABLES) {
    let w = false;
    if (own && own.id === t.id && 'waiting' in own) w = !!own.waiting;
    else {
      try { w = !!JSON.parse(localStorage.getItem(`house-money.${t.id}`))?.free; } catch { /* nothing saved: nothing waiting */ }
    }
    if (w) list.push({ id: t.id, name: t.name });
  }
  return list;
}

// Chips another device said it had out on its tables when it last synced with Google Drive (and in the last day):
// [{ id, name, felt }], and how many devices. Still yours, so the cage waits on them too.
export function elsewhere() {
  const e = L.feltElsewhere(doc(), L.device(), Date.now());
  const list = TABLES.filter(t => e.tables[t.id] > 0).map(t => ({ id: t.id, name: t.name, felt: e.tables[t.id] }));
  return Object.assign(list, { devices: e.devices });
}

// The cage stakes you another START when you're down to less than LOW (or, at a table, less than its smallest bet,
// own.min: Motherlode's 20) with nothing out on any table and no free spins waiting, so the stack plus the felt always
// comes to START for every stake plus what the tables have won or lost, and the offer never comes mid-round. Returns
// the new cage, or null when you don't qualify. own: as for out() and waiting(), with the table's min.
export const low = (own = null) => Math.max(LOW, whole(own?.min) || 0);
export const canStake = (own = null) => read().chips < low(own) && feltAll(own) === 0 && !waiting(own).length && !elsewhere().length;

export function stake(own = null) {
  if (!canStake(own)) return null;
  const d = doc();
  L.stake(d, L.device(), Date.now());
  return save(d);
}

// The player's card: the more you've wagered, the higher the limits at every table.
export const TIERS = [
  { id: 'red', name: 'Red', at: 0, limit: 1 },
  { id: 'silver', name: 'Silver', at: 10000, limit: 2 },
  { id: 'gold', name: 'Gold', at: 50000, limit: 5 },
  { id: 'black', name: 'Black', at: 250000, limit: 10 },
];

export function tier(wagered = read().wagered) {
  let t = TIERS[0];
  for (const x of TIERS) if (wagered >= x.at) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1] || null;
  return { ...t, next, toNext: next ? next.at - wagered : 0 };
}

// The player's card a table has last announced, as its place in TIERS (0 is Red). told(i) records that card i has
// been announced: true if it hadn't been yet (in this tab, another one, or on another device that saves to Drive),
// and then it won't be again.
export const told = () => doc().told;
export function tell(i) {
  const d = doc();
  if (!(i > d.told)) return false;
  d.told = Math.min(TIERS.length - 1, i);
  save(d);
  return true;
}
export const tierIndex = (wagered = read().wagered) => TIERS.findIndex(t => t.id === tier(wagered).id);

// A table's top bet on your card: its base maximum times your tier's multiplier.
export const maxBet = base => base * tier().limit;

// Keeps a page's view of the stack current, whichever tab changed it.
export function watch(fn) {
  const run = () => fn(read());
  addEventListener('house-money:cage', run);
  addEventListener('storage', e => { if (e.key === KEY || e.key === null) run(); });
  run();
}

export const fmt = n => Math.round(n).toLocaleString('en-US');

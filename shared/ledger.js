// The books behind the cage and Records, kept so that two devices' copies can be put together without losing or
// double-counting a chip. Nothing here touches the page except device(), so it runs in Node for the tests.
//
// Every device keeps a section of its own, and only that device ever adds to it. Each number in a section only goes
// up, so of two copies of a section the larger number is always the newer one, and putting copies together is taking
// the larger of each: in either order, as often as you like, with nothing ever deleted.
//
// The cage, under house-money.cage:
//   { v: 1, dev: { <device>: { t, p, w, u, h, r, felt: { at, tables: { craps: 200 } } } },
//     stakes: { '2': { amount: 1000, by: <device>, at }, ... }, forgiven: 0, told: 0 }
//   t, p   chips ever taken off the stack on that device, and ever paid back into the rack there
//   w, u   chips ever wagered there, and wagers picked back up before they played
//   h      the most that device ever saw the stack hold; r: how many times it changed its section
//   felt   the chips it had out on each table when it last synced, so other devices count them as yours
//   stakes the cage's stakes after the first, by number: two devices that stake you in the same dry spell, each
//          without knowing about the other, take the same number, and it counts once
//   forgiven  what the cage covered when two devices bet the same chips while apart (see mergeCage)
//   told   the highest player's card a table has announced (0 Red, 1 Silver, 2 Gold, 3 Black), so it's said once,
//          whichever tab or device gets there; it only goes up, so of two copies the larger is the newer
//
// Records, under house-money.records:
//   { v: 1, dev: { <device>: { since, tables: { blackjack: { rounds, wagered, back, best, bestOn, add, top } } } } }
//   back is every chip paid back to the rack (up or down = back − wagered); add holds a table's own counters, summed
//   across devices ({ blackjacks: 3 }), and top the ones that keep the highest ({ longestHand: 9 }).
//
// What it guarantees: Records and the chips bet on the player's card come out exact whatever order devices sync in
// and however many syncs go missing. The stack comes out exact whenever each device syncs as it opens and as it's
// left. A device that plays from an out-of-date stack adds its own wins and losses to the shared one; the stack never
// goes below 0. Once the cage has covered something, the order of syncs between three or more devices out of touch
// can leave the stack a little higher than playing on one device would have.

export const START = 1000;
export const V = 1;
export const DEVICE = 'house-money.device';
// Chips out on another device's tables hold back the cage's stake for this long after that device last said so: a
// phone that was wiped or put away can't keep the cage shut for good.
export const FELT_AGE = 24 * 3600e3;
// How often a device says what it has out on the felt when nothing there has changed.
export const FELT_FRESH = 6 * 3600e3;

const NUMS = ['t', 'p', 'w', 'u', 'h', 'r'];
const COUNTS = ['rounds', 'wagered', 'back', 'best'];
const whole = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
// keys from a file someone else's device wrote: never ones that reach an object's prototype
const fine = k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
const entries = x => Object.entries(obj(x)).filter(([k]) => fine(k));
const keys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = v => (typeof v === 'string' && DAY.test(v) ? v : null);
const earlier = (a, b) => (!a ? b : !b ? a : a <= b ? a : b);

// The same object as JSON with every key in order, so two copies with the same contents compare equal.
export function canon(x) {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
  return JSON.stringify(x ?? null);
}

// ---------- this device ----------
export function newId() {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return `d-${[...a].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
// This device's id, made the first time and kept under DEVICE (and here, so storage that's off still gives one id).
let mine = null;
export function device() {
  let id = null;
  try { id = localStorage.getItem(DEVICE); } catch { /* storage off */ }
  if (id && /^d-[\w-]{1,40}$/.test(id)) return (mine = id);
  if (!mine) mine = newId();
  try { localStorage.setItem(DEVICE, mine); } catch { /* storage off */ }
  return mine;
}

// ---------- the cage ----------
const zero = () => ({ t: 0, p: 0, w: 0, u: 0, h: 0, r: 0 });
function cleanFelt(f) {
  const tables = {};
  for (const [t, n] of entries(obj(f).tables)) if (whole(n)) tables[t] = whole(n);
  return { at: whole(obj(f).at), tables };
}

// Anything (nothing saved, an old or broken save, a file from Drive) as a cage of the shape above, never below 0.
export function cleanCage(x) {
  x = obj(x);
  const dev = {};
  for (const [id, s] of entries(x.dev)) {
    const o = zero();
    for (const k of NUMS) o[k] = whole(obj(s)[k]);
    if (obj(s).felt) o.felt = cleanFelt(s.felt);
    dev[id] = o;
  }
  const stakes = {};
  for (const [n, s] of entries(x.stakes)) {
    if (!/^\d+$/.test(n) || +n < 2) continue;
    stakes[+n] = { amount: whole(obj(s).amount), by: String(obj(s).by || ''), at: whole(obj(s).at) };
  }
  return floor({ v: V, dev, stakes, forgiven: whole(x.forgiven), told: Math.min(3, whole(x.told)) });
}

// What the cage holds: { chips, wagered, high, stakes } (stakes counts the first 1,000 too).
export function cageTotals(d) {
  let net = 0, w = 0, h = 0, st = 0;
  for (const s of Object.values(d.dev)) { net += s.p - s.t; w += s.w - s.u; h = Math.max(h, s.h); }
  for (const s of Object.values(d.stakes)) st += s.amount;
  const chips = START + net + st + d.forgiven;
  return { chips, wagered: Math.max(0, w), high: Math.max(h, chips), stakes: 1 + Object.keys(d.stakes).length };
}

// The stack can't hold less than nothing. It only could when two devices bet the same chips while apart (a device
// can't on its own: take() refuses), and then the cage covers the difference.
function floor(d) {
  const c = cageTotals(d).chips;
  if (c < 0) d.forgiven += -c;
  return d;
}

// Two copies of the cage, put together: each device's numbers at their larger value (its felt from whichever copy
// said so later), the stakes of both by number (the larger amount where both have one), the larger cover and the
// higher card announced. Then,
// if the stack would be below 0, the cage covers it.
export function mergeCage(a, b) {
  a = cleanCage(a); b = cleanCage(b);
  const dev = {};
  for (const id of keys(a.dev, b.dev)) {
    const x = a.dev[id], y = b.dev[id];
    if (!x || !y) { dev[id] = structuredClone(x || y); continue; }
    const o = zero();
    for (const k of NUMS) o[k] = Math.max(x[k], y[k]);
    const f = !x.felt ? y.felt : !y.felt ? x.felt
      : y.felt.at !== x.felt.at ? (y.felt.at > x.felt.at ? y.felt : x.felt)
        : canon(y.felt) > canon(x.felt) ? y.felt : x.felt;
    if (f) o.felt = structuredClone(f);
    dev[id] = o;
  }
  const stakes = {};
  for (const n of keys(a.stakes, b.stakes)) {
    const x = a.stakes[n], y = b.stakes[n];
    stakes[n] = structuredClone(!x ? y : !y ? x
      : x.amount !== y.amount ? (x.amount > y.amount ? x : y)
        : canon(x) <= canon(y) ? x : y);
  }
  return floor({ v: V, dev, stakes, forgiven: Math.max(a.forgiven, b.forgiven), told: Math.max(a.told, b.told) });
}

const section = (d, id) => (d.dev[id] ||= zero());
const touched = (d, id) => { const s = section(d, id); s.r += 1; s.h = Math.max(s.h, cageTotals(d).chips); return d; };

// k chips off the stack on device id (wager: false for chips that only move). false, and nothing taken, when the
// stack doesn't hold k.
export function take(d, id, k, wager = true) {
  k = whole(k);
  if (!k || cageTotals(d).chips < k) return false;
  const s = section(d, id);
  s.t += k;
  if (wager) s.w += k;
  touched(d, id);
  return true;
}
// k chips back into the rack on device id; unwager: chips of it that were a wager picked back up before it played.
// wager: chips that count as bet now, without coming off the stack (a craps bet left up, counted each time a roll
// decides it).
export function pay(d, id, k, unwager = 0, wager = 0) {
  k = whole(k);
  const s = section(d, id);
  s.p += k;
  s.w += whole(wager);
  s.u += Math.min(whole(unwager), s.w - s.u);
  touched(d, id);
  return d;
}
// Another 1,000 from the cage, numbered one past the highest stake this device knows of.
export function stake(d, id, at = 0) {
  const n = Math.max(1, ...Object.keys(d.stakes).map(Number)) + 1;
  d.stakes[n] = { amount: START, by: id, at: whole(at) };
  touched(d, id);
  return n;
}
// This device says what it has out on each table ({ craps: 200 }). Only when that changed, or when it last said so
// more than FELT_FRESH ago, so a sync with nothing new to say writes nothing. true when it changed the cage.
export function publishFelt(d, id, tables, now) {
  const t = cleanFelt({ tables }).tables, s = d.dev[id];
  if (!s && !Object.keys(t).length) return false;
  const was = s?.felt;
  if (was && canon(was.tables) === canon(t) && now - was.at < FELT_FRESH) return false;
  section(d, id).felt = { at: whole(now), tables: t };
  return true;
}
// The chips other devices said they had out, if they said so within FELT_AGE: { tables: { craps: 200 }, devices }.
export function feltElsewhere(d, id, now) {
  const tables = {};
  let devices = 0;
  for (const [other, s] of Object.entries(d.dev)) {
    if (other === id || !s.felt || now - s.felt.at > FELT_AGE) continue;
    const list = Object.entries(s.felt.tables);
    if (list.length) devices += 1;
    for (const [t, n] of list) tables[t] = (tables[t] || 0) + n;
  }
  return { tables, devices };
}

// A cage holding these totals, all on one device: for setting up a test or a picture.
export function cageFrom({ chips = START, wagered = 0, high = 0, stakes = 1 } = {}, id = 'd-0000test') {
  const st = {};
  for (let n = 2; n <= stakes; n++) st[n] = { amount: START, by: id, at: 0 };
  const net = chips - START * Math.max(1, stakes);
  return cleanCage({ dev: { [id]: { t: Math.max(0, -net), p: Math.max(0, net), w: wagered, u: 0, h: high, r: 1 } }, stakes: st });
}

// ---------- Records ----------
function cleanTable(t) {
  t = obj(t);
  const o = { rounds: 0, wagered: 0, back: 0, best: 0, bestOn: null, add: {}, top: {} };
  for (const k of COUNTS) o[k] = whole(t[k]);
  o.bestOn = o.best ? day(t.bestOn) : null;
  for (const g of ['add', 'top']) for (const [k, v] of entries(t[g])) if (whole(v)) o[g][k] = whole(v);
  return o;
}
export function cleanRecords(x) {
  const dev = {};
  for (const [id, s] of entries(obj(x).dev)) {
    const tables = {};
    for (const [tb, t] of entries(obj(s).tables)) tables[tb] = cleanTable(t);
    dev[id] = { since: day(obj(s).since), tables };
  }
  return { v: V, dev };
}
// Two copies of Records, put together: each device's counters at their larger value, its biggest win from the copy
// with the larger one (the earlier day on a tie), and the earlier day it started counting.
export function mergeRecords(a, b) {
  a = cleanRecords(a); b = cleanRecords(b);
  const dev = {};
  for (const id of keys(a.dev, b.dev)) {
    const x = a.dev[id], y = b.dev[id];
    if (!x || !y) { dev[id] = structuredClone(x || y); continue; }
    const tables = {};
    for (const tb of keys(x.tables, y.tables)) {
      const s = x.tables[tb], t = y.tables[tb];
      if (!s || !t) { tables[tb] = structuredClone(s || t); continue; }
      const o = { rounds: 0, wagered: 0, back: 0, best: 0, bestOn: null, add: {}, top: {} };
      for (const k of COUNTS) o[k] = Math.max(s[k], t[k]);
      o.bestOn = s.best !== t.best ? (s.best > t.best ? s.bestOn : t.bestOn) : earlier(s.bestOn, t.bestOn);
      for (const g of ['add', 'top']) for (const k of keys(s[g], t[g])) o[g][k] = Math.max(s[g][k] || 0, t[g][k] || 0);
      tables[tb] = o;
    }
    dev[id] = { since: earlier(x.since, y.since), tables };
  }
  return { v: V, dev };
}
// What Records shows: { since, tables: { blackjack: { rounds, wagered, net, best, bestOn, ...add, ...top } } }, every
// device's counters summed (top counters and the biggest win at their highest), counting since the earliest day.
export function recordsTotals(d) {
  let since = null;
  const tables = {};
  for (const s of Object.values(d.dev)) {
    since = earlier(since, s.since);
    for (const [tb, t] of Object.entries(s.tables)) {
      const o = (tables[tb] ||= { rounds: 0, wagered: 0, net: 0, best: 0, bestOn: null });
      o.rounds += t.rounds; o.wagered += t.wagered; o.net += t.back - t.wagered;
      if (t.best > o.best || (t.best && t.best === o.best && earlier(t.bestOn, o.bestOn) === t.bestOn)) { o.best = t.best; o.bestOn = t.bestOn; }
      for (const [k, v] of Object.entries(t.add)) o[k] = (o[k] || 0) + v;
      for (const [k, v] of Object.entries(t.top)) o[k] = Math.max(o[k] || 0, v);
    }
  }
  return { since, tables };
}
// One round settled at table tb on device id, on day (YYYY-MM-DD). add: counters that add up; top: ones kept
// highest. Returns { won, best }: what the round came to, and whether it's the biggest win at that table yet.
export function note(d, id, tb, { wagered = 0, back = 0, add = {}, top = {} } = {}, on = null) {
  const before = recordsTotals(d).tables[tb]?.best || 0;
  const s = (d.dev[id] ||= { since: day(on), tables: {} });
  s.since ||= day(on);
  const t = (s.tables[tb] ||= cleanTable({}));
  wagered = whole(wagered); back = whole(back);
  t.rounds += 1; t.wagered += wagered; t.back += back;
  const won = back - wagered;
  if (won > t.best) { t.best = won; t.bestOn = day(on); }
  for (const [k, v] of entries(add)) if (whole(v)) t.add[k] = (t.add[k] || 0) + whole(v);
  for (const [k, v] of entries(top)) if (whole(v) > (t.top[k] || 0)) t.top[k] = whole(v);
  return { won, best: won > before };
}

// ---------- the first-visit flags, and the file in Drive ----------
// { blackjack: 1, ... }: which tables' how-to-play sheets have opened by themselves.
export function cleanSeen(x) {
  const o = {};
  for (const [k, v] of entries(x)) if (v) o[k] = 1;
  return o;
}
export const mergeSeen = (a, b) => cleanSeen({ ...cleanSeen(a), ...cleanSeen(b) });

// The file in Drive: { app: 'house-money', v: 1, cage, records, seen }. null for anything that isn't one.
export function cleanBody(x) {
  if (!x || typeof x !== 'object' || x.app !== 'house-money') return null;
  return { app: 'house-money', v: V, cage: cleanCage(x.cage), records: cleanRecords(x.records), seen: cleanSeen(x.seen) };
}
export const mergeBody = (a, b) => ({
  app: 'house-money', v: V,
  cage: mergeCage(a.cage, b.cage), records: mergeRecords(a.records, b.records), seen: mergeSeen(a.seen, b.seen),
});

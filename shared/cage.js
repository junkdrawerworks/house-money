// House Money's cage: one stack of play chips for every table on the floor.
// A table takes chips off the stack when a bet goes down on the felt (take) and pays chips back when it wins or the
// bet comes back (pay). It's read fresh every time, so a table in another tab never gets overwritten by a stale copy.
// The chips aren't money and can't be bought: when the stack runs low, the cage stakes another 1,000 (stake).
//
// Shape in localStorage, under KEY:
//   { chips, wagered, high, stakes }
//   chips    the stack in your rack
//   wagered  every chip ever bet (the player's card counts this)
//   high     the most the stack has ever held
//   stakes   how many times the cage has staked you

export const KEY = 'house-money.cage';
export const START = 1000;        // the first stake, and every one after
export const LOW = 10;            // under this, with nothing on the felt, the cage offers a stake

const whole = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : NaN; };

export function read() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  const ok = c && typeof c === 'object' && !Array.isArray(c);
  const out = ok ? { ...c } : {};
  const chips = whole(out.chips);
  out.chips = Number.isFinite(chips) ? chips : START;
  out.wagered = whole(out.wagered) || 0;
  out.high = Math.max(whole(out.high) || 0, out.chips);
  out.stakes = Number.isFinite(whole(out.stakes)) ? whole(out.stakes) : 1;
  return out;
}

function write(c) {
  c.high = Math.max(c.high || 0, c.chips);
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage full or off: the table plays on */ }
  dispatchEvent(new CustomEvent('house-money:cage', { detail: c }));
  return c;
}

// Chips off the stack and onto the felt. null (and nothing taken) when there aren't enough.
// wager: false for chips that only move (a bet picked back up and put down again isn't a new wager)
export function take(n, { wager = true } = {}) {
  const k = whole(n);
  if (!(k > 0)) return null;
  const c = read();
  if (c.chips < k) return null;
  c.chips -= k;
  if (wager) c.wagered += k;
  return write(c);
}

// Chips back into the rack: a win, or a bet picked back up. A bet picked back up before it played takes its
// wager back off the count too (unwager).
export function pay(n, { unwager = 0 } = {}) {
  const k = whole(n);
  if (!(k > 0)) return read();
  const c = read();
  c.chips += k;
  const u = whole(unwager);
  if (u > 0) c.wagered = Math.max(0, c.wagered - u);
  return write(c);
}

// The cage stakes you back up to START, when you're down to less than LOW. Returns the new cage, or null if you
// aren't low enough for it. onFelt: the chips you still have out on a table, which count as yours.
export function stake(onFelt = 0) {
  const c = read();
  if (c.chips + (whole(onFelt) || 0) >= LOW) return null;
  c.chips = START;
  c.stakes += 1;
  return write(c);
}

export const canStake = (onFelt = 0) => read().chips + (whole(onFelt) || 0) < LOW;

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

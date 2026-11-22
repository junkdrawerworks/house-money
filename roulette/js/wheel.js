// Roulette's rules, with nothing on screen: the single-zero wheel, every bet on the layout, what it covers and what
// it pays. A bet is a short key:
//   n17        straight up on 17               35 to 1
//   s17-20     split 17 and 20 (0-1, 0-2, 0-3)  17 to 1
//   t0-1-2     trio with the zero (t0-2-3)      11 to 1
//   st4        street: the row 4, 5, 6          11 to 1
//   c17        corner 17, 18, 20, 21            8 to 1
//   b          the first four: 0, 1, 2, 3       8 to 1
//   l4         six line: rows 4–6 and 7–9       5 to 1
//   d1 d2 d3   dozens                           2 to 1
//   col1..3    columns (col1 is 1, 4, 7 … 34)   2 to 1
//   red black odd even low high                 1 to 1
// Every bet pays 36 / (numbers covered) − 1 to 1, so every one gives the house the same 1 in 37.

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const color = n => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

const range = (a, b, step = 1) => { const o = []; for (let i = a; i <= b; i += step) o.push(i); return o; };
const col = n => (n - 1) % 3;           // 0, 1, 2 across the layout
const isNum = n => Number.isInteger(n) && n >= 1 && n <= 36;

const OUTSIDE = {
  d1: range(1, 12), d2: range(13, 24), d3: range(25, 36),
  col1: range(1, 34, 3), col2: range(2, 35, 3), col3: range(3, 36, 3),
  red: range(1, 36).filter(n => REDS.has(n)), black: range(1, 36).filter(n => !REDS.has(n)),
  odd: range(1, 35, 2), even: range(2, 36, 2), low: range(1, 18), high: range(19, 36),
};

// The numbers a bet covers, or null for a key that isn't a bet.
export function numbers(key) {
  if (typeof key !== 'string') return null;
  if (OUTSIDE[key]) return OUTSIDE[key];
  if (key === 'b') return [0, 1, 2, 3];
  if (key === 't0-1-2') return [0, 1, 2];
  if (key === 't0-2-3') return [0, 2, 3];
  let m;
  if ((m = /^n(\d+)$/.exec(key))) { const n = +m[1]; return n >= 0 && n <= 36 ? [n] : null; }
  if ((m = /^s(\d+)-(\d+)$/.exec(key))) {
    const a = +m[1], b = +m[2];
    if (a === 0 && b >= 1 && b <= 3) return [0, b];
    if (!isNum(a) || !isNum(b) || a >= b) return null;
    if (b - a === 3 || (b - a === 1 && col(a) < 2)) return [a, b];
    return null;
  }
  if ((m = /^st(\d+)$/.exec(key))) { const n = +m[1]; return isNum(n) && col(n) === 0 ? [n, n + 1, n + 2] : null; }
  if ((m = /^c(\d+)$/.exec(key))) { const n = +m[1]; return isNum(n) && col(n) < 2 && n <= 32 ? [n, n + 1, n + 3, n + 4] : null; }
  if ((m = /^l(\d+)$/.exec(key))) { const n = +m[1]; return isNum(n) && col(n) === 0 && n <= 31 ? range(n, n + 5) : null; }
  return null;
}

export const valid = key => numbers(key) !== null;
// What a winning bet pays, to 1.
export const payout = key => 36 / numbers(key).length - 1;
export const covers = (key, n) => numbers(key)?.includes(n) ?? false;

const NAMES = { d1: '1st dozen', d2: '2nd dozen', d3: '3rd dozen', col1: 'the first column', col2: 'the second column',
  col3: 'the third column', red: 'red', black: 'black', odd: 'odd', even: 'even', low: '1 to 18', high: '19 to 36' };

// A bet in words: 'split 17–20'.
export function label(key) {
  const ns = numbers(key);
  if (!ns) return '';
  if (NAMES[key]) return NAMES[key];
  if (key === 'b') return 'the first four (0–3)';
  const k = key.replace(/[\d-]+$/, '');
  const span = ns.join('–');
  return { n: `straight up on ${ns[0]}`, s: `split ${span}`, t: `trio ${span}`, st: `street ${ns[0]}–${ns[2]}`,
    c: `corner ${ns[0]}–${ns[3]}`, l: `six line ${ns[0]}–${ns[5]}` }[k] || key;
}

// Every bet that covers a number, inside bets first (for the picker on a long press).
export function betsOn(n) {
  const out = [];
  const add = k => { if (valid(k) && covers(k, n) && !out.includes(k)) out.push(k); };
  add(`n${n}`);
  if (n === 0) { add('s0-1'); add('s0-2'); add('s0-3'); add('t0-1-2'); add('t0-2-3'); add('b'); return out; }
  for (const m of [n - 3, n - 1]) if (m >= 1) add(`s${m}-${n}`);
  for (const m of [n + 1, n + 3]) add(`s${n}-${m}`);
  if (n <= 3) add(`s0-${n}`);
  for (const c of [n, n - 1, n - 3, n - 4]) add(`c${c}`);
  if (n <= 3) { add('t0-1-2'); add('t0-2-3'); add('b'); }
  const row = n - col(n);
  add(`st${row}`);
  add(`l${row - 3}`); add(`l${row}`);
  return out;
}

// One spin's bets settled: everything paid back (winning stakes included) and each winner.
export function settle(bets, n) {
  let back = 0, wagered = 0;
  const wins = [];
  for (const [key, amount] of Object.entries(bets)) {
    if (!valid(key) || !(amount > 0)) continue;
    wagered += amount;
    if (covers(key, n)) {
      const pay = amount * payout(key);
      back += amount + pay;
      wins.push({ key, amount, pay });
    }
  }
  return { back, wagered, wins };
}

// The pocket the ball drops into: 0 to 36, from crypto randomness when there is some.
export function draw(rng) {
  if (rng) return Math.floor(rng() * 37) % 37;
  if (globalThis.crypto?.getRandomValues) {
    // rejection sampling, so each pocket is exactly 1 in 37
    const a = new Uint32Array(1);
    const lim = Math.floor(2 ** 32 / 37) * 37;
    do crypto.getRandomValues(a); while (a[0] >= lim);
    return a[0] % 37;
  }
  return Math.floor(Math.random() * 37);
}

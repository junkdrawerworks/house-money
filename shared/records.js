// What each table has seen: rounds played, chips wagered, chips won or lost, the biggest single win, and the day it
// came. One key for the whole floor, read fresh every time, like the cage.
//
//   { tables: { blackjack: { rounds, wagered, net, best, bestOn, ...extra } }, since }

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

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function read() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet */ }
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  if (!r.tables || typeof r.tables !== 'object') r.tables = {};
  if (!r.since) r.since = today();
  return r;
}

export function table(id) {
  const t = read().tables[id] || {};
  return { rounds: num(t.rounds), wagered: num(t.wagered), net: num(t.net), best: num(t.best), bestOn: t.bestOn || null, ...t };
}

// One round settled at a table. wagered: everything bet on it; back: everything paid back to the rack (stakes
// included). extra: counters of the table's own, added up ({ blackjacks: 1 }), or kept highest ({ max: { streak: 4 } }).
export function note(id, { wagered = 0, back = 0, extra = {}, max = {} } = {}) {
  const r = read();
  const t = r.tables[id] || {};
  t.rounds = num(t.rounds) + 1;
  t.wagered = num(t.wagered) + num(wagered);
  const won = num(back) - num(wagered);
  t.net = num(t.net) + won;
  let best = false;
  if (won > num(t.best)) { t.best = won; t.bestOn = today(); best = true; }
  for (const [k, v] of Object.entries(extra)) t[k] = num(t[k]) + num(v);
  for (const [k, v] of Object.entries(max)) if (num(v) > num(t[k])) t[k] = num(v);
  r.tables[id] = t;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* full or off */ }
  return { won, best };
}

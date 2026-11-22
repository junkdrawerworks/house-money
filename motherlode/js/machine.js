// Motherlode's arithmetic: five reels, three rows, twenty fixed lines. The pickaxe is wild on reels 2 to 5. The lantern
// is the scatter: three or more anywhere pay on the whole bet and light up free spins, and in the free spins every
// pickaxe that lands stays where it is until they're over. Lines pay left to right from the first reel, three of a
// kind or more; the bet is spread over the twenty lines, so a line pays in twentieths of it.

import { spread, window, evalLines, scatters, pickStops } from '../../shared/reels.js';
import { rand } from '../../shared/cards.js';

export const ID = 'motherlode';
export const WILD = 'pick', SCATTER = 'lantern';
export const NAMES = {
  pick: 'Pickaxe', lantern: 'Lantern', nugget: 'Gold nugget', cart: 'Mine cart', dynamite: 'Dynamite',
  canary: 'Canary', A: 'A', K: 'K', Q: 'Q', J: 'J', ten: '10',
};

const LOW = { A: 5, K: 5, Q: 6, J: 6, ten: 6 };
const COUNTS = [
  { lantern: 1, nugget: 2, cart: 3, dynamite: 3, canary: 4, ...LOW },
  { lantern: 1, pick: 3, nugget: 2, cart: 3, dynamite: 3, canary: 4, ...LOW },
  { lantern: 2, pick: 3, nugget: 2, cart: 3, dynamite: 3, canary: 4, ...LOW },
  { lantern: 1, pick: 3, nugget: 2, cart: 3, dynamite: 3, canary: 4, ...LOW },
  { lantern: 1, pick: 3, nugget: 2, cart: 3, dynamite: 3, canary: 4, ...LOW },
];
export const REELS = COUNTS.map((c, i) => ({ strip: spread(c, 31 + i, { lantern: 4, pick: 3 }) }));
export const ROWS = 3, ANCHOR = 0;

export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0],
];

// times the line bet (a twentieth of the bet)
export const PAYS = {
  nugget: { 3: 50, 4: 200, 5: 1000 }, cart: { 3: 40, 4: 150, 5: 500 }, dynamite: { 3: 40, 4: 100, 5: 300 },
  canary: { 3: 25, 4: 80, 5: 250 }, A: { 3: 12, 4: 40, 5: 150 }, K: { 3: 10, 4: 30, 5: 120 },
  Q: { 3: 9, 4: 25, 5: 100 }, J: { 3: 7, 4: 20, 5: 80 }, ten: { 3: 6, 4: 20, 5: 80 },
};
// lanterns anywhere: times the whole bet, and the free spins they light
export const SCATTER_PAYS = { 3: 2, 4: 10, 5: 50 };
export const FREE_SPINS = { 3: 8, 4: 12, 5: 20 };
export const LINE_COUNT = LINES.length;

const OPTS = { wild: WILD, not: [SCATTER] };

// One spin, worked out in full: the stops, what shows (with any sticky pickaxes laid over it), the line wins, the
// lanterns, and the pay, in twentieths of the bet (so a bet of 20 pays exactly this many chips per chip of line bet).
// sticky: [[reel, row], …] held from earlier free spins.
export function play(stops, sticky = []) {
  const grid = window(REELS, stops, ROWS, ANCHOR);
  for (const [c, r] of sticky) grid[c][r] = WILD;
  const wins = evalLines(grid, LINES, PAYS, OPTS);
  const lit = scatters(grid, SCATTER);
  const n = lit.length;
  const lines = wins.reduce((a, w) => a + w.pay, 0);
  const scatter = (SCATTER_PAYS[n] || 0) * LINE_COUNT;
  const picks = [];
  grid.forEach((col, c) => col.forEach((s, r) => { if (s === WILD) picks.push([c, r]); }));
  return { stops, grid, wins, lit, lines, scatter, units: lines + scatter, free: FREE_SPINS[n] || 0, picks };
}

// A whole set of free spins, with the pickaxes sticking. For the tests' long-run figures.
export function feature(count, rng = rand) {
  let sticky = [], units = 0;
  for (let i = 0; i < count; i++) {
    const r = play(pickStops(REELS, rng), sticky);
    units += r.units;
    sticky = r.picks;
  }
  return units;
}

// Figured by test/slots.unit.test.mjs (exact for the lines and lanterns, and a long seeded run of free spins):
// the share of every chip bet that comes back, the share of spins that win something, and how often free spins come.
export const RETURN = { rtp: 95.0, hit: 40.3, feature: 217 };

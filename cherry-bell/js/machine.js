// Cherry Bell's arithmetic: three reels of 22 stops (11 symbols with a blank between each) and one pay line through
// the middle. Behind each reel is a virtual reel, the way the old machines' chips worked: every symbol gets so many of
// 128 chances in the draw, shared between its stops, and the blanks share what's left. The pay table is the old
// fruit machine's, where a BAR on the third reel finishes two bells, plums or oranges, and lemons pay nothing.
// Bet one to three coins; three coins lift the top prize.

export const ID = 'cherry-bell';

const S = (...syms) => syms.flatMap(s => [s, 'blank']);
const STRIPS = [
  S('seven', 'cherry', 'bar', 'lemon', 'orange', 'bell', 'plum', 'cherry', 'orange', 'lemon', 'plum'),
  S('seven', 'orange', 'bar', 'cherry', 'bell', 'lemon', 'plum', 'orange', 'cherry', 'bell', 'lemon'),
  S('seven', 'lemon', 'bar', 'plum', 'bell', 'orange', 'lemon', 'bar', 'cherry', 'plum', 'orange'),
];
// chances in 128, reel by reel
export const ODDS = [
  { seven: 4, bar: 10, bell: 16, plum: 19, orange: 26, cherry: 28, lemon: 10 },
  { seven: 4, bar: 10, bell: 16, plum: 20, orange: 26, cherry: 20, lemon: 14 },
  { seven: 4, bar: 24, bell: 13, plum: 16, orange: 20, cherry: 12, lemon: 22 },
];

function virtual(strip, odds, total = 128) {
  const stops = {};
  strip.forEach(s => { stops[s] = (stops[s] || 0) + 1; });
  const used = Object.values(odds).reduce((a, b) => a + b, 0);
  const share = { ...odds, blank: total - used };
  return strip.map(s => share[s] / stops[s]);
}
export const REELS = STRIPS.map((strip, i) => ({ strip, weights: virtual(strip, ODDS[i]) }));
export const ROWS = 3, ANCHOR = 1;
export const LINES = [[1, 1, 1]];

// The pay table, per coin, in the order it's printed on the glass.
export const TABLE = [
  { show: ['seven', 'seven', 'seven'], pay: 200, name: 'Three sevens' },
  { show: ['bar', 'bar', 'bar'], pay: 50, name: 'Three bars' },
  { show: ['bell', 'bell', 'bell'], alt: ['bell', 'bell', 'bar'], pay: 18, name: 'Three bells' },
  { show: ['plum', 'plum', 'plum'], alt: ['plum', 'plum', 'bar'], pay: 14, name: 'Three plums' },
  { show: ['orange', 'orange', 'orange'], alt: ['orange', 'orange', 'bar'], pay: 10, name: 'Three oranges' },
  { show: ['cherry', 'cherry', 'cherry'], pay: 10, name: 'Three cherries' },
  { show: ['cherry', 'cherry', 'any'], pay: 5, name: 'Two cherries' },
  { show: ['cherry', 'any', 'any'], pay: 2, name: 'A cherry' },
];
// "A cherry pays 2." and "Two cherries pay 5.": only a row named for one thing is singular.
export const pays = row => (TABLE[row].name.startsWith('A ') ? 'pays' : 'pay');
export const JACKPOT = 1000;   // three sevens on three coins pay 1,000 coins, not 600
export const COINS = 3;

const fits = (pat, line) => pat.every((p, i) => p === 'any' || p === line[i]);

// What a stop pays, in coins, for the coins bet: { row (index in TABLE, or -1), coins }.
export function pay(grid, coins) {
  const line = LINES[0].map((r, c) => grid[c][r]);
  const row = TABLE.findIndex(t => fits(t.show, line) || (t.alt && fits(t.alt, line)));
  if (row < 0) return { row, coins: 0 };
  const won = row === 0 && coins === COINS ? JACKPOT : TABLE[row].pay * coins;
  return { row, coins: won };
}

// Figured exactly by test/slots.unit.test.mjs, which fails if these drift from the reels above:
// the share of every coin bet that comes back, on one or two coins and on three, and the share of pulls that pay.
export const RETURN = { low: 94.4, max: 94.8, hit: 24.6 };

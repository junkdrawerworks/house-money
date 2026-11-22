// Odds & Ends' arithmetic: three reels, three rows, five pay lines, stocked from the junk drawer. The lucky penny is
// wild: it stands in for anything, and three of them on a line pay the most. Three of a kind on a line pays,
// reading across; a penny counts as whatever finishes the line.

import { spread } from '../../shared/reels.js';

export const ID = 'odds-and-ends';

export const SYMBOLS = ['penny', 'fob', 'tape', 'key', 'battery', 'menu', 'band', 'clip'];
export const NAMES = {
  penny: 'Lucky penny', fob: 'Key fob', tape: 'Tape measure', key: 'Spare key', battery: 'AA battery',
  menu: 'Takeout menu', band: 'Rubber band', clip: 'Paper clip',
};
// how many of each on each reel's strip
const COUNTS = [
  { penny: 2, fob: 3, tape: 3, key: 4, battery: 5, menu: 5, band: 6, clip: 7 },
  { penny: 2, fob: 3, tape: 3, key: 4, battery: 5, menu: 5, band: 6, clip: 7 },
  { penny: 2, fob: 2, tape: 3, key: 4, battery: 5, menu: 6, band: 6, clip: 7 },
];
export const REELS = COUNTS.map((c, i) => ({ strip: spread(c, 11 + i, { penny: 3 }) }));
export const ROWS = 3, ANCHOR = 0;
export const WILD = 'penny';

// line 1 across the middle, 2 the top, 3 the bottom, then the two diagonals
export const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];

// times the line bet, for three on a line
export const PAYS = {
  penny: { 3: 250 }, fob: { 3: 80 }, tape: { 3: 50 }, key: { 3: 30 }, battery: { 3: 18 },
  menu: { 3: 13 }, band: { 3: 8 }, clip: { 3: 6 },
};

// Figured exactly by test/slots.unit.test.mjs: the share of every coin bet that comes back (the same on any number
// of lines), and the share of spins on all five lines that win something.
export const RETURN = { rtp: 95.2, hit: 23.8 };

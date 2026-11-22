// Records: what each table writes into it, and the words the Records page and the floor show for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA } from '../shared/records.js';
import { TABLES, units } from '../shared/tables.js';
import { PAYTABLE } from '../video-poker/js/poker.js';
import { evalLine } from '../shared/reels.js';
import * as oe from '../odds-and-ends/js/machine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The keys a table's page writes into Records' extra (added up) and max (kept highest), read from its source: every
// `extra: { … }` and `max: { … }` it passes to records.note or to a slot's keeper. Names in a ternary's first branch
// (`? x :`) are values, not keys.
async function written(id) {
  const src = await readFile(join(root, id, 'js', 'app.js'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/\b(extra|max)\s*:/g)) {
    let i = m.index + m[0].length;
    const open = src.indexOf('{', i);
    if (open < 0 || /[,;\n]/.test(src.slice(i, open))) continue;   // `max: T.max,` and the like: not a counter
    let depth = 0, j = open;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
    for (const k of src.slice(open, j).matchAll(/(\?\s*)?\b([A-Za-z_]\w*)\s*:/g)) if (!k[1]) keys.add(k[2]);
  }
  return keys;
}
// Keys built from a value rather than written out: Video Poker counts every winning hand by its pay table id, and
// Baccarat each coup's winner.
const COMPUTED = {
  'video-poker': PAYTABLE.map(p => p.id),
  baccarat: ['player', 'banker', 'tie'],
};
// Written but left off the Records page on purpose.
const SKIP = {
  // the lower hands come too often to be worth a line each
  'video-poker': ['flush', 'straight', 'three', 'two-pair', 'jacks'],
  // a machine's biggest single payout: Records' own Biggest win already shows the best result of a spin
  'cherry-bell': ['biggest'], 'odds-and-ends': ['biggest'], motherlode: ['biggest'],
};

test('every counter a table writes is shown on Records, or left off on purpose', async () => {
  for (const t of TABLES) {
    const keys = new Set([...await written(t.id), ...(COMPUTED[t.id] || [])]);
    const words = EXTRA[t.id] || {};
    for (const k of keys) assert.ok(k in words || (SKIP[t.id] || []).includes(k), `${t.name} writes ${k} to Records, which shows no line for it`);
    for (const k of Object.keys(words)) assert.ok(keys.has(k), `Records has a line for ${t.name}'s ${k}, which it never writes`);
    for (const k of SKIP[t.id] || []) assert.ok(keys.has(k), `${t.name}'s ${k} is skipped but never written`);
  }
});

test('the counters found in the source are the ones expected', async () => {
  assert.deepEqual([...await written('blackjack')].sort(), ['blackjacks', 'won']);
  assert.deepEqual([...await written('craps')].sort(), ['longestHand', 'pointsMade']);
  assert.deepEqual([...await written('cherry-bell')].sort(), ['biggest', 'jackpots']);
  assert.deepEqual([...await written('motherlode')].sort(), ['biggest', 'feature', 'features']);
  assert.deepEqual([...await written('odds-and-ends')].sort(), ['biggest', 'jackpots']);
});

// Odds & Ends counts a jackpot only for three lucky pennies on a line: a penny standing in for something else pays
// as that symbol.
test('a line reads as pennies only when all three are pennies', () => {
  const opts = { wild: oe.WILD };
  assert.deepEqual([evalLine(['penny', 'penny', 'penny'], oe.PAYS, opts).sym, evalLine(['penny', 'penny', 'penny'], oe.PAYS, opts).count], ['penny', 3]);
  assert.equal(evalLine(['key', 'penny', 'penny'], oe.PAYS, opts).sym, 'key');
  assert.equal(evalLine(['penny', 'penny', 'key'], oe.PAYS, opts).sym, 'key');
  assert.equal(evalLine(['penny', 'fob', 'penny'], oe.PAYS, opts).sym, 'fob');
});

test('each table counts its rounds in its own word', () => {
  const at = id => TABLES.find(t => t.id === id);
  assert.equal(units(at('video-poker'), 1), '1 hand');
  assert.equal(units(at('craps'), 22), '22 rolls');
  assert.equal(units(at('motherlode'), 1234), '1,234 spins');
  assert.equal(units(at('blackjack'), 2, { word: true }), 'rounds');
  assert.equal(units(at('roulette'), 80), '80 spins');
  assert.equal(units(at('baccarat'), 1), '1 hand');
  assert.deepEqual(TABLES.map(t => t.unit), ['round', 'spin', 'roll', 'hand', 'hand', 'spin', 'spin', 'spin']);
});

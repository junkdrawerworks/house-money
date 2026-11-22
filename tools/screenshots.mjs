// The pictures:  node tools/screenshots.mjs [table ...]
//   floor/TABLE.jpg       the picture on each table's tile on the floor
//   docs/phone-TABLE.png  the README's phone screenshots, 390 x 844 at 2x
// (The link preview, og.png, is tools/og.mjs.)
// Each table is driven into a good moment by its own entry in SCENES: rigged cards or a fixed result, so the pictures
// come out the same every run.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES } from '../shared/tables.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const C = (r, s) => ({ r, s });

// Each scene: go(page) gets the table to its moment (on a phone, then again on the wider screen the floor's tile is
// cut from); tile: { w: the screen's width, y: where the 3:2 cut starts, vh: the screen's height }.
const SCENES = {
  blackjack: {
    async go(page) {
      await page.goto(`${base}blackjack/?seen`);
      await page.evaluate(cards => {
        localStorage.setItem('house-money.cage', JSON.stringify({ chips: 1450, wagered: 6200, high: 2300, stakes: 1 }));
        localStorage.setItem('house-money.blackjack', JSON.stringify({ phase: 'bet', bet: 100, last: 100, felt: 100, hands: [], dealer: [], hole: true, insurance: 0, active: 0,
          shoe: Array(220).fill({ r: 2, s: 'c' }).concat(cards.reverse()) }));
      }, [C(1, 's'), C(9, 'h'), C(7, 'd'), C(10, 'c'), C(13, 'h'), C(10, 's')]);
      await page.reload();
      await wait(300);
      await page.click('#deal');
      await wait(1400);
      await page.click('#book');
      await wait(300);
    },
    tile: { w: 560, y: 108, vh: 760 },
  },
};

// Scenes kept beside this file, one per table: tools/scenes/TABLE.mjs exports go(page, base) and tile.
import { readdir } from 'node:fs/promises';
for (const f of await readdir(join(root, 'tools/scenes')).catch(() => [])) {
  if (!f.endsWith('.mjs')) continue;
  const m = await import(join(root, 'tools/scenes', f));
  SCENES[f.slice(0, -4)] = { go: page => m.go(page, base), tile: m.tile };
}

export async function shoot(names = Object.keys(SCENES)) {
  await mkdir(join(root, 'floor'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  const browser = await pw.chromium.launch();
  for (const id of names) {
    const sc = SCENES[id];
    if (!sc) { console.log(`no scene for ${id}`); continue; }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log(id, 'error:', e.message));
    await sc.go(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(root, `docs/phone-${id}.png`) });
    await ctx.close();
    // the floor's tile: the same moment on a wider screen (tile.w across), cut to 3:2 from tile.y down
    const t = sc.tile || {};
    const tw = t.w || 600, th = Math.round(tw * 2 / 3);
    const tctx = await browser.newContext({ viewport: { width: tw, height: t.vh || 900 }, deviceScaleFactor: 600 / tw * 1.5, reducedMotion: 'no-preference' });
    const tp = await tctx.newPage();
    await sc.go(tp);
    await tp.evaluate(() => document.fonts.ready);
    await tp.screenshot({ path: join(root, `floor/${id}.jpg`), type: 'jpeg', quality: 80, clip: { x: 0, y: t.y ?? 56, width: tw, height: th } });
    await tctx.close();
    console.log('shot', id);
  }
  await browser.close();
}

const only = process.argv.slice(2);
await shoot(only.length ? only : Object.keys(SCENES));
server.close();
export { SCENES, TABLES };

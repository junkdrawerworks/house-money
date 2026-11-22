// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// The floor, every table opening clean at phone size, a hand of blackjack played through with the chips counted, the
// cage's stake, and the offline copy. Each table's own play is driven by its own test/<table>.e2e.mjs where it has one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { TABLES } from '../shared/tables.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.jpg': 'image/jpeg' };
// The server answers the way GitHub Pages does: a browser may keep each file for ten minutes, and asks again by its
// ETag. `net` is the connection: 'up', 'down' (the server drops every connection) or 'stalled' (a train, a captive
// wifi: it takes each request and holds on to it). With `release` set it serves the next release (see the end).
let net = 'up', release = false;
const held = [];
const server = createServer((req, res) => {
  if (net === 'down') { req.socket.destroy(); return; }
  if (net === 'stalled') { held.push([req, res]); return; }
  serve(req, res);
}).listen(0);
async function serve(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
  if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
  if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  res.writeHead(200, head);
  res.end(body);
}
const base = `http://localhost:${server.address().port}/`;
// Waits for ok() to come true, for up to ms, or fails saying what didn't happen.
const until = async (ok, ms, what) => {
  for (const end = Date.now() + ms; !(await ok());) { assert.ok(Date.now() < end, what); await new Promise(r => setTimeout(r, 100)); }
};

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
const sideways = async where => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways on a phone`);

// The floor: a fresh pocket of 1,000 chips, a Red card, and a tile for every table.
assert.equal(await page.textContent('#chips'), '1,000');
assert.equal(await page.textContent('#tierName'), 'Red');
assert.equal(await page.locator('.tile').count(), TABLES.length);

await sideways('the floor');

// Every table opens clean, with its menu up on the first visit, and fits the phone.
// (PARTIAL=1 skips tables that don't have a page yet, while one is being built.)
for (const t of TABLES) {
  if (process.env.PARTIAL && !existsSync(join(root, t.id, 'index.html'))) continue;
  if (process.env.ONLY && process.env.ONLY !== t.id) continue;
  await page.goto(`${base}${t.id}/`);
  await page.waitForSelector('dialog.sheet[open]', { timeout: 5000 }).catch(() => assert.fail(`${t.id}: the menu didn't open on the first visit`));
  assert.equal(await page.textContent('.bar .name'), t.name, `${t.id}: the bar names the table`);
  await page.click('dialog.sheet [data-act="close"]');
  await sideways(t.name);
}
await page.goto(`${base}records/`);
await sideways('the records');

// A hand of blackjack, rigged: 10 and 9 against the dealer's 7 and 10, bet 100, stand, win 100.
const C = (r, s) => ({ r, s });
await page.goto(`${base}blackjack/?fast`);
await page.evaluate(([cards]) => {
  const s = { phase: 'bet', bet: 0, last: 0, hands: [], dealer: [], hole: true, insurance: 0, active: 0, felt: 0,
    shoe: Array(250).fill({ r: 2, s: 'c' }).concat(cards.reverse()) };
  localStorage.setItem('house-money.blackjack', JSON.stringify(s));
}, [[C(10, 's'), C(7, 'h'), C(9, 'd'), C(10, 'c')]]);
await page.reload();
await page.click('#rack .c100');
await page.click('#spot');
await until(async () => (await page.textContent('#purse')) === '900', 3000, 'the bet did not come off the stack');
await page.click('#deal');
await page.waitForSelector('#playActions:not([hidden])');
assert.equal((await page.textContent('#say')).trim(), '19 against a 7.');
await page.click('#stand');
await page.waitForSelector('#doneActions:not([hidden])');
await until(async () => (await page.textContent('#purse')) === '1,100', 3000, 'the win was not paid');
assert.match(await page.textContent('#say'), /You win 100/);
// a reload doesn't pay it twice
await page.reload();
await page.waitForTimeout(300);
assert.equal(await page.textContent('#purse'), '1,100', 'a reload paid the hand again');
const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('house-money.records')).tables.blackjack);
assert.equal(rec.rounds, 1); assert.equal(rec.net, 100); assert.equal(rec.best, 100);

// Broke: the cage offers another 1,000, and only when there's nothing left out on a table.
await page.evaluate(() => localStorage.setItem('house-money.cage', JSON.stringify({ chips: 3, wagered: 12000, high: 1100, stakes: 1 })));
await page.goto(base);
assert.equal(await page.textContent('#tierName'), 'Silver');
await page.click('#stake');
assert.equal(await page.textContent('#chips'), '1,000');
assert.equal(await page.isHidden('#stake'), true);

// Works offline once it has been opened. The server goes down as well as the browser: in some Chromium builds the
// browser's offline switch alone doesn't stop the service worker's own requests, and this passed with no copy at all.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
const title = await page.title();
net = 'down';
await ctx.setOffline(true);
await page.reload();
assert.equal(await page.title(), title, 'the page did not open offline');
await ctx.setOffline(false);

// On a connection that's up but not answering, it opens from the copy too, after the worker's few seconds' wait for
// the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
net = 'stalled';
const t0 = Date.now();
await page.reload({ timeout: 10000 }).catch(() => {});
const took = Date.now() - t0;
assert.ok(took < 8000, `the page took ${took} ms to open on a stalled connection`);
assert.equal(await page.title(), title, 'the page did not open on a stalled connection');
net = 'up';
for (const [req, res] of held.splice(0)) serve(req, res);

// A new release: every file in the new copy comes from the server, though the browser still has its own copies of
// the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
release = true;
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await until(() => page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')),
  10000, "the new release's offline copy kept the old index.html");
release = false;

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();

// sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js is
// a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
// index.html; the first 8 hex of the sha1 of those).
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
const all = createHash('sha1');
for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
const files = all.digest('hex').slice(0, 8);
assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
console.log('all good');

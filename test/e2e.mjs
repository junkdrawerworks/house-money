// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// The floor, every table opening clean at phone size, a hand of blackjack played through with the chips counted, the
// cage's stake at every table, rounds reloaded mid-play and left unpaid (each paid and recorded once, with the books
// checked after), two tabs at one table, Records' own words, and the offline copy. Any page error, console error,
// request that leaves the site, or answer of 400 or more from the site fails it.
// ONLY=<table id> runs one table's checks (ONLY=cage the cage's at every table; ONLY=records, ONLY=floor); PARTIAL=1
// skips tables that don't have a page yet.
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
import { cageFrom } from '../shared/ledger.js';

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

// The cage and Records are saved one section per device (shared/ledger.js), so a test sets up the stack from its
// totals ({ chips, wagered, high, stakes }) on a device of its own, and reads them back through the page's own cage
// and Records.
const DEV = 'd-0000test';
const seedCage = c => cageFrom(c, DEV);
// Records from their totals ({ since, tables: { id: { rounds, wagered, net, best, bestOn, ...counters } } }): the
// counters that keep the highest rather than add up are named in TOP.
const TOP = ['longestHand', 'feature', 'biggest'];
const seedRecords = ({ since, tables }) => ({ v: 1, dev: { [DEV]: { since, tables: Object.fromEntries(Object.entries(tables).map(([id, t]) => {
  const { rounds, wagered, net, best, bestOn, ...rest } = t, add = {}, top = {};
  for (const [k, v] of Object.entries(rest)) (TOP.includes(k) ? top : add)[k] = v;
  return [id, { rounds, wagered, back: wagered + net, best, bestOn, add, top }];
})) } } });
const cageOf = p => p.evaluate(() => import('/shared/cage.js').then(m => m.read()));
const recordsOf = p => p.evaluate(() => import('/shared/records.js').then(m => m.read().tables));

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
// a file the site should have and doesn't (a style sheet, a picture, a script) answers 404
const answered = (p, at = '') => p.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`${at}${r.status()} from ${r.url()}`); });
answered(page);

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
  // the stack in the bar counts up frame by frame: read out, every frame would be an announcement
  assert.equal(await page.evaluate(() => !!document.getElementById('purse').closest('[aria-live]')), false, `${t.id}: the chip count in the bar is a live region`);
  // the × at the top stays in sight and in reach with the sheet scrolled to its end, and takes you back to the table
  const x = await page.evaluate(() => {
    const d = document.querySelector('dialog.sheet[open]'), b = d.querySelector('.x');
    d.scrollTop = d.scrollHeight;
    const r = b.getBoundingClientRect(), v = d.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.getAttribute('aria-label'), inside: r.top >= v.top && r.bottom <= v.top + 70, hit: b.contains(at), scrolled: d.scrollTop > 0 || d.scrollHeight <= d.clientHeight };
  });
  assert.deepEqual(x, { label: 'Back to the table', inside: true, hit: true, scrolled: true }, `${t.id}: the menu's × isn't in reach at the top of the scrolled sheet`);
  await page.click('dialog.sheet[open] .x');
  assert.equal(await page.isVisible('dialog.sheet[open]'), false, `${t.id}: the menu's × didn't close it`);
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
const rec = (await recordsOf(page)).blackjack;
assert.equal(rec.rounds, 1); assert.equal(rec.net, 100); assert.equal(rec.best, 100);

// Broke: the cage offers another 1,000, and only when there's nothing left out on a table.
await page.evaluate(c => localStorage.setItem('house-money.cage', JSON.stringify(c)), seedCage({ chips: 3, wagered: 12000, high: 1100, stakes: 1 }));
await page.goto(base);
assert.equal(await page.textContent('#tierName'), 'Silver');
await page.click('#stake');
assert.equal(await page.textContent('#chips'), '1,003', 'the stake is another 1,000 on top of the 3');
assert.equal(await page.isHidden('#stake'), true);
assert.equal((await cageOf(page)).stakes, 2);

// ---------- the cage at the tables ----------
// Each check sits down in a fresh browser with the chips (and any table's saved state) set up first.
// ONLY=<table id> runs the ones for that table; ONLY=cage runs them all and skips the rest of the tables.
const cageWants = (...ids) => !process.env.ONLY || process.env.ONLY === 'cage' || ids.includes(process.env.ONLY);
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function sit(path, saved, { ctx = null, size = phone, f = null } = {}) {
  const own = !ctx;
  ctx ||= await browser.newContext(size);
  if (own && f !== null) await ctx.addInitScript(steady, f);
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${path}: ${e.message}`));
  answered(p, `${path}: `);
  if (own || Object.keys(saved).length) {   // a context of the caller's own is set up only when there's something to set
    await p.goto(`${base}records/`);
    await p.evaluate(([saved, dev]) => {
      localStorage.clear();
      localStorage.setItem('house-money.device', dev);
      for (const [k, v] of Object.entries(saved)) localStorage.setItem(`house-money.${k}`, JSON.stringify(v));
    }, [{ ...saved, ...(saved.cage ? { cage: seedCage(saved.cage) } : {}), ...(saved.records ? { records: seedRecords(saved.records) } : {}) }, DEV]);
  }
  await p.goto(`${base}${path}`);
  await p.waitForTimeout(400);
  return { p, ctx };
}
const offered = p => p.isVisible('.stake-offer');
// every button and rack chip a player can see, and whether a tap in its middle lands on it (not on the cage's offer)
const covered = p => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.dock button, .dock .chip, .cab button, .coinsize .chip, .stake-offer button')) {
    if (!el.offsetParent || getComputedStyle(el).visibility === 'hidden') continue;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!(at === el || el.contains(at))) out.push(`${el.id || el.className} under ${at?.className || at?.tagName}`);
  }
  return out;
});

// a draw that comes out the same every time: every getRandomValues answer is `f` of the way up
const steady = f => { crypto.getRandomValues = a => { a.fill(Math.floor(f * 2 ** 32)); return a; }; };
const feltOf = (p, id) => p.evaluate(id => JSON.parse(localStorage.getItem(`house-money.${id}`))?.felt, id);

// The player's card on the floor: the bar fills toward the next card, 62% of the way to Silver at 6,200 bet, empty
// at none, and full on Black.
if (cageWants('floor')) {
  for (const [wagered, pct] of [[6200, 62], [0, 0], [300000, 100]]) {
    const { p, ctx } = await sit('?seen', { cage: { chips: 1000, wagered, high: 1000, stakes: 1 } });
    const [bar, track, h] = await p.evaluate(() => {
      const i = document.getElementById('tierBar');
      return [i.getBoundingClientRect().width, i.parentElement.getBoundingClientRect().width, i.parentElement.getBoundingClientRect().height];
    });
    assert.ok(Math.abs(bar - track * pct / 100) < 1.5, `the floor: the card's bar is ${bar.toFixed(1)} of ${track.toFixed(1)} px at ${wagered} bet, not ${pct}%`);
    assert.ok(track > 100 && h <= 8, `the floor: the card's bar track is ${track.toFixed(1)} x ${h.toFixed(1)} px`);
    await ctx.close();
  }
}

// Down to 7 chips at every table: the offer is up, with the count, and every control is still there to tap.
for (const t of TABLES) {
  if (!cageWants(t.id)) continue;
  for (const size of [phone, { viewport: { width: 1280, height: 800 } }, { ...phone, viewport: { width: 360, height: 740 } }]) {
    const { p, ctx } = await sit(`${t.id}/?fast&seen`, { cage: { chips: 7, wagered: 993, high: 1000, stakes: 1 } }, { size });
    const at = `${t.name} at ${size.viewport.width}x${size.viewport.height}`;
    assert.equal(await offered(p), true, `${at}: no stake offered at 7 chips`);
    assert.equal((await p.textContent('.stake-offer p')).trim(), 'You’re down to 7 chips. It’s all house money anyway: the cage will stake you another 1,000.', `${at}: the offer's words`);
    assert.deepEqual(await covered(p), [], `${at}: the cage's offer covers the controls`);
    await ctx.close();
  }
}

// Roulette with 7 chips: 5 on 17 leaves 2 in the rack, and the 5 on the felt is still yours, so no offer until the
// ball lands somewhere else (a steady draw of 0: the zero).
if (cageWants('roulette')) {
  const { p, ctx } = await sit('roulette/?fast&seen', { cage: { chips: 7, wagered: 993, high: 1000, stakes: 1 } }, { f: 0 });
  await p.click('#rack .c5');
  await p.click('[data-n="17"]');
  await until(async () => (await cageOf(p)).chips === 2, 3000, 'roulette: the 5 did not go down on 17');
  await p.waitForTimeout(200);
  assert.equal(await offered(p), false, 'roulette: the cage offered a stake with 5 still on 17');
  await p.click('#spin');
  await until(() => offered(p), 8000, 'roulette: no stake offered once the last bet lost');
  assert.equal(await feltOf(p, 'roulette'), 0, 'roulette: chips left on the felt after the spin');
  assert.equal((await p.textContent('.stake-offer p')).trim().slice(0, 23), 'You’re down to 2 chips.');
  await p.click('.stake-offer button');
  const c = await cageOf(p);
  assert.deepEqual([c.chips, c.stakes], [1002, 2], 'roulette: the stake is another 1,000');
  await until(async () => !(await offered(p)), 2000, 'roulette: the offer stayed up after the stake');
  await ctx.close();
}

// Roulette on a phone: a tap 8 px above or below the middle of 17 is straight up on 17, and a tap within 3 px of the
// line it shares with 14 is the split.
if (cageWants('roulette')) {
  for (const size of [phone, { ...phone, viewport: { width: 360, height: 740 } }]) {
    const at = `Roulette at ${size.viewport.width}x${size.viewport.height}`;
    const { p, ctx } = await sit('roulette/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } }, { size });
    await p.click('#rack .c1');
    const tapAt = async (dy, from = 'middle') => {
      const r = await p.evaluate(() => { const e = document.querySelector('[data-n="17"]'); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, top: q.top, mid: q.top + q.height / 2 }; });
      await p.mouse.click(r.x, (from === 'middle' ? r.mid : r.top) + dy);
      await p.waitForTimeout(150);
      return p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('house-money.roulette')).bets).sort());
    };
    assert.deepEqual(await tapAt(-8), ['n17'], `${at}: a tap 8 px above the middle of 17 isn't straight up`);
    assert.deepEqual(await tapAt(8), ['n17'], `${at}: a tap 8 px below the middle of 17 isn't straight up`);
    assert.deepEqual(await tapAt(2, 'top'), ['n17', 's14-17'], `${at}: a tap 2 px under the line between 14 and 17 isn't the split`);
    await ctx.close();
  }
}

// Roulette on a phone: a finger held on the 5 for 800 ms opens the list of every bet on the 5, and the list stays up
// when the finger lifts (the tap that ends the hold lands on the list's backdrop, or on one of its rows). A tap on a
// row then puts the chip on that bet. (Touches sent through the browser's own input, as a finger's would be.)
if (cageWants('roulette')) {
  const { p, ctx } = await sit('roulette/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } });
  await p.click('#rack .c5');
  const cdp = await ctx.newCDPSession(p);
  for (const n of [5, 17, 34]) {
    const at = await p.evaluate(n => { const e = document.querySelector(`[data-n="${n}"]`); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, n);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await p.waitForTimeout(800);
    assert.equal(await p.isVisible('#picker[open]'), true, `Roulette: holding the ${n} didn't open its list`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
    assert.equal(await p.isVisible('#picker[open]'), true, `Roulette: the list of bets on ${n} closed when the finger lifted`);
    assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('house-money.roulette'))?.bets || {}), {}, `Roulette: lifting the finger off the ${n} put a bet down`);
    await p.click('#pickClose');
  }
  const at = await p.evaluate(() => { const e = document.querySelector('[data-n="5"]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await p.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(500);
  await p.tap('#pickList button:nth-child(2)');
  await p.waitForTimeout(200);
  assert.equal(await p.isVisible('#pickList button:nth-child(2) .has'), true, 'Roulette: tapping a row in the list did not put a chip on it');
  assert.deepEqual(Object.values(await p.evaluate(() => JSON.parse(localStorage.getItem('house-money.roulette')).bets)), [5], 'Roulette: tapping a row did not put down one 5 chip');
  // a tap on the backdrop still closes it
  await p.mouse.click(5, 5);
  await until(async () => !(await p.isVisible('#picker[open]')), 2000, 'Roulette: a tap outside the list did not close it');
  await ctx.close();
}

// Result lines that say what happened when some bets came back and more didn't, so they can't read like a push.
if (cageWants('roulette')) {
  // 5 on red and 10 on the 3rd dozen, and the ball in the 1: red wins 5, and the spin is down 5
  const { p, ctx } = await sit('roulette/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } }, { f: 1.5 / 2 ** 32 });
  await p.click('#rack .c5'); await p.click('[data-k="red"]');
  await p.click('[data-k="d3"]'); await p.click('[data-k="d3"]');
  await p.click('#spin');
  await until(async () => /^1 red\./.test((await p.textContent('#say')).trim()), 8000, 'Roulette: the spin never said where the ball landed');
  assert.equal((await p.textContent('#say')).trim(), '1 red. Red wins 5. Down 5 on the spin.');
  await ctx.close();
}
if (cageWants('blackjack')) {
  const C = (r, s = 'c') => ({ r, s });
  // dealt from the end of the shoe: your first card, the dealer's up card, your second, the hole card, then the rest
  const deal = cards => Array(150).fill(C(2)).concat([...cards].reverse());
  for (const [what, cards, moves, said] of [
    ['a bust', [C(10), C(10, 'd'), C(6), C(7), C(10, 'h')], ['#hit'], 'Bust with 26. The house takes it.'],
    ['a split that pushes and busts', [C(8), C(10), C(8, 'd'), C(8, 'h'), C(10, 'h'), C(6), C(10, 's')], ['#split', '#stand', '#hit'], 'Dealer has 18. Hand 1 pushes, hand 2 busts. Down 25.'],
    ['a surrender', [C(10), C(10, 'd'), C(6), C(9)], ['#surrender'], 'You surrender: half your bet, 12, comes back, and the half chip’s kept for later.'],
  ]) {
    const { p, ctx } = await sit('blackjack/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
      blackjack: { shoe: deal(cards), phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0, carry: 0 } });
    await p.click('#rack .c25'); await p.click('#spot'); await p.click('#deal');
    for (const m of moves) { await p.waitForSelector(`${m}:not([disabled]):not([hidden])`); await p.click(m); }
    await p.waitForSelector('#doneActions:not([hidden])');
    assert.equal((await p.textContent('#say')).trim(), said, `Blackjack, ${what}`);
    await ctx.close();
  }
}
// Splits: what's on screen is the hand that's saved, card for card, after every move, at the payout and after a reload.
// Eights split three times into four hands against a 10 and a 7, and aces split against a 6, a king on the first: a 21
// after a split reads 21, not Blackjack.
if (cageWants('blackjack')) {
  const C = (r, s) => ({ r, s });
  const RANKS = ['', 'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
  const SUITS = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  const deal = cards => Array(150).fill(C(2, 'c')).concat([...cards].reverse());
  for (const [what, cards, moves, tots] of [
    ['eights split into four hands', [C(8, 's'), C(10, 'h'), C(8, 'h'), C(7, 'c'), C(8, 'd'), C(8, 'c'), C(3, 'd'), C(2, 'h'), C(9, 's'), C(13, 's')],
      ['#split', '#split', '#split', '#stand', '#stand', '#stand', '#stand'], ['11', '10', '17', '18']],
    ['aces split', [C(1, 's'), C(6, 'd'), C(1, 'h'), C(10, 'c'), C(13, 'd'), C(5, 'c'), C(2, 'c')], ['#split'], ['21', '6 / 16']],
  ]) {
    const { p, ctx } = await sit('blackjack/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
      blackjack: { shoe: deal(cards), phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0, carry: 0 } });
    // the moves have finished when the next choice is lit or the round is over
    const still = () => p.waitForFunction(() => !document.getElementById('doneActions').hidden || (!document.getElementById('playActions').hidden && !document.getElementById('stand').disabled));
    const same = async when => {
      const [shown, saved] = await p.evaluate(() => [
        [...document.querySelectorAll('#hands .hand')].map(h => [...h.querySelectorAll('.row .card')].map(c => c.getAttribute('aria-label'))),
        JSON.parse(localStorage.getItem('house-money.blackjack')).hands.map(h => h.cards),
      ]);
      assert.deepEqual(shown, saved.map(h => h.map(c => `${RANKS[c.r]} of ${SUITS[c.s]}`)), `Blackjack, ${what}: the hands on screen aren't the saved hands ${when}`);
    };
    await p.click('#rack .c25'); await p.click('#spot'); await p.click('#deal');
    await still(); await same('after the deal');
    for (const [i, m] of moves.entries()) {
      await p.waitForSelector(`${m}:not([disabled]):not([hidden])`); await p.click(m);
      await still(); await same(`after move ${i + 1} (${m})`);
    }
    await p.waitForSelector('#doneActions:not([hidden])');
    await same('at the payout');
    const totals = () => p.$$eval('#hands .hand .tot', els => els.map(e => e.textContent));
    assert.deepEqual(await totals(), tots, `Blackjack, ${what}: the totals at the payout`);
    await p.reload(); await p.waitForTimeout(400);
    await same('after a reload');
    assert.deepEqual(await totals(), tots, `Blackjack, ${what}: the totals after a reload`);
    await ctx.close();
  }
}
if (cageWants('baccarat')) {
  // 25 on the Banker and 25 on the Tie, and the Banker's natural 9 against the Player's 3: the Banker bet wins 23,
  // the Tie loses 25, and the commission is explained the first time
  const C = (r, s = 'c') => ({ r, s });
  const shoe = Array(100).fill(C(2)).concat([C(10, 'h'), C(10), C(9), C(3)]);
  const { p, ctx } = await sit('baccarat/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
    baccarat: { shoe, phase: 'bet', bets: { player: 0, banker: 0, tie: 0, pp: 0, bp: 0 }, last: null, coup: null, stage: 0, turned: [], road: [], carry: 0, felt: 0 } });
  await p.click('#rack .c25'); await p.click('.spot[data-bet="banker"]'); await p.click('.spot[data-bet="tie"]');
  await p.click('#deal');
  await until(async () => {
    if (await p.isVisible('#reveal') && await p.isEnabled('#reveal')) await p.click('#reveal').catch(() => {});
    return p.isVisible('#doneActions');
  }, 8000, 'Baccarat: the coup never finished');
  assert.equal((await p.textContent('#say')).trim(), 'Banker wins, 9 to 3. The Banker bet wins 23; the Tie loses 25. Down 2. The Banker pays 19 to 20: even money less the house’s 5%, with any fraction of a chip kept toward your next Banker win.');
  await ctx.close();
}

// Three tabs in one browser: Blackjack, Roulette and the floor. The last 100 goes down at Blackjack, then loses.
// The other two follow along: no offer while it's on the felt, and the offer, with the rack dimmed, once it's gone.
if (cageWants('blackjack', 'roulette', 'floor')) {
  const C = (r, s) => ({ r, s });
  const shoe = Array(150).fill(C(2, 'c')).concat([C(10, 'h'), C(6, 'd'), C(10, 'c'), C(10, 's')]); // dealt from the end: 16 against 20
  const { p: bj, ctx } = await sit('blackjack/?fast&seen', {
    cage: { chips: 100, wagered: 900, high: 1000, stakes: 1 },
    blackjack: { shoe, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0 },
  });
  const { p: rou } = await sit('roulette/?fast&seen', {}, { ctx });
  const { p: floor } = await sit('?seen', {}, { ctx });
  await bj.bringToFront();
  await bj.click('#rack .c100'); await bj.click('#spot');
  await until(async () => (await rou.textContent('#purse')) === '0', 3000, 'Roulette in another tab: the stack did not follow');
  await rou.waitForTimeout(300);
  assert.equal(await offered(rou), false, 'Roulette in another tab: offered a stake with 100 on the blackjack felt');
  assert.match(await rou.textContent('.cage-note'), /100 still out on Blackjack/, 'Roulette in another tab: no word on where the chips are');
  assert.equal(await floor.isVisible('#stake'), false, 'the floor in another tab: offered a stake with 100 on the blackjack felt');
  assert.match(await floor.textContent('#outNote'), /100 still out on Blackjack/, 'the floor in another tab: no word on where the chips are');
  await bj.click('#deal');
  await bj.waitForSelector('#playActions:not([hidden])'); await bj.click('#stand');
  await bj.waitForSelector('#doneActions:not([hidden])');
  await until(() => offered(rou), 3000, 'Roulette in another tab: no offer once the last chips were lost at Blackjack');
  assert.deepEqual(await rou.evaluate(() => [...document.querySelectorAll('#rack .chip')].map(b => b.disabled)), [true, true, true, true, true], 'Roulette in another tab: the rack still lit with no chips');
  await until(() => floor.isVisible('#stake'), 3000, 'the floor in another tab: no stake once the last chips were lost');
  assert.equal(await floor.isVisible('#outNote'), false);
  // taking it in one tab puts it away in the others
  await rou.click('.stake-offer button');
  await until(async () => !(await offered(bj)) && !(await floor.isVisible('#stake')), 3000, 'the offer stayed up in the other tabs after the stake');
  await bj.bringToFront();
  await until(async () => (await bj.textContent('#purse')) === '1,000', 3000, 'Blackjack in another tab: the stack did not follow the stake');
  await ctx.close();
}

// Motherlode takes 20 a spin. With 15 there's no spin and no stake (15 isn't under 10), so it says why, and where to
// play instead; the bet can't go up. In the free spins, which need no chips, it says nothing.
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?fast&seen', { cage: { chips: 15, wagered: 985, high: 1000, stakes: 1 } });
  assert.equal(await offered(p), false, 'Motherlode: a stake offered at 15 chips');
  assert.equal((await p.textContent('.cage-note')).trim(), 'Motherlode takes 20 a spin and you have 15. Cherry Bell and Odds & Ends take a chip at a time.', 'Motherlode: no word on why it won’t spin');
  assert.deepEqual(await p.evaluate(() => ['spin', 'betUp'].map(id => document.getElementById(id).disabled)), [true, true], 'Motherlode: spin or + still lit at 15 chips');
  assert.deepEqual(await covered(p), [], 'Motherlode: the note covers the controls');
  await p.evaluate(c => { localStorage.setItem('house-money.cage', JSON.stringify(c)); dispatchEvent(new CustomEvent('house-money:cage')); }, seedCage({ chips: 40, wagered: 985, high: 1000, stakes: 1 }));
  await until(() => p.isHidden('.cage-note'), 2000, 'Motherlode: the note stayed with 40 chips');
  assert.equal(await p.evaluate(() => document.getElementById('betUp').disabled), false, 'Motherlode: + stayed off with 40 chips');
  await ctx.close();
  const free = await sit('motherlode/?seen', { cage: { chips: 15, wagered: 985, high: 1000, stakes: 1 }, motherlode: { bet: 20, free: { left: 8, total: 8, sticky: [], won: 0, bet: 20 } } });
  assert.equal(await free.p.isVisible('.cage-note'), false, 'Motherlode: the note showed in the free spins');
  await free.ctx.close();
}

// A slot with a bet more than the stack (but chips enough for a smaller one): Spin dims and the line says why, naming
// the bet and the chips, and the line goes once the bet fits.
for (const [id, saved, chips, said, fix] of [
  ['cherry-bell', { coins: 3, coin: 5 }, 12, 'A 15 bet is more than your 12 chips. Try fewer coins or a smaller coin.', '#betOne'],
  ['odds-and-ends', { lines: 5, lineBet: 5 }, 12, 'A 25 bet is more than your 12 chips. Play fewer lines or a smaller chip.', '#linesDown'],
  ['motherlode', { bet: 80, free: null }, 30, 'An 80 bet is more than your 30 chips. Bet less to keep playing.', '#betDown'],
]) {
  if (!cageWants(id)) continue;
  const { p, ctx } = await sit(`${id}/?fast&seen`, { cage: { chips, wagered: 1000, high: 1000, stakes: 1 }, [id]: saved });
  await p.waitForTimeout(400);
  assert.equal(await p.isDisabled('#spin'), true, `${id}: Spin lit with the bet over the stack`);
  assert.equal((await p.textContent('#say')).trim(), said, `${id}: no word on why Spin is dimmed`);
  for (let i = 0; i < 3 && await p.isDisabled('#spin'); i++) await p.click(fix);
  assert.equal(await p.isDisabled('#spin'), false, `${id}: Spin still dimmed once the bet was lowered`);
  assert.equal((await p.textContent('#say')).trim(), '', `${id}: the line stayed once the bet fit`);
  await ctx.close();
}
// Motherlode's Auto: the button says Stop while it runs, and when the chips run short it stops and says so. (30 chips
// at 20 a spin, and a steady draw that wins nothing.)
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?fast&seen', { cage: { chips: 30, wagered: 1000, high: 1000, stakes: 1 }, motherlode: { bet: 20, free: null } }, { f: .275 });
  await p.waitForTimeout(400);
  assert.equal((await p.textContent('#auto')).trim(), 'Auto');
  await p.evaluate(() => { window.__auto = []; new MutationObserver(() => window.__auto.push(document.getElementById('auto').textContent)).observe(document.getElementById('auto'), { childList: true, characterData: true, subtree: true }); });
  await p.click('#auto');
  await until(async () => (await p.evaluate(() => window.__auto.at(-1))) === 'Auto', 6000, 'Motherlode: Auto never stopped with 10 chips');
  assert.deepEqual(await p.evaluate(() => window.__auto.filter((t, i, a) => t !== a[i - 1])), ['Stop', 'Auto'], 'Motherlode: Auto running doesn\'t say a tap stops it');
  assert.equal((await p.textContent('#say')).trim(), 'Auto stopped: not enough chips for a 20 bet.', 'Motherlode: Auto stopped without a word');
  assert.equal((await cageOf(p)).chips, 10);
  await ctx.close();
}

// Motherlode's free spins, carried on after a reload: the count only goes up, spin by spin, and the line that said how
// many were left gives way to the count. (No ?fast: every paint while the reels turn is seen.)
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?seen', { cage: { chips: 500, wagered: 0, high: 1000, stakes: 1 },
    motherlode: { bet: 20, free: { left: 8, total: 8, sticky: [], won: 0, bet: 20 }, last: { stops: [0, 0, 0, 0, 0], sticky: [], win: 0, wagered: 20, paid: true } } });
  await p.evaluate(() => {
    window.__counts = [document.getElementById('freeCount').textContent];
    new MutationObserver(() => window.__counts.push(document.getElementById('freeCount').textContent))
      .observe(document.getElementById('freeCount'), { childList: true, characterData: true, subtree: true });
  });
  await until(() => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.motherlode')).free?.left <= 5), 20000, 'Motherlode: three free spins never played');
  const said = await p.textContent('#say');
  const counts = (await p.evaluate(() => window.__counts)).map(t => +/Free spin (\d+) of 8/.exec(t)[1]);
  assert.ok(counts.every((n, i) => !i || n >= counts[i - 1]), `Motherlode: the free-spin count went down: ${counts.join(', ')}`);
  assert.ok(counts.includes(3), `Motherlode: the count never reached spin 3: ${counts.join(', ')}`);
  assert.doesNotMatch(said, /Back down the mine/, 'Motherlode: the line from the reload stayed up through the free spins');
  await ctx.close();
}

// Motherlode's free spins: the pickaxes about to stick glow once the reels have landed, never while they spin (which
// would tell you where they'll land). A steady draw of 0.575 lands two new pickaxes; every moment of the spin is
// watched at its real speed.
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?seen', { cage: { chips: 500, wagered: 0, high: 1000, stakes: 1 },
    motherlode: { bet: 20, free: { left: 2, total: 8, sticky: [], won: 0, bet: 20 }, last: { stops: [0, 0, 0, 0, 0], sticky: [], win: 0, wagered: 20, paid: true } } }, { f: .575 });
  const seen = [];
  for (const end = Date.now() + 10000; Date.now() < end;) {
    const [running, glow] = await p.evaluate(() => [!!window.__ml?.running, window.__ml?.fresh.length ?? -1]);
    seen.push([running, glow]);
    if (seen.some(([r]) => r) && !running) break;
    await p.waitForTimeout(30);
  }
  const spinning = seen.filter(([r]) => r);
  assert.ok(spinning.length > 5, 'Motherlode: the free spin was too quick to watch');
  assert.deepEqual(spinning.filter(([, g]) => g), [], 'Motherlode: the new pickaxes glowed while the reels were spinning');
  await until(async () => (await p.evaluate(() => window.__ml.fresh.length)) === 2, 2000, 'Motherlode: the two new pickaxes never glowed once the reels landed');
  await ctx.close();
}

// Motherlode's free spins ending: the last one plays, a closing card says what they came to ("Free spins", the total,
// "8 spins · 2 pickaxes"), and then the glass is plain reels: the pickaxes that were stuck stay in the picture without
// their gold frames, and nothing sticks to the next spin. A reload while the card is up pays nothing twice, leaves
// nothing on the felt and shows the same picture. (A steady draw of 0.275 wins nothing.)
if (cageWants('motherlode')) {
  const sticky = [[4, 0], [4, 2]];
  const last1 = { bet: 20, free: { left: 1, total: 8, sticky, won: 60, bet: 20 }, last: { stops: [0, 0, 0, 0, 0], sticky, win: 0, wagered: 0, free: true, paid: true } };
  const seed = { cage: { chips: 940, wagered: 60, high: 1000, stakes: 1 }, motherlode: last1 };
  const ml = p => p.evaluate(() => ({ hold: window.__ml.hold, rest: window.__ml.rest }));
  const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.motherlode')));
  // played through: the card, then plain reels
  {
    const { p, ctx } = await sit('motherlode/?seen', seed, { f: .275 });
    await p.waitForSelector('#bigwin:not([hidden])', { timeout: 10000 });
    assert.deepEqual([await p.textContent('#bwTitle'), await p.isVisible('#bwKick'), await p.textContent('#bwNote')], ['Free spins', false, '8 spins · 2 pickaxes'], 'Motherlode: the closing card');
    assert.equal((await p.textContent('#say')).trim(), 'Free spin 8 of 8: no win. The free spins paid 60.');
    await p.click('#bigwin');
    await until(async () => (await ml(p)).hold.length === 0, 2000, 'Motherlode: the pickaxes still stick once the free spins are over');
    assert.deepEqual((await ml(p)).rest, sticky, 'Motherlode: the picture that paid lost its pickaxes');
    // a reload now shows the same picture, with nothing stuck and nothing out
    await p.reload(); await p.waitForTimeout(500);
    assert.deepEqual(await ml(p), { hold: [], rest: sticky }, 'Motherlode: a reload after the free spins shows a different picture');
    assert.deepEqual([(await saved(p)).free, await feltOf(p, 'motherlode'), (await cageOf(p)).chips], [null, 0, 940], 'Motherlode: the free spins left something behind');
    await ctx.close();
  }
  // a reload while the card is up: paid once, nothing out, and the next spin starts clean
  {
    const { p, ctx } = await sit('motherlode/?seen', seed, { f: .275 });
    await p.waitForSelector('#bigwin:not([hidden])', { timeout: 10000 });
    await p.reload(); await p.waitForTimeout(500);
    assert.equal(await p.isVisible('#bigwin'), false);
    assert.deepEqual([(await saved(p)).free, await feltOf(p, 'motherlode'), (await cageOf(p)).chips, (await ml(p)).rest], [null, 0, 940, sticky], 'Motherlode: a reload during the closing card');
    assert.equal((await recordsOf(p)).motherlode?.feature, 60, 'Motherlode: the feature wasn\'t recorded once');
    await p.click('#spin');
    await until(async () => (await cageOf(p)).wagered === 80 && !(await p.evaluate(() => window.__ml.running)) && !(await p.isDisabled('#spin')), 8000, 'Motherlode: the next spin never finished');
    assert.deepEqual([await ml(p), (await saved(p)).last.sticky, await feltOf(p, 'motherlode')], [{ hold: [], rest: [] }, [], 0], 'Motherlode: the free spins carried over into the next spin');
    await ctx.close();
  }
  // Auto stops when the free spins come to 15 times the bet or more, and carries on when they don't
  for (const [won, stops] of [[300, true], [60, false]]) {
    const { p, ctx } = await sit('motherlode/?seen', { ...seed, motherlode: { ...last1, free: { ...last1.free, won } } }, { f: .275 });
    await p.click('#auto');
    await p.waitForSelector('#bigwin:not([hidden])', { timeout: 10000 });
    assert.equal(await p.textContent('#bwTitle'), won >= 300 ? 'Big win' : 'Free spins');
    await p.click('#bigwin');
    if (stops) {
      await p.waitForTimeout(1500);
      assert.deepEqual([(await cageOf(p)).wagered, (await p.textContent('#auto')).trim()], [60, 'Auto'], 'Motherlode: Auto ran on after free spins that paid 15 times the bet');
    } else await until(async () => (await cageOf(p)).wagered > 60, 6000, 'Motherlode: Auto stopped after free spins that paid less than 15 times the bet');
    await ctx.close();
  }
}

// Chips still in play are out on the felt until they're paid: no offer while a slot's reels turn or a video poker
// draw is turning over, even when what's left in the rack is under 10. (No ?fast here: the reels take their time.)
// whether the offer is up, each moment busy (a function run in the page) says the round is still in play
const watchOffer = async (p, busy, ms) => {
  const seen = [];
  for (const end = Date.now() + ms; Date.now() < end;) {
    const [still, up] = await p.evaluate(busy => [new Function(`return ${busy}`)()(), !document.querySelector('.stake-offer').hidden], busy);
    if (!still) break;
    seen.push(up);
    await p.waitForTimeout(40);
  }
  return seen;
};
if (cageWants('cherry-bell')) {
  // 12 chips, 3 coins: 9 left during the spin, and a steady draw of a half comes up empty
  const { p, ctx } = await sit('cherry-bell/?seen', { cage: { chips: 12, wagered: 988, high: 1000, stakes: 1 }, 'cherry-bell': { coins: 3, coin: 1 } }, { f: .5 });
  await p.waitForTimeout(800);
  assert.equal(await offered(p), false, 'Cherry Bell: an offer at 12 chips');
  await p.click('#spin');
  const seen = await watchOffer(p, "() => document.body.classList.contains('spinning')", 8000);
  assert.ok(seen.length > 5, 'Cherry Bell: the spin was too quick to watch');
  assert.ok(seen.every(v => !v), 'Cherry Bell: the offer came up while the reels were turning');
  await until(() => offered(p), 3000, 'Cherry Bell: no offer once the spin lost, with 9 left');
  assert.equal(await feltOf(p, 'cherry-bell'), 0, 'Cherry Bell: the spin left chips on the felt');
  await ctx.close();
}
if (cageWants('video-poker')) {
  // 12 chips, 5 coins of 1 dealt: 7 left. Hold nothing and draw five more junk cards.
  const C = (r, s) => ({ r, s });
  const junk = [C(2, 'c'), C(4, 'd'), C(7, 'h'), C(9, 's'), C(12, 'c')];
  const { p, ctx } = await sit('video-poker/?seen', {
    cage: { chips: 7, wagered: 993, high: 1000, stakes: 1 },
    'video-poker': { phase: 'draw', coin: 1, coins: 5, hand: junk, held: [false, false, false, false, false],
      deck: [C(3, 'h'), C(5, 's'), C(8, 'd'), C(10, 'c'), C(13, 'h')], result: null, felt: 5 },
  });
  assert.equal(await offered(p), false, 'Video Poker: an offer with a hand dealt');
  await p.click('#deal');
  const seen = await watchOffer(p, "() => JSON.parse(localStorage.getItem('house-money.video-poker')).paid !== true", 5000);
  assert.ok(seen.length > 3, 'Video Poker: the draw was too quick to watch');
  assert.ok(seen.every(v => !v), 'Video Poker: the offer came up while the draw was turning over');
  await until(() => offered(p), 3000, 'Video Poker: no offer once the hand lost, with 7 left');
  assert.equal(await feltOf(p, 'video-poker'), 0, 'Video Poker: the hand left chips on the felt');
  await ctx.close();
}

// A reload in the middle of a round settles it, and the felt comes back to nothing (or to the bets left up at craps).
// The books: the rack plus every table's felt, less what Records says the tables have won or lost, is 1,000 for every
// stake the cage has made. Records counts every round once, whenever the page closed.
const IDS = TABLES.map(t => t.id);
const books = p => p.evaluate(async ids => {
  const J = k => JSON.parse(localStorage.getItem(k));
  const c = (await import('/shared/cage.js')).read();
  const recs = (await import('/shared/records.js')).read().tables;
  let felt = 0, net = 0;
  for (const id of ids) { felt += J(`house-money.${id}`)?.felt || 0; net += recs[id]?.net || 0; }
  return { chips: c.chips, felt, net, stakes: c.stakes, recs };
}, IDS);
const balanced = async (p, at) => {
  const b = await books(p);
  assert.equal(b.chips + b.felt - b.net, 1000 * b.stakes, `${at}: the books are off (chips ${b.chips}, felt ${b.felt}, Records net ${b.net})`);
  return b;
};
// clicks a button in the page, then reloads `ms` later (no ?fast: the cards and dice take their real time)
const reloadAfter = async (p, sel, ms) => {
  await p.evaluate(([sel, ms]) => { document.querySelector(sel).click(); setTimeout(() => { window.__go = 1; }, ms); }, [sel, ms]);
  await p.waitForFunction(() => window.__go);
  await p.reload();
};
if (cageWants('blackjack')) {
  // a natural, A and K against 9 and 7, bet 100, and the page closed before the payout: 1,000 - 100 + 250
  const shoe = Array(150).fill({ r: 2, s: 'c' }).concat([{ r: 7, s: 'c' }, { r: 13, s: 'h' }, { r: 9, s: 'd' }, { r: 1, s: 's' }]);
  for (const ms of [0, 60, 140]) {
    const { p, ctx } = await sit('blackjack/?seen', {
      cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
      blackjack: { shoe, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0 },
    });
    await p.click('#rack .c100'); await p.click('#spot');
    await reloadAfter(p, '#deal', ms);
    await until(async () => (await cageOf(p)).chips === 1150, 4000, `Blackjack: the natural was not paid after a reload ${ms} ms after the deal`);
    await p.waitForTimeout(300);
    const b = await balanced(p, `Blackjack, a natural reloaded after ${ms} ms`);
    assert.equal(b.chips, 1150, 'Blackjack: paid twice');
    assert.equal(b.felt, 0, 'Blackjack: the hand stayed on the felt after a reload');
    assert.deepEqual([b.recs.blackjack?.rounds, b.recs.blackjack?.blackjacks], [1, 1], `Blackjack: Records lost the natural reloaded after ${ms} ms`);
    await ctx.close();
  }
  // a natural on 25 with the half chip from an earlier one kept (carry 1), or none kept: the page closed before the
  // payout pays it once, 38 or 37, and the half is used or kept just once
  for (const [carry, won, after] of [[1, 38, 0], [0, 37, 1]]) {
    for (const ms of [0, 100]) {
      const { p, ctx } = await sit('blackjack/?seen', {
        cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
        blackjack: { shoe, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0, carry },
      });
      await p.click('#rack .c25'); await p.click('#spot');
      await reloadAfter(p, '#deal', ms);
      await until(async () => (await cageOf(p)).chips === 1000 + won, 4000, `Blackjack: the natural on 25 (half kept: ${carry}) was not paid ${won} after a reload ${ms} ms after the deal`);
      const said = carry ? `Blackjack! That pays 38, with the half chip kept from before.` : `Blackjack! That pays 37, and the half chip’s kept for your next one.`;
      await until(async () => (await p.textContent('#say')).trim() === said, 3000, `Blackjack: the natural on 25 didn't say "${said}"`);
      await p.reload();
      await p.waitForTimeout(400);
      const b = await balanced(p, `Blackjack, a natural on 25 reloaded after ${ms} ms`);
      const bj = await p.evaluate(() => JSON.parse(localStorage.getItem('house-money.blackjack')));
      assert.deepEqual([b.chips, b.felt, bj.carry, b.recs.blackjack?.rounds], [1000 + won, 0, after, 1], `Blackjack: a natural on 25 with ${carry} half kept, reloaded after ${ms} ms`);
      await ctx.close();
    }
  }
  // the dealer's ace with a king under it, insured: the hand loses 100, the 50 insurance pays 150 back
  const ace = Array(150).fill({ r: 2, s: 'c' }).concat([{ r: 13, s: 'c' }, { r: 9, s: 'h' }, { r: 1, s: 'd' }, { r: 10, s: 's' }]);
  for (const ms of [0, 100]) {
    const { p, ctx } = await sit('blackjack/?seen', {
      cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
      blackjack: { shoe: ace, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0 },
    });
    await p.click('#rack .c100'); await p.click('#spot'); await p.click('#deal');
    await p.waitForSelector('#insActions:not([hidden])');
    await p.waitForFunction(() => !document.getElementById('ins').disabled);
    await reloadAfter(p, '#ins', ms);
    await until(async () => (await books(p)).recs.blackjack?.rounds === 1, 4000, `Blackjack: the insured round was not recorded after a reload ${ms} ms after Insure`);
    await p.waitForTimeout(300);
    const b = await balanced(p, `Blackjack, insured against a dealer blackjack, reloaded after ${ms} ms`);
    assert.deepEqual([b.chips, b.felt, b.recs.blackjack.rounds, b.recs.blackjack.wagered, b.recs.blackjack.net], [1000, 0, 1, 150, 0], 'Blackjack: the insured round');
    await ctx.close();
  }
}
// A round kept as settled but not yet paid (the page closed between the two) is paid and recorded when it opens again.
for (const [id, play] of [
  ['blackjack', async p => {
    await p.click('#rack .c100'); await p.click('#spot'); await p.click('#deal');
    await p.waitForSelector('#playActions:not([hidden])'); await p.click('#stand');
  }],
  ['baccarat', async p => {
    await p.click('#rack .c100'); await p.click('.spot[data-bet="banker"]'); await p.click('#deal');
    // turned over rather than squeezed, the third cards too
    await until(async () => {
      if (await p.isVisible('#reveal') && await p.isEnabled('#reveal')) await p.click('#reveal').catch(() => {});
      return p.isVisible('#doneActions');
    }, 8000, 'Baccarat: the coup never finished');
  }],
]) {
  if (!cageWants(id)) continue;
  // blackjack's shoe deals 19 against the dealer's 17
  const shoe = Array(150).fill({ r: 2, s: 'c' }).concat([{ r: 10, s: 'c' }, { r: 9, s: 'h' }, { r: 7, s: 'd' }, { r: 10, s: 's' }]);
  const { p, ctx } = await sit(`${id}/?fast&seen`, { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
    ...(id === 'blackjack' ? { blackjack: { shoe, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0 } } : {}) });
  await play(p);
  await p.waitForSelector('#doneActions:not([hidden])');
  await p.waitForTimeout(200);
  // back to the moment before the payout: unpaid, the chips not yet in the rack, nothing in Records
  const back = await p.evaluate(id => {
    const s = JSON.parse(localStorage.getItem(`house-money.${id}`));
    const c = JSON.parse(localStorage.getItem('house-money.cage'));
    s.paid = false; s.felt = s.outcome.wagered; c.dev[localStorage.getItem('house-money.device')].p -= s.outcome.back;
    localStorage.setItem(`house-money.${id}`, JSON.stringify(s));
    localStorage.setItem('house-money.cage', JSON.stringify(c));
    localStorage.removeItem('house-money.records');
    return s.outcome.back;
  }, id);
  await p.reload();
  await until(async () => (await books(p)).felt === 0, 4000, `${id}: the unpaid round stayed on the felt`);
  await p.waitForTimeout(300);
  const b = await balanced(p, `${id}: an unpaid round reopened`);
  assert.equal(b.felt, 0, `${id}: the unpaid round stayed on the felt`);
  assert.equal(b.recs[id]?.rounds, 1, `${id}: an unpaid round paid ${back} on reopening but Records lost it`);
  await ctx.close();
}
// Video Poker, a reload while the drawn cards turn over: a royal flush (four to it held, the ace of spades to come) and
// a losing hand, each paid once and recorded once.
if (cageWants('video-poker')) {
  const C = (r, s) => ({ r, s });
  for (const [what, hand, held, deck, chips, net] of [
    ['a royal flush', [C(10, 's'), C(11, 's'), C(12, 's'), C(13, 's'), C(2, 'h')], [true, true, true, true, false], [C(1, 's')], 4995, 3995],
    ['a losing hand', [C(2, 'c'), C(4, 'd'), C(7, 'h'), C(9, 's'), C(12, 'c')], [false, false, false, false, false], [C(3, 'h'), C(5, 's'), C(8, 'd'), C(10, 'c'), C(13, 'h')], 995, -5],
  ]) {
    for (const ms of [0, 60, 150]) {
      const { p, ctx } = await sit('video-poker/?seen', {
        cage: { chips: 995, wagered: 5, high: 1000, stakes: 1 },
        'video-poker': { phase: 'draw', coin: 1, coins: 5, hand, held, deck, result: null, felt: 5 },
      });
      await reloadAfter(p, '#deal', ms);
      await p.waitForTimeout(600);
      const b = await balanced(p, `Video Poker, ${what} reloaded ${ms} ms after Draw`);
      const r = b.recs['video-poker'] || {};
      assert.deepEqual([b.chips, b.felt, r.rounds, r.wagered, r.net], [chips, 0, 1, 5, net], `Video Poker: ${what} reloaded ${ms} ms after Draw`);
      await ctx.close();
    }
  }
}
// Video Poker: the coin can't change mid-hand. Dealt at 5 coins of 5, a tap on the 25 chip while holding does nothing
// (the rack stays on the 5), and the next bet is still 25: after the draw, and after a reload mid-hand or after.
if (cageWants('video-poker')) {
  for (const reload of ['', 'mid-hand', 'after the draw']) {
    const { p, ctx } = await sit('video-poker/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 }, 'video-poker.chip': 5,
      'video-poker': { phase: 'bet', coins: 5, coin: 5, deck: [], hand: [], held: [false, false, false, false, false], result: null, felt: 0 } });
    const at = `Video Poker${reload ? `, reloaded ${reload}` : ''}`;
    const coinNow = async when => {
      const [coin, bet, on] = await p.evaluate(() => [JSON.parse(localStorage.getItem('house-money.video-poker')).coin, document.getElementById('betM').textContent,
        document.querySelector('#rack .chip.on')?.getAttribute('aria-label')]);
      assert.deepEqual([coin, bet, on], [5, '25', '5 chip'], `${at}: the coin ${when}`);
    };
    await p.click('#deal');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('house-money.video-poker')).phase === 'draw');
    await p.click('#rack .c25', { force: true });
    await p.waitForTimeout(200);
    await coinNow('after a tap on the 25 mid-hand');
    if (reload === 'mid-hand') { await p.reload(); await p.waitForTimeout(400); await coinNow('after a reload mid-hand'); }
    await p.waitForSelector('#deal:not([disabled])'); await p.click('#deal');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('house-money.video-poker')).paid === true);
    await p.waitForTimeout(300);
    await coinNow('after the draw');
    if (reload === 'after the draw') { await p.reload(); await p.waitForTimeout(400); await coinNow('after a reload'); }
    // and once the hand is paid, the rack picks again
    await p.click('#rack .c25');
    assert.equal(await p.textContent('#betM'), '125', `${at}: the rack didn't pick the 25 once the hand was over`);
    await ctx.close();
  }
}
// Craps: 10 on the pass line, the dice rigged to 3 and 4, and a reload half a second after Roll, the dice in the air.
if (cageWants('craps')) {
  const { p, ctx } = await sit('craps/?seen', {
    cage: { chips: 990, wagered: 10, high: 1000, stakes: 1 },
    craps: { bets: { pass: 10 }, point: 0, history: [], felt: 10 },
  });
  await p.evaluate(() => { const q = [2 / 6, 3 / 6]; crypto.getRandomValues = a => { a[0] = Math.floor(q.shift() * 2 ** 32 + 1); return a; }; });
  await reloadAfter(p, '#roll', 500);
  await p.waitForTimeout(600);
  const b = await balanced(p, 'Craps, reloaded mid-throw');
  assert.equal(b.chips + b.felt, 1010, 'Craps: the roll was not paid exactly once');
  assert.deepEqual([b.recs.craps?.rounds, b.recs.craps?.wagered, b.recs.craps?.net], [1, 10, 10], 'Craps: Records lost the roll reloaded mid-throw');
  await ctx.close();
}
// Craps, a first visit on a phone: the pass line, the last thing on the layout, is brought up to sit just above the
// dock, inside the screen, and only the stickman says to start there. A come bet that travels says where it went.
if (cageWants('craps')) {
  for (const size of [phone, { viewport: { width: 1280, height: 800 } }]) {
    const at = `Craps at ${size.viewport.width}x${size.viewport.height}`;
    const { p, ctx } = await sit('craps/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } }, { size });
    const [line, dock, h] = await p.evaluate(() => [document.querySelector('.line.pass').getBoundingClientRect().toJSON(), document.querySelector('.dock').getBoundingClientRect().toJSON(), innerHeight]);
    assert.ok(line.top >= 0 && line.bottom <= dock.top + 1 && dock.bottom <= h + 1, `${at}: the pass line (${Math.round(line.top)} to ${Math.round(line.bottom)}) isn't in view above the dock (from ${Math.round(dock.top)})`);
    assert.equal((await p.textContent('#say')).trim(), 'Coming out. Bets on the pass line.');
    assert.equal((await p.textContent('#onfelt')).trim(), '', `${at}: the dock repeats the stickman`);
    await ctx.close();
  }
  const { p, ctx } = await sit('craps/?fast&seen', { cage: { chips: 985, wagered: 15, high: 1000, stakes: 1 }, craps: { bets: { pass: 10, come: 5 }, point: 4, history: [], felt: 15 } });
  await p.evaluate(() => { const q = [2 / 6, 2 / 6]; crypto.getRandomValues = a => { a[0] = Math.floor(q.shift() * 2 ** 32 + 1); return a; }; });
  await p.click('#roll');
  await until(async () => /^Six/.test((await p.textContent('#say')).trim()), 4000, 'Craps: the roll never landed');
  assert.equal((await p.textContent('#say')).trim(), 'Six, the hard way. Your come bet goes to the 6.');
  assert.equal((await p.textContent('#onfelt')).trim(), 'On the layout: 15');
  await ctx.close();
}
// Craps: 5 on the 6 is paid down to 5, and the line says what would pay whole; a sixth chip makes it whole and the
// line goes. 5 in odds behind the 5 is owed 7 and a half, and the line says the half is kept.
if (cageWants('craps')) {
  const { p, ctx } = await sit('craps/?fast&seen', { cage: { chips: 990, wagered: 10, high: 1000, stakes: 1 }, craps: { bets: { pass: 10 }, point: 5, history: [], felt: 10 } });
  await p.click('#rack .c5'); await p.click('[data-spot="place6"]');
  assert.equal((await p.textContent('#say')).trim(), 'Five on the 6 pays 5. Make it 6 and it pays 7.');
  await p.click('#rack .c1'); await p.click('[data-spot="place6"]');
  assert.equal((await p.textContent('#say')).trim(), '', 'Craps: the line about 5 on the 6 stayed once it was 6');
  await p.click('#rack .c5'); await p.click('[data-spot="passOdds"]');
  assert.equal((await p.textContent('#say')).trim(), 'Five in odds on the 5 pays 7 and a half. The fraction’s kept toward your next odds win.');
  await ctx.close();
}
// Craps: 5 in odds behind a 5 with half a chip kept from before (15 thirtieths), the dice rigged to 2 and 3, and a
// reload mid-throw: the odds pay 8 (7½ and the half kept), once, and nothing is kept after.
if (cageWants('craps')) {
  for (const ms of [100, 500]) {
    const { p, ctx } = await sit('craps/?seen', {
      cage: { chips: 990, wagered: 10, high: 1000, stakes: 1 },
      craps: { bets: { pass: 5, passOdds: 5 }, point: 5, history: [], felt: 10, carry: 15 },
    });
    await p.evaluate(() => { const q = [1 / 6, 2 / 6]; crypto.getRandomValues = a => { a[0] = Math.floor(q.shift() * 2 ** 32 + 1); return a; }; });
    await reloadAfter(p, '#roll', ms);
    await p.waitForTimeout(600);
    const b = await balanced(p, `Craps, odds with half a chip kept, reloaded ${ms} ms after Roll`);
    const carry = await p.evaluate(() => JSON.parse(localStorage.getItem('house-money.craps')).carry);
    assert.deepEqual([b.chips, b.felt, carry, b.recs.craps?.rounds, b.recs.craps?.net], [1008, 5, 0, 1, 13], `Craps: odds with half a chip kept, reloaded ${ms} ms after Roll`);
    await ctx.close();
  }
}
if (cageWants('video-poker')) {
  // a losing draw, and the page closed while the cards were turning
  const C = (r, s) => ({ r, s });
  const { p, ctx } = await sit('video-poker/?seen', {
    cage: { chips: 7, wagered: 993, high: 1000, stakes: 1 },
    'video-poker': { phase: 'draw', coin: 1, coins: 5, hand: [C(2, 'c'), C(4, 'd'), C(7, 'h'), C(9, 's'), C(12, 'c')],
      held: [false, false, false, false, false], deck: [C(3, 'h'), C(5, 's'), C(8, 'd'), C(10, 'c'), C(13, 'h')], result: null, felt: 5 },
  });
  await p.click('#deal'); await p.waitForTimeout(60);
  await p.reload(); await p.waitForTimeout(400);
  assert.equal(await feltOf(p, 'video-poker'), 0, 'Video Poker: a lost hand stayed on the felt after a reload');
  assert.equal(await offered(p), true, 'Video Poker: no offer after a reload with 7 left and nothing out');
  await ctx.close();
}
if (cageWants('craps')) {
  // 10 on the pass line, a 7 on the come-out (the dice draw 3 and 4), and a reload while they're in the air
  const { p, ctx } = await sit('craps/?seen', {
    cage: { chips: 990, wagered: 10, high: 1000, stakes: 1 },
    craps: { bets: { pass: 10 }, point: 0, history: [], felt: 10 },
  });
  await p.evaluate(() => { const q = [2 / 6, 3 / 6]; crypto.getRandomValues = a => { a[0] = Math.floor(q.shift() * 2 ** 32 + 1); return a; }; });
  await p.click('#roll'); await p.waitForTimeout(200);
  assert.equal(await feltOf(p, 'craps'), 20, 'Craps: the win waiting for the rack is not counted on the felt');
  await p.reload(); await p.waitForTimeout(400);
  const c = await cageOf(p);
  assert.deepEqual([c.chips, await feltOf(p, 'craps')], [1000, 10], 'Craps: the pass line win and the bet left up');
  await ctx.close();
}
if (cageWants('cherry-bell')) {
  // the page closed mid-spin: the spin is paid on the next visit and nothing stays out
  const { p, ctx } = await sit('cherry-bell/?seen', { cage: { chips: 500, wagered: 500, high: 1000, stakes: 1 } });
  await p.waitForTimeout(600);
  await p.click('#spin'); await p.waitForTimeout(150);
  assert.ok(await feltOf(p, 'cherry-bell') > 0, 'Cherry Bell: the spin is not counted on the felt while it turns');
  await p.reload(); await p.waitForTimeout(1000);
  assert.equal(await feltOf(p, 'cherry-bell'), 0, 'Cherry Bell: the spin stayed on the felt after a reload');
  await ctx.close();
}

// Many rounds in a row: after every one the felt is empty and the stack is exactly 1,000 plus what Records says.
for (const [id, n] of [['cherry-bell', 30], ['odds-and-ends', 20]]) {
  if (!cageWants(id)) continue;
  const { p, ctx } = await sit(`${id}/?fast&seen`, { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } });
  await p.waitForTimeout(600);
  for (let i = 0; i < n; i++) {
    await p.click('#spin');
    await until(() => p.evaluate(() => !document.body.classList.contains('spinning') && !document.getElementById('spin').disabled), 5000, `${id}: spin ${i + 1} never finished`);
    const [c, felt, net] = await p.evaluate(async id => {
      const J = k => JSON.parse(localStorage.getItem(k));
      return [(await import('/shared/cage.js')).read(), J(`house-money.${id}`).felt, (await import('/shared/records.js')).table(id).net];
    }, id);
    assert.equal(felt, 0, `${id}: chips left on the felt after spin ${i + 1}`);
    assert.equal(c.chips, 1000 + net, `${id}: the stack and Records disagree after spin ${i + 1}`);
  }
  await ctx.close();
}

// Two tabs at one table: the tab opened last takes the seat, and the other waits under a note until Play here, so a
// bet put down in one is never lost to the other's copy of the table, and a round is never paid twice. A tab on its
// own never waits.
const idleIn = p => p.isVisible('dialog.seat-idle');
// a tap that goes round the note, the way a late or lost message between the tabs would leave it open
const tapUnder = (p, sel) => p.evaluate(sel => document.querySelector(sel).click(), sel);
for (const [id, name, spot, noBC] of [
  ['blackjack', 'Blackjack', '#spot', false], ['baccarat', 'Baccarat', '.spot[data-bet="banker"]', false],
  ['craps', 'Craps', '[data-spot="pass"]', false], ['blackjack', 'Blackjack', '#spot', true],
]) {
  if (!cageWants(id)) continue;
  const at = `two tabs at ${name}${noBC ? ' (no BroadcastChannel)' : ''}`;
  const ctx = await browser.newContext(phone);
  // Safari before 15.4 has no BroadcastChannel: the tabs tell each other through storage instead
  if (noBC) await ctx.addInitScript(() => { delete globalThis.BroadcastChannel; });
  const { p: a } = await sit(`${id}/?fast&seen`, { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } }, { ctx });
  await a.waitForTimeout(500);
  assert.equal(await idleIn(a), false, `${at}: a tab on its own went idle`);
  const { p: b } = await sit(`${id}/?fast&seen`, {}, { ctx });
  await until(() => idleIn(a), 3000, `${at}: the first tab didn't make way for the second`);
  assert.equal((await a.textContent('dialog.seat-idle p')).trim(), `${name} is open in another tab.`);
  assert.equal(await idleIn(b), false, `${at}: the newer tab went idle`);
  await b.click('#rack .c5'); await b.click(spot);
  await tapUnder(a, `#rack .c100`); await tapUnder(a, spot);
  await a.waitForTimeout(300);
  let n = await balanced(b, at);
  assert.deepEqual([n.chips, n.felt], [995, 5], `${at}: the idle tab moved chips`);
  // Play here: the first tab reads the table afresh, with the 5 on it, and the second makes way
  await a.click('dialog.seat-idle .btn.gold');
  await a.waitForSelector('#rack');
  await until(() => idleIn(b), 3000, `${at}: Play here didn't take the seat back`);
  assert.equal(await idleIn(a), false, `${at}: still idle after Play here`);
  await a.click('#rack .c100'); await a.click(spot);
  await a.waitForTimeout(300);
  n = await balanced(a, at);
  assert.deepEqual([n.chips, n.felt], [895, 105], `${at}: the bets from both tabs`);
  await ctx.close();
}
// A royal flush dealt once, waiting to be drawn, open in two tabs: drawn and paid once.
if (cageWants('video-poker')) {
  const C = (r, s) => ({ r, s });
  const royal = { phase: 'draw', coin: 1, coins: 5, hand: [C(10, 's'), C(11, 's'), C(12, 's'), C(13, 's'), C(1, 's')], held: [true, true, true, true, true], deck: [C(2, 'c')], result: null, felt: 5 };
  const { p: a, ctx } = await sit('video-poker/?fast&seen', { cage: { chips: 995, wagered: 5, high: 1000, stakes: 1 }, 'video-poker': royal });
  const { p: b } = await sit('video-poker/?fast&seen', {}, { ctx });
  await until(() => idleIn(a), 3000, 'two tabs at Video Poker: the first tab stayed live');
  await b.click('#deal');
  await until(async () => (await cageOf(b)).chips === 4995, 3000, 'two tabs at Video Poker: the royal was not paid');
  await tapUnder(a, '#deal');
  await a.waitForTimeout(600);
  const n = await balanced(b, 'two tabs at Video Poker');
  assert.deepEqual([n.chips, n.recs['video-poker'].rounds, n.recs['video-poker'].royal], [4995, 1, 1], 'two tabs at Video Poker: the royal was paid twice');
  await ctx.close();
  // and with the message between the tabs lost: the stored hand has been drawn by another tab since this one read it,
  // so Draw reads the table afresh instead of drawing its own copy
  const one = await sit('video-poker/?fast&seen', { cage: { chips: 995, wagered: 5, high: 1000, stakes: 1 }, 'video-poker': royal });
  await one.p.evaluate(c => {
    const s = JSON.parse(localStorage.getItem('house-money.video-poker'));
    Object.assign(s, { phase: 'done', paid: true, felt: 0, result: { id: 'royal', name: 'Royal Flush', pay: 4000 }, rev: 'another.1' });
    localStorage.setItem('house-money.video-poker', JSON.stringify(s));
    localStorage.setItem('house-money.cage', JSON.stringify(c));
  }, seedCage({ chips: 4995, wagered: 5, high: 4995, stakes: 1 }));
  await one.p.click('#deal');
  await one.p.waitForTimeout(800);
  assert.equal((await cageOf(one.p)).chips, 4995, 'Video Poker: a hand another tab had drawn was drawn and paid again');
  assert.match(await one.p.textContent('#say'), /Royal Flush/, 'Video Poker: the table did not pick up the drawn hand');
  await one.ctx.close();
}
// Roulette: 5 on red and the wheel spinning in one tab (it comes up 1, red); a second tab opens mid-spin and puts 100
// on black. The spin is paid once, and the 100 stays down.
if (cageWants('roulette')) {
  const { p: a, ctx } = await sit('roulette/?seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } }, { f: 1.5 / 2 ** 32 });
  await a.click('#rack .c5'); await a.click('[data-k="red"]');
  await a.click('#spin');
  await a.waitForTimeout(1500);
  const { p: b } = await sit('roulette/?seen', {}, { ctx });
  await until(() => idleIn(a), 3000, 'two tabs at Roulette: the spinning tab stayed live');
  await b.click('#rack .c100'); await b.click('[data-k="black"]');
  await a.waitForTimeout(8000);   // the first tab's spin would be over
  const n = await balanced(b, 'two tabs at Roulette');
  assert.deepEqual([n.chips, n.felt, n.recs.roulette?.rounds], [905, 100, 1], 'two tabs at Roulette: the bet on black or the spin went astray');
  await ctx.close();
}

// Enter and Space on a focused button, link or rack chip do what it does, and never the table's own Enter or Space
// (deal, roll, spin). With nothing focused, the table's key still plays.
{
  const keyed = async (p, sel, key) => { await p.focus(sel); await p.keyboard.press(key); await p.waitForTimeout(250); };
  const savedOf = (p, id) => p.evaluate(id => JSON.parse(localStorage.getItem(`house-money.${id}`)) || {}, id);
  const menuUp = p => p.isVisible('dialog.sheet[open]');
  const menuBy = async (p, key, at) => {
    await keyed(p, '.menu-btn', key);
    assert.equal(await menuUp(p), true, `${at}: ${key === ' ' ? 'Space' : key} on Menu didn't open the menu`);
    await p.keyboard.press('Escape');
    await until(async () => !(await menuUp(p)), 2000, `${at}: the menu didn't close`);
  };
  const unfocused = async (p, key) => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press(key); };
  const checked = (p, sel) => p.getAttribute(sel, 'aria-checked');
  const fresh = { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } };
  const plays = {
    blackjack: async p => {
      await p.click('#rack .c25'); await p.click('#spot');
      await keyed(p, '#clear', 'Enter');
      assert.deepEqual([(await savedOf(p, 'blackjack')).phase, (await savedOf(p, 'blackjack')).bet, (await cageOf(p)).chips], ['bet', 0, 1000], 'Blackjack: Enter on Clear dealt instead of clearing');
      await p.click('#spot');
      for (const key of ['Enter', ' ']) await menuBy(p, key, 'Blackjack');
      assert.deepEqual([(await savedOf(p, 'blackjack')).phase, (await savedOf(p, 'blackjack')).bet], ['bet', 25], 'Blackjack: Enter on Menu dealt');
      await unfocused(p, 'Enter');
      await until(async () => (await savedOf(p, 'blackjack')).phase !== 'bet', 3000, 'Blackjack: Enter with nothing focused did not deal');
    },
    craps: async p => {
      await keyed(p, '#clear', ' ');
      assert.deepEqual([(await savedOf(p, 'craps')).bets?.pass || 0, (await savedOf(p, 'craps')).history.length], [0, 0], 'Craps: Space on Take down rolled instead of taking the pass bet down');
      await p.click('#rack .c5'); await p.click('[data-spot="pass"]');
      await p.focus('.bar .back'); await p.keyboard.press('Enter');
      await p.waitForURL(base, { timeout: 3000 }).catch(() => assert.fail('Craps: Enter on the Floor link did not go to the floor'));
      assert.deepEqual([(await savedOf(p, 'craps')).bets.pass, (await savedOf(p, 'craps')).history.length], [5, 0], 'Craps: Enter on the Floor link rolled the dice');
      await p.goto(`${base}craps/?fast&seen`); await p.waitForTimeout(300);
      await unfocused(p, 'Enter');
      await until(async () => (await savedOf(p, 'craps')).history.length === 1, 4000, 'Craps: Enter with nothing focused did not roll');
    },
    roulette: async p => {
      await p.click('#rack .c5'); await p.click('[data-k="red"]');
      await keyed(p, '#rack .c25', ' ');
      assert.equal(await checked(p, '#rack .c25'), 'true', 'Roulette: Space on the 25 chip did not pick it');
      assert.deepEqual([(await savedOf(p, 'roulette')).bets, (await savedOf(p, 'roulette')).history.length], [{ red: 5 }, 0], 'Roulette: Space on a rack chip spun');
      await keyed(p, '#clear', ' ');
      assert.deepEqual([(await savedOf(p, 'roulette')).bets, (await savedOf(p, 'roulette')).history.length], [{}, 0], 'Roulette: Space on Clear spun instead of clearing');
      await p.click('[data-k="red"]');
      await unfocused(p, ' ');
      await until(async () => (await savedOf(p, 'roulette')).history.length === 1, 4000, 'Roulette: Space with nothing focused did not spin');
    },
    'cherry-bell': async p => {
      await menuBy(p, ' ', 'Cherry Bell');
      await menuBy(p, 'Enter', 'Cherry Bell');
      await keyed(p, '#coinSize .chip:nth-of-type(2)', ' ');
      assert.equal(await checked(p, '#coinSize .chip:nth-of-type(2)'), 'true', 'Cherry Bell: Space on coin size 2 did not pick it');
      assert.equal((await cageOf(p)).chips, 1000, 'Cherry Bell: Space on Menu or a coin size pulled the handle');
      await unfocused(p, ' ');
      await until(async () => (await cageOf(p)).wagered > 0, 3000, 'Cherry Bell: Space with nothing focused did not pull');
    },
    baccarat: async p => {
      await p.click('#rack .c25'); await p.click('.spot[data-bet="banker"]');
      await keyed(p, '#clear', 'Enter');
      assert.deepEqual([(await savedOf(p, 'baccarat')).phase, (await savedOf(p, 'baccarat')).bets.banker], ['bet', 0], 'Baccarat: Enter on Clear dealt instead of clearing');
      await p.click('.spot[data-bet="banker"]');
      await menuBy(p, 'Enter', 'Baccarat');
      await unfocused(p, 'Enter');
      await until(async () => (await savedOf(p, 'baccarat')).phase !== 'bet', 3000, 'Baccarat: Enter with nothing focused did not deal');
    },
    'video-poker': async p => {
      await keyed(p, '#rack .c25', 'Enter');
      assert.equal(await checked(p, '#rack .c25'), 'true', 'Video Poker: Enter on the 25 chip did not pick it');
      await menuBy(p, 'Enter', 'Video Poker');
      assert.equal((await cageOf(p)).chips, 1000, 'Video Poker: Enter on a chip or Menu dealt');
      await unfocused(p, 'Enter');
      await until(async () => (await savedOf(p, 'video-poker')).phase === 'draw', 3000, 'Video Poker: Enter with nothing focused did not deal');
    },
    motherlode: async p => {
      await menuBy(p, ' ', 'Motherlode');
      const bet = (await savedOf(p, 'motherlode')).bet || 20;
      await keyed(p, '#betUp', ' ');
      assert.ok((await savedOf(p, 'motherlode')).bet > bet, 'Motherlode: Space on + did not raise the bet');
      assert.equal((await cageOf(p)).chips, 1000, 'Motherlode: Space on Menu or + spun');
      await unfocused(p, ' ');
      await until(async () => (await cageOf(p)).wagered > 0, 3000, 'Motherlode: Space with nothing focused did not spin');
    },
    'odds-and-ends': async p => {
      await menuBy(p, ' ', 'Odds & Ends');
      await keyed(p, '#linesDown', ' ');
      assert.equal((await savedOf(p, 'odds-and-ends')).lines, 4, 'Odds & Ends: Space on the lines − did not take a line off');
      assert.equal((await cageOf(p)).chips, 1000, 'Odds & Ends: Space on Menu or − spun');
      await unfocused(p, ' ');
      await until(async () => (await cageOf(p)).wagered > 0, 3000, 'Odds & Ends: Space with nothing focused did not spin');
    },
  };
  for (const [id, play] of Object.entries(plays)) {
    if (!cageWants(id)) continue;
    const { p, ctx } = await sit(`${id}/?fast&seen`, id === 'craps' ? { ...fresh, craps: { bets: { pass: 10 }, point: 0, history: [], felt: 10 } } : fresh,
      { size: { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' } });   // (reduced motion: headless Chromium reports the fade from page to page after a link as a page error)
    await p.waitForTimeout(400);
    await play(p);
    await ctx.close();
  }
}

// ---------- what a screen reader hears ----------
// Read from the browser's own accessibility tree (through the DevTools protocol), the way a screen reader gets it:
// [{ role, name, pressed, focused }] for every node in the page that has a name.
async function heard(p) {
  const cdp = await p.context().newCDPSession(p);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  const prop = (n, k) => n.properties?.find(x => x.name === k)?.value?.value;
  return nodes.filter(n => !n.ignored && n.name?.value).map(n => ({ role: n.role?.value, name: n.name.value, pressed: prop(n, 'pressed'), focused: !!prop(n, 'focused') }));
}
const NAMES = ['', 'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
const SUITS = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const cardName = c => `${NAMES[c.r]} of ${SUITS[c.s]}`;

// Video Poker: each card is named on its button and its Hold button, after the deal, after a hold and after the draw,
// and each card is one tab stop (its Hold button).
if (cageWants('video-poker')) {
  const { p, ctx } = await sit('video-poker/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } });
  const names = async () => (await heard(p)).filter(n => n.role === 'button' && /^(Hold )?[Cc]ard \d/.test(n.name));
  const want = (hand, held) => hand.flatMap((c, i) => [
    { role: 'button', name: `Card ${i + 1}: ${cardName(c)}`, pressed: undefined, focused: false },
    { role: 'button', name: `Hold card ${i + 1}, ${cardName(c)}`, pressed: held[i] ? 'true' : 'false', focused: false },
  ]);
  assert.deepEqual((await names()).map(n => n.name).slice(0, 2), ['Card 1: face down', 'Hold card 1'], 'Video Poker: the cards before a deal');
  await p.click('#deal');
  await until(async () => !(await p.isDisabled('#deal')), 3000, 'Video Poker: the deal never finished');
  const saved = () => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.video-poker')));
  let s = await saved();
  assert.deepEqual(await names(), want(s.hand, [0, 0, 0, 0, 0]), 'Video Poker: the cards aren\'t named after the deal');
  await p.keyboard.press('2');
  assert.deepEqual((await names())[3], want(s.hand, [0, 1, 0, 0, 0])[3], 'Video Poker: Hold card 2 isn\'t pressed after the 2 key');
  assert.deepEqual(await p.$$eval('.cardwrap', els => els.map(e => e.tabIndex)), [-1, -1, -1, -1, -1], 'Video Poker: a card takes a tab stop of its own');
  await p.click('#deal');
  await until(async () => (await saved()).paid === true, 3000, 'Video Poker: the draw never finished');
  s = await saved();
  assert.deepEqual((await names()).filter(n => !n.name.startsWith('Hold')).map(n => n.name), s.hand.map((c, i) => `Card ${i + 1}: ${cardName(c)}`), 'Video Poker: the cards aren\'t named after the draw');
  await ctx.close();
}

// The slots say what landed: the reels' picture is named for what's on the line (or rows) after every spin, and the
// dealer's line always says how it came out, a losing spin too, once (the amount under the reels isn't read out as
// well). Odds & Ends goes through its winning lines in a caption that isn't read out, and its line stays put.
const reelsName = async p => (await heard(p)).find(n => n.role === 'image' && /row|line|reels/i.test(n.name))?.name;
const sayOf = async p => (await p.textContent('#say')).trim();
const after = async (p, what, ms = 8000) => until(async () => !!(await sayOf(p)) && !(await p.isDisabled('#spin')), ms, `${what}: the spin never finished`);
if (cageWants('cherry-bell')) {
  const { p, ctx } = await sit('cherry-bell/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 }, 'cherry-bell': { coins: 1, coin: 1 } }, { f: .5 });
  await p.click('#spin');
  await after(p, 'Cherry Bell');
  const line = await p.evaluate(() => import('/cherry-bell/js/machine.js').then(M => import('/shared/reels.js').then(R => R.window(M.REELS, JSON.parse(localStorage.getItem('house-money.cherry-bell')).last.stops, 3, 1).map(c => c[1]))));
  const words = line.map(x => (x === 'bar' ? 'BAR' : x));
  assert.equal(await reelsName(p), `On the pay line: ${words.join(', ')}.`, 'Cherry Bell: the reels aren\'t named for the pay line');
  const said = words.join(', ');
  assert.equal(await sayOf(p), `${said[0].toUpperCase()}${said.slice(1)}. Nothing this time.`, 'Cherry Bell: a losing pull says nothing');
  await ctx.close();
}
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 }, motherlode: { bet: 20, free: null } }, { f: .275 });
  assert.equal(await p.getAttribute('#paid', 'aria-hidden'), 'true', 'Motherlode: the amount under the reels is read out as well as the line');
  await p.click('#spin');
  await after(p, 'Motherlode');
  assert.equal(await sayOf(p), 'No win.', 'Motherlode: a losing spin says nothing');
  assert.match(await reelsName(p), /^Top row: [a-z0-9 ]+(, [a-z0-9 ]+){4}\. Middle row: .+\. Bottom row: .+\.$/, 'Motherlode: the reels aren\'t named for what landed');
  await ctx.close();
  const { p: q, ctx: c2 } = await sit('motherlode/?seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 },
    motherlode: { bet: 20, free: { left: 5, total: 8, sticky: [], won: 0, bet: 20 }, last: { stops: [0, 0, 0, 0, 0], sticky: [], win: 0, wagered: 20, paid: true } } }, { f: .275 });
  await until(async () => /^Free spin 4 of 8: /.test(await sayOf(q)), 8000, 'Motherlode: a free spin with no win says nothing');
  assert.match(await sayOf(q), /^Free spin 4 of 8: no win\.( A pickaxe sticks\.| \d pickaxes stick\.)?$/);
  await c2.close();
}
if (cageWants('odds-and-ends')) {
  const { p, ctx } = await sit('odds-and-ends/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 }, 'odds-and-ends': { lines: 5, lineBet: 1 } }, { f: .04 });
  assert.equal(await p.getAttribute('#paid', 'aria-hidden'), 'true', 'Odds & Ends: the amount under the drawer is read out as well as the line');
  await p.click('#spin');
  await after(p, 'Odds & Ends');
  const said = await sayOf(p);
  assert.match(said, /^2 lines pay \d+\.$/, 'Odds & Ends: a two-line win');
  assert.match(await reelsName(p), /^Top row: .+\. Middle row: .+\. Bottom row: .+\. Lines \d and \d win\.$/, 'Odds & Ends: the drawer isn\'t named for what landed');
  await until(async () => !!(await p.textContent('#lineCap')).trim(), 4000, 'Odds & Ends: the winning lines never went round in the caption');
  await p.waitForTimeout(1800);
  assert.equal(await sayOf(p), said, 'Odds & Ends: the winning lines go round through the line that\'s read out');
  assert.equal(await p.getAttribute('#lineCap', 'aria-hidden'), 'true');
  await ctx.close();
  const { p: q, ctx: c2 } = await sit('odds-and-ends/?fast&seen', { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 }, 'odds-and-ends': { lines: 1, lineBet: 1 } }, { f: .5 });
  await q.click('#spin');
  await after(q, 'Odds & Ends');
  assert.equal(await sayOf(q), 'No luck. Try again.', 'Odds & Ends: a losing spin says nothing');
  await c2.close();
}

// Focus after Deal: the button you pressed hides, and focus goes on to the next one rather than to the page (where a
// screen reader starts again from the top). Blackjack through insurance, a hand and the payout, and Baccarat through
// the deal and Turn them over, all by keyboard at 1280x800. With nothing focused, Enter deals and focus stays put.
const focusedName = async p => (await heard(p)).filter(n => n.focused).map(n => n.name).at(-1) ?? 'the page';
const desk = { viewport: { width: 1280, height: 800 } };
if (cageWants('blackjack')) {
  const C = (r, s = 'c') => ({ r, s });
  const shoe = Array(150).fill(C(2)).concat([C(10), C(1, 'h'), C(7), C(9, 'h'), C(10, 'd')].reverse());
  const bj = { shoe, phase: 'bet', bet: 25, last: 25, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 25, carry: 0 };
  const { p, ctx } = await sit('blackjack/?fast&seen', { cage: { chips: 975, wagered: 25, high: 1000, stakes: 1 }, blackjack: bj }, { size: desk });
  const phase = () => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.blackjack')).phase);
  await p.focus('#deal'); await p.keyboard.press('Enter');
  await p.waitForSelector('#insActions:not([hidden])', { timeout: 3000 });
  assert.equal(await focusedName(p), 'No insurance', 'Blackjack: focus after Deal');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#playActions:not([hidden])', { timeout: 3000 });
  assert.equal(await focusedName(p), 'Hit', 'Blackjack: focus after No insurance');
  await p.focus('#stand'); await p.keyboard.press('Enter');
  await p.waitForSelector('#doneActions:not([hidden])', { timeout: 3000 });
  assert.equal(await focusedName(p), 'Same bet: 25', 'Blackjack: focus after Stand');
  // nothing focused: Enter deals the same bet again, and focus isn't moved
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Enter');
  await until(async () => (await phase()) !== 'done', 3000, 'Blackjack: Enter with nothing focused didn\'t deal');
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.activeElement === document.body), true, 'Blackjack: focus moved though it wasn\'t on a button');
  await ctx.close();
}
if (cageWants('baccarat')) {
  const C = (r, s = 'c') => ({ r, s });
  const bets = { player: 0, banker: 25, tie: 0, pp: 0, bp: 0 };
  const { p, ctx } = await sit('baccarat/?fast&seen', { cage: { chips: 975, wagered: 25, high: 1000, stakes: 1 },
    baccarat: { shoe: Array(100).fill(C(2)).concat([C(10, 'h'), C(10), C(9), C(3)]), phase: 'bet', bets, last: bets, coup: null, stage: 0, turned: [], road: [], carry: 0, felt: 25 } }, { size: desk });
  await p.focus('#deal'); await p.keyboard.press('Enter');
  await p.waitForSelector('#revealActions:not([hidden]) #reveal:not([disabled])', { timeout: 3000 });
  assert.equal(await focusedName(p), 'Turn them over', 'Baccarat: focus after Deal');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#doneActions:not([hidden]) #again:not([disabled])', { timeout: 5000 });
  assert.equal(await focusedName(p), 'Same bet: 25', 'Baccarat: focus after Turn them over');
  await ctx.close();
}

// Reduced motion: no animation runs on and on (one cut short to .01ms flickers through its frames at random): Cherry
// Bell's lamps during a spin, Video Poker's winning row, Motherlode's lanterns and big-win title, Baccarat's nudge on a
// card waiting to be turned.
if (cageWants('cherry-bell', 'video-poker', 'motherlode', 'baccarat')) {
  const endless = p => p.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity)
    .map(a => `${a.animationName || 'an animation'} on ${a.effect.target?.className}`));
  const rm = { ...phone, reducedMotion: 'reduce' };
  const fresh = { cage: { chips: 1000, wagered: 0, high: 1000, stakes: 1 } };
  const C = (r, s) => ({ r, s });
  for (const [id, saved, during] of [
    // (a spin under reduced motion is over in a blink: the machine is dressed as it is while one turns)
    ['cherry-bell', fresh, async p => p.evaluate(() => document.body.classList.add('spinning'))],
    ['video-poker', { ...fresh, 'video-poker': { phase: 'done', paid: true, coin: 1, coins: 5, hand: [C(10, 's'), C(11, 's'), C(12, 's'), C(13, 's'), C(1, 's')], held: [true, true, true, true, true], deck: [], result: { id: 'royal', name: 'Royal Flush', pay: 4000 }, felt: 0 } },
      async p => assert.equal(await p.locator('.paytable tr.hit').count(), 1, 'Video Poker: the royal flush row is not lit')],
    ['motherlode', fresh, async p => p.evaluate(() => { document.getElementById('bigwin').hidden = false; })],
    ['baccarat', fresh, async p => p.evaluate(() => { const c = document.querySelector('.cards') || document.body; c.insertAdjacentHTML('beforeend', '<div class="card down live"></div>'); })],
  ]) {
    if (!cageWants(id)) continue;
    const { p, ctx } = await sit(`${id}/?seen`, saved, { size: rm });
    await p.waitForTimeout(300);
    await during(p);
    await p.waitForTimeout(100);
    assert.deepEqual(await endless(p), [], `${id}: endless animations with reduced motion`);
    await ctx.close();
  }
}

// Records: each table's rounds in its own word, and the machines' own counters.
if (cageWants('records')) {
  const { p, ctx } = await sit('records/', { records: { since: '2026-11-01', tables: {
    'video-poker': { rounds: 1, wagered: 5, net: 3995, best: 3995, bestOn: '2026-11-02', royal: 1 },
    'cherry-bell': { rounds: 12, wagered: 36, net: 964, best: 997, bestOn: '2026-11-03', jackpots: 1, biggest: 1000 },
    'odds-and-ends': { rounds: 9, wagered: 45, net: -20, best: 5, bestOn: '2026-11-03', jackpots: 2 },
    motherlode: { rounds: 22, wagered: 440, net: 955, best: 1375, bestOn: '2026-11-04', features: 1, feature: 1395 },
  } } });
  const rows = id => p.$$eval(`.rec.t-${id} li`, lis => lis.map(li => [li.querySelector('span').textContent, li.querySelector('b').textContent.trim()]));
  assert.deepEqual((await rows('video-poker'))[0], ['Hands', '1'], 'Records: Video Poker counts hands');
  assert.deepEqual((await rows('cherry-bell')).map(r => r[0]), ['Spins', 'Chips bet', 'Up or down', 'Biggest win', 'Jackpots'], 'Records: Cherry Bell');
  assert.deepEqual((await rows('odds-and-ends')).at(-1), ['Jackpots', '2'], 'Records: Odds & Ends jackpots');
  assert.deepEqual((await rows('motherlode')).slice(-2), [['Free-spin features', '1'], ['Most won in free spins', '1,395']], 'Records: Motherlode');
  assert.match(await p.textContent('#totals'), /526chips bet over 44 plays/, 'Records: the total line');
  await ctx.close();
}

// Chips left on a table are still yours, and the floor and Records say where: 200 on the pass line and 100 on the field
// at craps, left there. The tiles say what's waiting at each table: the craps layout, a blackjack hand dealt and
// Motherlode's free spins.
if (cageWants('craps', 'floor', 'records')) {
  const { p, ctx } = await sit('craps/?fast&seen', { cage: { chips: 975, wagered: 25, high: 1000, stakes: 1 },
    blackjack: { phase: 'play', bet: 0, last: 25, hands: [{ id: 0, cards: [{ r: 10, s: 'c' }, { r: 6, s: 'd' }], bet: 25 }], dealer: [{ r: 9, s: 'h' }, { r: 7, s: 's' }], hole: true, insurance: 0, active: 0, felt: 25, shoe: [{ r: 2, s: 'c' }] },
    motherlode: { bet: 20, free: { left: 5, total: 8, sticky: [], won: 40, bet: 20 } } },
  // (with reduced motion: headless Chromium reports the page-to-page fade after a tapped link as a page error)
  { size: { ...phone, reducedMotion: 'reduce' } });
  await p.click('#rack .c100');
  await p.click('[data-spot="pass"]'); await p.click('[data-spot="pass"]'); await p.click('[data-spot="field"]');
  await until(async () => (await feltOf(p, 'craps')) === 300, 2000, 'Craps: the 300 did not go down');
  await p.click('.bar .back'); await p.waitForURL(base);
  assert.equal(await p.textContent('#chips'), '675');
  assert.equal((await p.textContent('#outNote')).trim(), '325 still out on Blackjack and Craps.', 'the floor: no word on the chips left on the tables');
  const stat = id => p.textContent(`#at-${id} [data-stat]`);
  assert.equal(await stat('craps'), '300 on the layout', 'the floor: the craps tile');
  assert.equal(await stat('blackjack'), 'A hand in play', 'the floor: the blackjack tile');
  assert.equal(await stat('motherlode'), 'Free spins waiting', 'the floor: the Motherlode tile');
  assert.equal(await stat('roulette'), 'Not played yet');
  await p.click('.hop.alt'); await p.waitForURL(`${base}records/`);
  assert.equal((await p.textContent('#totals div:first-child')).trim(), '675chips nowplus 325 out on Blackjack and Craps', 'Records: no word on the chips left on the tables');
  assert.equal(await p.getAttribute('#totals .away a:last-child', 'href'), '../craps/');
  await ctx.close();
}

// 500 out on the craps layout with 3 in the rack: those chips are still yours, so the cage offers nothing anywhere.
for (const at of ['blackjack', 'roulette', 'cherry-bell', 'motherlode', '']) {
  if (!cageWants('craps', at || 'floor')) continue;
  const { p, ctx } = await sit(`${at ? `${at}/` : ''}?fast&seen`, {
    cage: { chips: 3, wagered: 2000, high: 1000, stakes: 1 },
    craps: { bets: { pass: 300, place6: 200 }, point: 6, history: [], felt: 500 },
  });
  const where = at || 'the floor';
  assert.equal(await p.isVisible(at ? '.stake-offer' : '#stake'), false, `${where}: the cage offered a stake with 500 on the craps layout`);
  // and it says where the chips are
  assert.match(await p.textContent(at ? '.cage-note' : '#outNote'), /(^|\. )500 still out on Craps\. The cage stakes you when nothing’s left out\.$/, `${where}: doesn't say the chips are on the craps layout`);
  assert.equal(await p.getAttribute(`${at ? '.cage-note' : '#outNote'} a`, 'href'), at ? '../craps/' : 'craps/');
  await p.evaluate(sel => document.querySelector(sel).click(), at ? '.stake-offer button' : '#stake');
  assert.deepEqual([(await cageOf(p)).chips, (await cageOf(p)).stakes], [3, 1], `${where}: the cage staked you with 500 on the craps layout`);
  await ctx.close();
}

// Works offline once it has been opened. The server goes down as well as the browser: in some Chromium builds the
// browser's offline switch alone doesn't stop the service worker's own requests, and this passed with no copy at all.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
const title = await page.title();
net = 'down';
await ctx.setOffline(true);
await page.reload();
assert.equal(await page.title(), title, 'the page did not open offline');
// an address that isn't there, at any depth, opens the not-on-the-floor page from the copy, styled, with nothing broken
await page.goto(`${base}nope/deeper/`);
assert.equal((await page.textContent('h1')).trim(), 'No such table', 'offline, an unknown address did not show the 404 page');
assert.equal(await page.evaluate(() => getComputedStyle(document.body).display), 'grid', 'offline, the 404 page came without its styles');
await ctx.setOffline(false);
net = 'up';
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });

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

// (a request to another site failing is left to 'left the site' above: headless Chromium can't reach one anyway)
assert.deepEqual(problems.filter(p => !p.startsWith('failed:') || p.startsWith(`failed: ${base}`)), [], 'problems while using it');
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

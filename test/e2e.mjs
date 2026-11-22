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
assert.equal(await page.textContent('#chips'), '1,003', 'the stake is another 1,000 on top of the 3');
assert.equal(await page.isHidden('#stake'), true);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('house-money.cage')).stakes), 2);

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
  if (own) {
    await p.goto(`${base}records/`);
    await p.evaluate(saved => {
      localStorage.clear();
      for (const [k, v] of Object.entries(saved)) localStorage.setItem(`house-money.${k}`, JSON.stringify(v));
    }, saved);
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
const cageOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.cage')));
const feltOf = (p, id) => p.evaluate(id => JSON.parse(localStorage.getItem(`house-money.${id}`))?.felt, id);

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

// Motherlode takes 20 a spin. With 15 there's no spin and no stake (15 isn't under 10), so it says why, and where to
// play instead; the bet can't go up. In the free spins, which need no chips, it says nothing.
if (cageWants('motherlode')) {
  const { p, ctx } = await sit('motherlode/?fast&seen', { cage: { chips: 15, wagered: 985, high: 1000, stakes: 1 } });
  assert.equal(await offered(p), false, 'Motherlode: a stake offered at 15 chips');
  assert.equal((await p.textContent('.cage-note')).trim(), 'Motherlode takes 20 a spin and you have 15. Cherry Bell and Odds & Ends take a chip at a time.', 'Motherlode: no word on why it won’t spin');
  assert.deepEqual(await p.evaluate(() => ['spin', 'betUp'].map(id => document.getElementById(id).disabled)), [true, true], 'Motherlode: spin or + still lit at 15 chips');
  assert.deepEqual(await covered(p), [], 'Motherlode: the note covers the controls');
  await p.evaluate(() => { localStorage.setItem('house-money.cage', JSON.stringify({ chips: 40, wagered: 985, high: 1000, stakes: 1 })); dispatchEvent(new CustomEvent('house-money:cage')); });
  await until(() => p.isHidden('.cage-note'), 2000, 'Motherlode: the note stayed with 40 chips');
  assert.equal(await p.evaluate(() => document.getElementById('betUp').disabled), false, 'Motherlode: + stayed off with 40 chips');
  await ctx.close();
  const free = await sit('motherlode/?seen', { cage: { chips: 15, wagered: 985, high: 1000, stakes: 1 }, motherlode: { bet: 20, free: { left: 8, total: 8, sticky: [], won: 0, bet: 20 } } });
  assert.equal(await free.p.isVisible('.cage-note'), false, 'Motherlode: the note showed in the free spins');
  await free.ctx.close();
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
if (cageWants('blackjack')) {
  // a natural, A and K against 9 and 7, and the page closed before the payout
  const shoe = Array(150).fill({ r: 2, s: 'c' }).concat([{ r: 7, s: 'c' }, { r: 13, s: 'h' }, { r: 9, s: 'd' }, { r: 1, s: 's' }]);
  const { p, ctx } = await sit('blackjack/?seen', {
    cage: { chips: 100, wagered: 900, high: 1000, stakes: 1 },
    blackjack: { shoe, phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true, insurance: 0, felt: 0 },
  });
  await p.click('#rack .c100'); await p.click('#spot'); await p.click('#deal');
  await p.waitForTimeout(80);
  await p.reload();
  await until(async () => (await cageOf(p)).chips === 250, 4000, 'Blackjack: the natural was not paid after a reload');
  await p.waitForTimeout(300);
  assert.equal((await cageOf(p)).chips, 250, 'Blackjack: paid twice');
  assert.equal(await feltOf(p, 'blackjack'), 0, 'Blackjack: the hand stayed on the felt after a reload');
  await ctx.close();
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
    const [c, felt, net] = await p.evaluate(id => {
      const J = k => JSON.parse(localStorage.getItem(k));
      return [J('house-money.cage'), J(`house-money.${id}`).felt, J('house-money.records').tables[id].net];
    }, id);
    assert.equal(felt, 0, `${id}: chips left on the felt after spin ${i + 1}`);
    assert.equal(c.chips, 1000 + net, `${id}: the stack and Records disagree after spin ${i + 1}`);
  }
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

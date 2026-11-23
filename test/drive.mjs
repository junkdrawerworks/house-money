// Google Drive saving, through the real pages, against a stand-in for Google (test/fake-google.mjs, from the
// junkdrawer kit):  node test/drive.mjs  (needs Playwright)
// Each browser context is a device, and every device given the same fake shares one Drive. sync.js only turns on at
// house-money.junkdrawer.works, so the test adds this server's address to its list as the file is served (except
// in the first check, which makes sure nothing about Drive shows or loads anywhere else). The chips are played the
// way a table plays them (the bet off the stack, what comes back paid, the round in Records), plus real rounds at
// blackjack and craps, and every check looks at what landed in the fake Drive as well as at the page.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fakeGoogle } from './fake-google.mjs';
import * as L from '../shared/ledger.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html', 'cache-control': 'no-cache' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const origin = base.slice(0, -1);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const wants = (...n) => !ONLY || n.some(x => ONLY.includes(x));

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 10000) {
  for (const end = Date.now() + ms; !(await fn());) { assert.ok(Date.now() < end, `timed out waiting for ${what}`); await wait(80); }
}

const browser = await pw.chromium.launch();
const problems = [];
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
const patch = s => s.replace("['https://house-money.junkdrawer.works']", `['https://house-money.junkdrawer.works', '${origin}']`);

// A device: a browser context on the fake Google, with sync.js allowed here (patched), opened on the floor.
async function device(g, { patched = true, path = '?seen' } = {}) {
  const ctx = await browser.newContext(phone);
  if (g) await g.install(ctx, { rewrite: patched ? { '**/shared/sync.js': patch } : {} });
  const requests = [];
  ctx.on('request', r => requests.push(r.url()));
  // a way to cut this device off from Drive (as well as switching it offline)
  const net = { cut: false };
  await ctx.route('https://www.googleapis.com/**', r => (net.cut ? r.abort('internetdisconnected') : r.fallback()));
  const p = await page(ctx, path);
  return { ctx, p, requests, net };
}
async function page(ctx, path) {
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${path}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/status of 401|ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(m.text())) problems.push(`${path}: ${m.text()}`); });
  await p.goto(base + path);
  return p;
}
async function offline(d, off) { d.net.cut = off; await d.ctx.setOffline(off); }

// Rounds played the way a table plays them: [bet, back] each, at a table (Records counts them there).
const play = (p, list, table = 'blackjack') => p.evaluate(async ([list, table]) => {
  const cage = await import('/shared/cage.js'), records = await import('/shared/records.js');
  for (const [bet, back] of list) {
    if (!cage.take(bet)) throw new Error(`not enough chips for ${bet}: ${cage.read().chips}`);
    if (back) cage.pay(back);
    records.note(table, { wagered: bet, back });
  }
}, [list, table]);
const net = list => list.reduce((a, [bet, back]) => a + back - bet, 0);
const bet = list => list.reduce((a, [b]) => a + b, 0);
const totals = p => p.evaluate(() => import('/shared/cage.js').then(m => m.read()));
const recs = p => p.evaluate(() => import('/shared/records.js').then(m => m.read().tables));
const syncState = p => p.evaluate(() => JSON.parse(localStorage.getItem('house-money.sync') || 'null'));
const chipsOnFloor = async p => Number((await p.textContent('#chips')).replace(/,/g, ''));
const devId = p => p.evaluate(() => localStorage.getItem('house-money.device'));

// The fake Drive's file (the one not in the bin), read as the page would.
const syncFiles = g => g.files().filter(f => f.appProperties?.housemoney === 'sync' && !f.trashed);
const body = g => JSON.parse(syncFiles(g)[0].body);
const inDrive = g => L.cageTotals(L.cleanCage(body(g).cage));
const roundsInDrive = (g, tb) => L.recordsTotals(L.cleanRecords(body(g).records)).tables[tb]?.rounds || 0;

// Waits for the next sync to finish on this page after doing what starts it (a tap on the cloud, by default).
async function synced(p, start = () => p.click('#cloud'), status = 'ok') {
  const before = (await syncState(p))?.last || 0;
  await start();
  await until(async () => ((await syncState(p))?.last || 0) > before, 'a sync');
  if (status) await until(async () => (await p.getAttribute('#cloud', 'data-s')) === status, 'the cloud to go green');
}
async function turnOn(p) {
  await p.waitForFunction(() => window.__cfg);   // Google's script loaded, so the tap opens its window
  await p.click('#drive button[data-a="on"]');
  await until(async () => (await p.textContent('#drive h2')) === 'Saved to Google Drive' && ((await syncState(p))?.last || 0) > 0, 'Drive to turn on');
  await until(async () => (await p.getAttribute('#cloud', 'data-s')) === 'ok', 'the cloud to go green');
}
const shows = async (p, n, where) => until(async () => (await chipsOnFloor(p)) === n, `${where} to show ${n} (it shows ${await p.textContent('#chips')})`);

// ================= 1. Hidden away from the address =================
// Unpatched, on localhost: no cloud, no card, no purse button, no Records line, and nothing goes to Google.
if (wants(1)) {
  const g = fakeGoogle();
  const d = await device(g, { patched: false });
  assert.equal(await d.p.isVisible('#cloud'), false, '1: the cloud shows on localhost');
  assert.equal(await d.p.isVisible('#drive'), false, '1: the Drive card shows on localhost');
  await play(d.p, [[100, 0]]);
  const t = await page(d.ctx, 'blackjack/?fast&seen');
  assert.equal(await t.evaluate(() => document.querySelector('.bar .purse').tagName), 'SPAN', '1: the purse is a button on localhost');
  assert.equal(await t.isVisible('[data-act="sync"]'), false);
  const r = await page(d.ctx, 'records/');
  assert.equal(await r.isVisible('#every'), false);
  assert.equal(await r.isVisible('#toDrive'), false, '1: Records points to Drive on localhost');
  assert.equal(await r.textContent('#kept'), 'Everything here stays in this browser. Nothing is sent anywhere.');
  await wait(3500);
  assert.deepEqual(d.requests.filter(u => /accounts\.google\.com|googleapis\.com/.test(u)), [], '1: a request went to Google');
  assert.equal(g.calls.length, 0);
  await d.ctx.close();
}

// ================= 2–5, 9 and 16: a phone and a laptop on one Drive =================
const g1 = fakeGoogle();
let A, B, aPlays = [], bPlays = [], expect = 1000;
if (wants(2, 3, 4, 5, 9, 16)) {
  // ---------- 2. Turning it on ----------
  A = await device(g1);
  aPlays = [[100, 0], [100, 0], [100, 200], [50, 0]];
  await play(A.p, aPlays);
  expect += net(aPlays);
  await shows(A.p, expect, '2: the phone');
  assert.equal(await A.p.textContent('#drive h2'), 'Your chips on every device');
  assert.match(await A.p.textContent('#drive p'), /^Keep your chips, your player’s card and your records in your own Google Drive, and they’ll be the same on every phone and computer where you turn this on\. They go in a “House Money” folder, and the junkdrawer\.works projects can’t see anything else in your Drive\. Privacy$/);
  await turnOn(A.p);
  assert.equal(await A.p.evaluate(() => window.__cfg.scope), SCOPE, '2: the scope isn’t drive.file alone');
  assert.deepEqual(await A.p.evaluate(() => window.__prompts), [{ prompt: 'select_account' }]);
  const folders = g1.files().filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  assert.deepEqual(folders.map(f => [f.name, f.appProperties]), [['House Money', { housemoney: 'folder' }]], '2: one folder');
  assert.equal(syncFiles(g1).length, 1, '2: one file');
  const f = syncFiles(g1)[0];
  assert.deepEqual([f.name, f.appProperties, f.parents], ['House Money.json', { housemoney: 'sync' }, [folders[0].id]]);
  assert.equal(body(g1).app, 'house-money');
  assert.deepEqual(Object.keys(body(g1).cage.dev), [await devId(A.p)], '2: the file holds this device’s section');
  assert.equal(inDrive(g1).chips, expect);
  assert.equal(await chipsOnFloor(A.p), expect, '2: the chips on screen moved');
  assert.match(await A.p.textContent('#drive p'), /^Your chips, card and records are saved to mark@gmail\.com, in a folder called “House Money”\. A hand in play stays on the device it was dealt on\. Last synced just now\.$/);
  assert.equal(await A.p.isVisible('#cloud'), true);

  // ---------- 3. A second device's first sync, after playing on its own ----------
  // The phone has a table and Records open too: everything there catches up without a reload.
  // the phone has seen roulette's how-to-play sheet (it opens by itself on a first visit)
  const first = await page(A.ctx, 'roulette/?fast');
  await first.waitForSelector('dialog.sheet[open]');
  await first.close();
  const aTable = await page(A.ctx, 'blackjack/?fast&seen');
  const aRec = await page(A.ctx, 'records/');
  B = await device(g1);
  bPlays = [[100, 200], [100, 250], [50, 0]];
  await play(B.p, bPlays);
  await shows(B.p, 1000 + net(bPlays), '3: the laptop on its own');
  await turnOn(B.p);
  expect += net(bPlays);
  await shows(B.p, expect, '3: the laptop after its first sync');
  await synced(A.p);
  await shows(A.p, expect, '3: the phone’s floor');
  await until(async () => (await aTable.textContent('#purse')) === expect.toLocaleString('en-US'), '3: the purse at the phone’s open table');
  assert.equal(await aTable.evaluate(() => document.querySelector('.bar .purse').tagName), 'BUTTON');
  const bjRounds = p => p.$$eval('.rec.t-blackjack li', lis => lis.map(li => li.querySelector('b').textContent.trim())[0]);
  await until(async () => (await bjRounds(aRec)) === '7', '3: Records on the phone to count both devices’ rounds');
  assert.equal(await aRec.isVisible('#every'), true);
  assert.equal(await aRec.textContent('#every'), 'Counting every device that saves to Google Drive.');
  assert.equal(await aRec.textContent('#kept'), 'Kept in this browser and in a House Money folder in your Google Drive.');
  assert.equal(await aRec.isVisible('#toDrive'), false);
  assert.match((await aRec.textContent('#totals')).trim(), new RegExp(`^${expect.toLocaleString('en-US')}chips now`));
  assert.equal(Object.keys(body(g1).cage.dev).length, 2, '3: the file holds both sections');
  assert.equal(inDrive(g1).chips, expect);
  assert.equal(roundsInDrive(g1, 'blackjack'), 7);
  assert.equal((await totals(A.p)).wagered, bet(aPlays) + bet(bPlays), '3: the card counts both');
  await aTable.close(); await aRec.close();
  // and the laptop knows: roulette's sheet doesn't open by itself there
  await synced(B.p);
  assert.equal(await B.p.evaluate(() => JSON.parse(localStorage.getItem('house-money.seen'))?.roulette), 1, '3: the sheets seen didn’t sync');
  const bRoulette = await page(B.ctx, 'roulette/?fast');
  await wait(600);
  assert.equal(await bRoulette.isVisible('dialog.sheet[open]'), false, '3: roulette’s sheet opened again on the laptop');
  await bRoulette.close();

  // ---------- 4. Both at once ----------
  // Rounds in turn on each, both syncing at the same moment; then one device's write held back so the other's lands
  // first. After everything settles, both are exact and Records count every round once.
  let rounds = 7;
  const more = [[[25, 50], 'A'], [[25, 0], 'B'], [[10, 0], 'A'], [[50, 100], 'B'], [[25, 0], 'A']];
  for (const [r, who] of more) { await play((who === 'A' ? A : B).p, [r]); expect += net([r]); rounds++; }
  await Promise.all([synced(A.p), synced(B.p)]);
  let release, hit = false, holding = true;
  const held = new Promise(r => { release = r; });
  const hold = async route => { if (holding && route.request().method() === 'PATCH') { hit = true; await held; } return route.fallback(); };
  await A.ctx.route('https://www.googleapis.com/upload/drive/v3/files/**', hold);
  await play(A.p, [[30, 0]]); await play(B.p, [[40, 80]]);
  expect += net([[30, 0], [40, 80]]); rounds += 2;
  const aSync = synced(A.p);
  await until(() => hit, '4: the phone’s write to be held');
  await synced(B.p);   // the laptop's write lands first
  holding = false; release();
  await aSync;
  // Drive can't refuse a write made from an older copy, so the phone's write landed on top of the laptop's (as in the
  // design's third example): Drive lost the laptop's last round for now. The laptop's next sync puts it back.
  assert.equal(inDrive(g1).chips, expect - 40, '4: the held write didn’t land on top of the laptop’s');
  await A.ctx.unroute('https://www.googleapis.com/upload/drive/v3/files/**', hold);
  await synced(B.p); await synced(A.p);
  // And the check that catches it when it can: the phone's look at the file's version before writing waits until the
  // laptop has written, so the phone sees the file moved, reads it again and writes both.
  let go, looked = false;
  const later = new Promise(r => { go = r; });
  const versionLook = url => url.pathname.startsWith('/drive/v3/files/') && url.search.includes('fields=version');
  await A.ctx.route(versionLook, async route => { looked = true; await later; return route.fallback(); }, { times: 1 });
  await play(A.p, [[20, 0]]); await play(B.p, [[20, 60]]);
  expect += 20; rounds += 2;
  const aLate = synced(A.p);
  await until(() => looked, '4: the phone’s look at the version');
  await synced(B.p);
  go();
  await aLate;
  assert.equal(inDrive(g1).chips, expect, '4: the phone wrote over the laptop’s round though it saw the file move');
  await synced(B.p); await synced(A.p);
  await shows(A.p, expect, '4: the phone'); await shows(B.p, expect, '4: the laptop');
  assert.equal(inDrive(g1).chips, expect, '4: Drive');
  assert.equal(roundsInDrive(g1, 'blackjack'), rounds, '4: Records rounds');
  assert.equal((await recs(A.p)).blackjack.rounds, rounds);
  assert.equal((await recs(B.p)).blackjack.rounds, rounds);

  // ---------- 5. Offline for a week ----------
  // The phone plays 200 rounds with no connection while the laptop plays on; back online, both are exact, and the
  // card moves up to Silver on both (neither got there alone).
  const w0 = inDrive(g1).wagered;
  assert.ok(w0 < 3000, `5: ${w0} bet already`);
  const each = Math.ceil((10000 - w0) / 2) + 200;
  const week = Array.from({ length: 200 }, (_, i) => [Math.round(each / 200), i % 2 ? 0 : 2 * Math.round(each / 200)]);
  const home = Array.from({ length: 25 }, (_, i) => [Math.round(each / 25), i % 2 ? 0 : 2 * Math.round(each / 25)]);
  await offline(A, true);
  await play(A.p, week, 'roulette');
  await synced(A.p, () => A.p.click('#cloud'), null).catch(() => {});
  await until(async () => (await A.p.getAttribute('#cloud', 'data-s')) === 'error', '5: the cloud to go red offline');
  assert.match(await A.p.textContent('#stale'), /^Last synced (just now|\d+ min ago)\. Tap the cloud to bring in your other devices’ chips before you play\.$/, '5: no line under the chips offline');
  await play(B.p, home, 'baccarat');
  await synced(B.p);
  expect += net(week) + net(home);
  assert.equal(await A.p.textContent('#tierName'), 'Red'); assert.equal(await B.p.textContent('#tierName'), 'Red');
  await offline(A, false);
  await synced(A.p); await synced(B.p);
  await shows(A.p, expect, '5: the phone back online'); await shows(B.p, expect, '5: the laptop');
  assert.equal(await A.p.isVisible('#stale'), false, '5: the line under the chips stayed');
  assert.equal(await A.p.textContent('#tierName'), 'Silver'); assert.equal(await B.p.textContent('#tierName'), 'Silver');
  assert.equal(inDrive(g1).chips, expect);
  assert.equal(roundsInDrive(g1, 'roulette'), 200);
  assert.equal(roundsInDrive(g1, 'baccarat'), 25);

  // ---------- 16. A table open with a bet on the felt while a sync comes in ----------
  // 10 and 9 against the dealer's 7 and 10: bet 100 at the phone's blackjack table, stand, win 100.
  const C = (r, s) => ({ r, s });
  const t = await page(A.ctx, 'blackjack/?fast&seen');
  await t.evaluate(([cards]) => {
    const s = { phase: 'bet', bet: 0, last: 0, hands: [], dealer: [], hole: true, insurance: 0, active: 0, felt: 0,
      shoe: Array(250).fill({ r: 2, s: 'c' }).concat(cards.reverse()) };
    localStorage.setItem('house-money.blackjack', JSON.stringify(s));
  }, [[C(10, 's'), C(7, 'h'), C(9, 'd'), C(10, 'c')]]);
  await t.reload();
  await t.click('#rack .c100');
  await t.click('#spot');
  expect -= 100;
  await until(async () => (await t.textContent('#purse')) === expect.toLocaleString('en-US'), '16: the bet to come off');
  await play(B.p, [[100, 600]]);
  await synced(B.p);
  expect += 500;
  const before = (await syncState(t)).last;
  await t.click('.bar .purse');
  await until(async () => (await syncState(t)).last > before, '16: the purse’s sync');
  await until(async () => (await t.textContent('#purse')) === expect.toLocaleString('en-US'), '16: the purse to take in the laptop’s win');
  assert.equal(await t.evaluate(() => JSON.parse(localStorage.getItem('house-money.blackjack')).felt), 100, '16: the bet moved');
  await t.click('#deal');
  await t.waitForSelector('#playActions:not([hidden])');
  await t.click('#stand');
  await t.waitForSelector('#doneActions:not([hidden])');
  expect += 200;
  await until(async () => (await t.textContent('#purse')) === expect.toLocaleString('en-US'), '16: the win paid exactly');
  await t.close();
  await synced(A.p); await synced(B.p);
  await shows(B.p, expect, '16: the laptop');
  assert.equal(inDrive(g1).chips, expect);

  // ---------- 9. A phone that was wiped ----------
  // Its browser data cleared: a fresh start with Drive off, 1,000 and empty Records. Once it's turned on again, the
  // old phone's section is still in the file, its rounds stay in Records, and the fresh 1,000 isn't added.
  const oldId = await devId(A.p), oldRounds = roundsInDrive(g1, 'roulette');
  await A.ctx.close();
  const A2 = await device(g1);
  assert.equal(await chipsOnFloor(A2.p), 1000);
  assert.equal(await A2.p.textContent('#drive h2'), 'Your chips on every device', '9: Drive on after a wipe');
  assert.equal(await A2.p.isVisible('#cloud'), false);
  await play(A2.p, [[150, 0]], 'roulette');
  expect -= 150;
  await turnOn(A2.p);
  await shows(A2.p, expect, '9: the wiped phone');
  assert.ok(body(g1).cage.dev[oldId], '9: the old phone’s section went');
  assert.equal(roundsInDrive(g1, 'roulette'), oldRounds + 1);
  assert.equal((await recs(A2.p)).roulette.rounds, oldRounds + 1);
  await synced(B.p);
  await shows(B.p, expect, '9: the laptop');
  await A2.ctx.close(); await B.ctx.close();
}

// ================= 6 and 7: spent twice while apart, and a stake on both =================
if (wants(6, 7)) {
  const g = fakeGoogle();
  const P = await device(g), Q = await device(g);
  await turnOn(P.p); await turnOn(Q.p);
  // ---------- 6. Both bet the same chips while apart ----------
  await offline(P, true);
  await play(P.p, Array(19).fill([50, 0]), 'roulette');   // 50 left
  await play(Q.p, Array(7).fill([100, 0]));               // 300 left
  await synced(Q.p);
  await offline(P, false);
  await synced(P.p);
  await shows(P.p, 0, '6: the phone');
  assert.equal(body(g).cage.forgiven, 650, '6: the cage’s cover isn’t in Drive');
  assert.equal(await P.p.isVisible('#stake'), true, '6: no stake offered at 0');
  assert.equal(await P.p.textContent('#coverNote'), 'Your devices bet the same chips while apart. The cage covered the 650.');
  await synced(Q.p);
  await shows(Q.p, 0, '6: the laptop');
  assert.equal(await Q.p.isVisible('#stake'), true);
  const r = L.recordsTotals(L.cleanRecords(body(g).records)).tables;
  assert.equal(r.roulette.net + r.blackjack.net, -1650, '6: Records lost a loss');
  await P.p.click('#stake');
  await shows(P.p, 1000, '6: the stake');
  await synced(P.p); await synced(Q.p);
  await shows(Q.p, 1000, '6: the laptop after the stake');
  assert.match(await Q.p.textContent('#stakes'), /the cage has staked you once since/);
  assert.equal(await Q.p.isVisible('#stake'), false);

  // ---------- 7. Both stake in the same dry spell ----------
  await play(P.p, [[995, 0]]);
  await synced(P.p); await synced(Q.p);
  await shows(Q.p, 5, '7: the laptop at 5');
  await offline(P, true); await offline(Q, true);
  await P.p.click('#stake'); await Q.p.click('#stake');
  await shows(P.p, 1005, '7: the phone’s stake'); await shows(Q.p, 1005, '7: the laptop’s stake');
  await play(P.p, [[200, 0]]); await play(Q.p, [[300, 600]]);
  await offline(P, false); await offline(Q, false);
  await synced(P.p); await synced(Q.p); await synced(P.p);
  await shows(P.p, 1105, '7: the phone'); await shows(Q.p, 1105, '7: the laptop');
  assert.deepEqual(Object.keys(body(g).cage.stakes).sort(), ['2', '3'], '7: the stake in the same dry spell counted twice');
  assert.match(await P.p.textContent('#stakes'), /the cage has staked you 2 times since/);
  await P.ctx.close(); await Q.ctx.close();
}

// ================= 8. Chips out on another device =================
// 200 on the phone's craps layout: the laptop, down to 5, gets no stake while they're out, and says where they are.
if (wants(8)) {
  const g = fakeGoogle();
  const P = await device(g), Q = await device(g);
  await turnOn(P.p); await turnOn(Q.p);
  const craps = await page(P.ctx, 'craps/?fast&seen');
  await craps.click('#rack .c100');
  await craps.click('[data-spot="pass"]'); await craps.click('[data-spot="pass"]');
  await until(() => craps.evaluate(() => JSON.parse(localStorage.getItem('house-money.craps'))?.felt === 200), '8: the 200 on the pass line');
  let before = (await syncState(craps)).last;
  await craps.click('.bar .purse');
  await until(async () => (await syncState(craps)).last > before, '8: the craps table’s sync');
  assert.deepEqual(body(g).cage.dev[await devId(craps)].felt.tables, { craps: 200 }, '8: the phone didn’t say what it has out');
  await synced(Q.p);
  await play(Q.p, [[795, 0]]);
  await shows(Q.p, 5, '8: the laptop');
  assert.equal(await Q.p.isVisible('#stake'), false, '8: a stake offered with 200 out on the phone');
  assert.equal(await Q.p.textContent('#outNote'), 'Plus 200 on the craps layout on another device. The cage stakes you when nothing’s left out.');
  const qt = await page(Q.ctx, 'roulette/?fast&seen');
  assert.equal(await qt.isVisible('.stake-offer'), false, '8: a stake offered at the laptop’s roulette table');
  assert.equal((await qt.textContent('.cage-note')).trim(), '200 on the craps layout on another device. The cage stakes you when nothing’s left out.');
  await qt.close();
  // the phone takes the bet down: the 200 is back in the one stack, on the laptop too, and the line goes
  await craps.click('#clear');
  await until(() => craps.evaluate(() => JSON.parse(localStorage.getItem('house-money.craps'))?.felt === 0), '8: the bet to come down');
  before = (await syncState(craps)).last;
  await craps.click('.bar .purse');
  await until(async () => (await syncState(craps)).last > before, '8: the craps table’s sync');
  await synced(Q.p);
  await shows(Q.p, 205, '8: the laptop once the phone’s 200 came in');
  assert.equal(await Q.p.isVisible('#outNote'), false, '8: the line stayed');
  assert.deepEqual(body(g).cage.dev[await devId(craps)].felt.tables, {}, '8: the phone still says it has chips out');
  await P.ctx.close(); await Q.ctx.close();
}

// ================= 10–14: signing in, stopping, and a broken file =================
if (wants(10, 12, 13)) {
  const g = fakeGoogle();
  const D = await device(g);
  await turnOn(D.p);
  // ---------- 10. An expired sign-in ----------
  // Red, play goes on, nothing reaches Drive; one tap on the purse at a table signs back in (no account chooser) and
  // syncs.
  await D.p.evaluate(s => localStorage.setItem('junkdrawer.google', JSON.stringify({ token: 'tok-expired', exp: Date.now() + 3e6, scope: s, email: 'mark@gmail.com' })), SCOPE);
  await D.p.reload();
  await until(async () => (await D.p.getAttribute('#cloud', 'data-s')) === 'tap', '10: the cloud to go red');
  assert.equal(await D.p.isVisible('#stale'), true);
  const calls = g.calls.length;
  await play(D.p, [[100, 0]]);
  await wait(4000);
  assert.equal(g.calls.length, calls, '10: something reached Drive without a sign-in');
  assert.equal(inDrive(g).chips, 1000);
  const t = await page(D.ctx, 'blackjack/?fast&seen');
  assert.equal(await t.getAttribute('.bar .purse', 'data-s'), 'tap');
  assert.equal(await t.getAttribute('.bar .purse', 'aria-label'), '900 chips. Tap to sign in to Google again and sync.');
  await t.waitForFunction(() => window.__cfg);
  await t.click('.bar .purse');
  await until(() => inDrive(g).chips === 900, '10: the sync after the tap');
  assert.deepEqual((await t.evaluate(() => window.__prompts)).at(-1), { prompt: '', login_hint: 'mark@gmail.com' });
  await until(async () => (await t.getAttribute('.bar .purse', 'data-s')) === 'ok', '10: the purse’s dot to go green');
  assert.equal(await t.getAttribute('.bar .purse', 'aria-label'), '900 chips. Synced with Google Drive just now. Tap to sync now.');
  // the menu says so too, with Sync now beside Sound
  await t.click('.menu-btn');
  assert.equal(await t.textContent('.sheet .drive-line'), 'Saved to Google Drive · synced just now');
  assert.equal(await t.isVisible('[data-act="sync"]'), true);
  await t.close();

  // ---------- 12. Another account's sign-in ----------
  await D.p.evaluate(() => { localStorage.setItem('__who', 'ana'); localStorage.removeItem('junkdrawer.google'); });
  await D.p.reload();
  await D.p.waitForFunction(() => window.__cfg);
  await D.p.click('#drive button[data-a="now"]');
  await until(async () => (await D.p.locator('#drive .err').count()) > 0, '12: the message');
  assert.equal(await D.p.textContent('#drive .err'), 'You signed in as ana@gmail.com, but this device saves to mark@gmail.com, so nothing went to that Drive. Sign in as mark@gmail.com, or stop saving on this device to change accounts.');
  assert.equal(await D.p.evaluate(() => localStorage.getItem('junkdrawer.google')), null, '12: ana’s sign-in was kept for this device');
  assert.equal(g.files().filter(f => f.owner === 'ana').length, 0, '12: something went to ana’s Drive');

  // ---------- 13. Stop ----------
  await D.p.evaluate(() => localStorage.setItem('__who', 'mark'));
  await synced(D.p, () => D.p.click('#drive button[data-a="now"]'));
  const kept = await D.p.evaluate(() => localStorage.getItem('junkdrawer.google'));
  await D.p.click('#drive button[data-a="off"]');
  assert.equal(await D.p.textContent('#drive button[data-a="off"]'), 'Tap again to stop');
  await D.p.click('#drive button[data-a="off"]');
  assert.equal(await D.p.textContent('#drive h2'), 'Your chips on every device');
  assert.equal(await D.p.isVisible('#cloud'), false);
  const chips = await chipsOnFloor(D.p), n = g.calls.length;
  await play(D.p, [[50, 100]]);
  await wait(4000);
  assert.equal(g.calls.length, n, '13: Drive calls after stopping');
  assert.equal(await chipsOnFloor(D.p), chips + 50, '13: the chips changed when it stopped');
  assert.equal(await D.p.evaluate(() => localStorage.getItem('junkdrawer.google')), kept, '13: the shared sign-in went');
  assert.equal(await D.p.evaluate(() => window.__revoked), undefined, '13: it revoked');
  const r = await page(D.ctx, 'records/');
  assert.equal(await r.textContent('#kept'), 'Everything here stays in this browser. Nothing is sent anywhere.');
  assert.equal(await r.isVisible('#toDrive'), true, '13: Records doesn’t point to the floor’s Drive card');
  assert.equal(await r.getAttribute('#toDrive a', 'href'), '../#drive');
  await D.ctx.close();
}
if (wants(11)) {
  // ---------- 11. A sign-in from another junkdrawer.works project ----------
  const g = fakeGoogle();
  const D = await device(g);
  await D.p.evaluate(s => localStorage.setItem('junkdrawer.google', JSON.stringify({ token: 'tok-mark', exp: Date.now() + 3e6, scope: s, email: 'mark@gmail.com' })), SCOPE);
  await D.p.reload();
  await turnOn(D.p);
  assert.equal(await D.p.evaluate(() => window.__prompts), undefined, '11: Google’s window opened');
  assert.equal(g.calls.filter(c => c.includes('/drive/v3/about')).length, 0, '11: it asked whose the sign-in is');
  assert.equal(syncFiles(g).length, 1);
  await D.ctx.close();
}
if (wants(14)) {
  // ---------- 14. A broken file ----------
  const g = fakeGoogle();
  const D = await device(g);
  await turnOn(D.p);
  const f = syncFiles(g)[0];
  g.drive.files[f.id].body = '{"not":"house money"}';
  const v = g.drive.files[f.id].version;
  await D.p.click('#drive button[data-a="now"]');
  await until(async () => (await D.p.getAttribute('#cloud', 'data-s')) === 'error', '14: the cloud to go red');
  assert.match(await D.p.textContent('#drive .err'), /^The file in your Drive isn’t readable, so it was left alone\./);
  assert.deepEqual([g.drive.files[f.id].body, g.drive.files[f.id].version], ['{"not":"house money"}', v], '14: the file was touched');
  await D.ctx.close();
}

// ================= 15. Two devices made the file at once =================
if (wants(15)) {
  const g = fakeGoogle();
  const P = await device(g), Q = await device(g);
  const pp = [[100, 300]], qq = [[200, 0]];
  await play(P.p, pp); await play(Q.p, qq);
  // each looks for the file before either has made one
  let waiting = 0, open;
  const both = new Promise(r => { open = r; });
  const barrier = async route => { if (++waiting === 2) open(); await Promise.race([both, wait(5000)]); return route.fallback(); };
  const firstLook = url => url.pathname === '/drive/v3/files' && url.search.includes('housemoney') && url.search.includes('sync');
  await P.ctx.route(firstLook, barrier, { times: 1 }); await Q.ctx.route(firstLook, barrier, { times: 1 });
  await Promise.all([P.p.waitForFunction(() => window.__cfg), Q.p.waitForFunction(() => window.__cfg)]);
  await Promise.all([P.p.click('#drive button[data-a="on"]'), Q.p.click('#drive button[data-a="on"]')]);
  await until(() => syncFiles(g).length === 2 && syncFiles(g).every(f => f.body), '15: two files');
  const first = syncFiles(g).sort((a, b) => a.modified - b.modified)[0].id;
  await until(async () => (await syncState(P.p))?.last > 0 && (await syncState(Q.p))?.last > 0, '15: both on');
  await synced(P.p); await synced(Q.p); await synced(P.p);
  assert.equal(syncFiles(g).length, 1, '15: the second file wasn’t folded in');
  assert.equal(syncFiles(g)[0].id, first, '15: folded the wrong way round');
  assert.equal(g.files().filter(f => f.appProperties?.housemoney === 'sync' && f.trashed).length, 1, '15: the second file isn’t in the bin');
  const n = 1000 + net(pp) + net(qq);
  await shows(P.p, n, '15: the phone'); await shows(Q.p, n, '15: the laptop');
  assert.equal(inDrive(g).chips, n);
  await P.ctx.close(); await Q.ctx.close();
}

// ================= 17. A long session =================
// 500 rounds across two devices, each syncing after every few rounds. After every sync, by what's in the file: the
// stack is 1,000 + every win and loss + the stakes + what the cage covered, Records count every round played, and the
// file stays small.
if (wants(17)) {
  const g = fakeGoogle();
  const P = await device(g), Q = await device(g);
  await turnOn(P.p); await turnOn(Q.p);
  let seed = 17;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let won = 0, played = 0, biggest = 0;
  for (let i = 0; i < 50; i++) {
    const who = i % 2 ? Q : P;
    const list = Array.from({ length: 10 }, () => { const b = [5, 10, 25][rnd(3)]; return [b, rnd(100) < 47 ? 2 * b : 0]; });
    // as a table would: short of chips, take the cage's stake if it offers, or sit the round out
    const done = await who.p.evaluate(async list => {
      const cage = await import('/shared/cage.js'), records = await import('/shared/records.js');
      const out = [];
      for (const [b, back] of list) {
        if (cage.read().chips < b && cage.canStake()) cage.stake();
        if (!cage.take(b)) continue;
        if (back) cage.pay(back);
        records.note('cherry-bell', { wagered: b, back });
        out.push([b, back]);
      }
      return out;
    }, list);
    won += net(done); played += done.length;
    await synced(who.p);
    const b = body(g), t = L.cageTotals(L.cleanCage(b.cage));
    assert.equal(t.chips, 1000 + won + 1000 * (t.stakes - 1) + b.cage.forgiven, `17: after sync ${i + 1}, the stack in Drive is off`);
    assert.equal(roundsInDrive(g, 'cherry-bell'), played, `17: after sync ${i + 1}, Records in Drive are off`);
    assert.equal(await chipsOnFloor(who.p), t.chips, `17: after sync ${i + 1}, the floor and Drive disagree`);
    biggest = Math.max(biggest, syncFiles(g)[0].body.length);
  }
  assert.ok(played >= 450, `17: only ${played} rounds played`);
  assert.ok(biggest < 10240, `17: the file grew to ${biggest} bytes`);
  await synced(P.p);
  assert.equal(await chipsOnFloor(P.p), await chipsOnFloor(Q.p), '17: the two devices disagree at the end');
  console.log(`17: ${played} rounds, the file at most ${biggest} bytes, ${syncFiles(g).length} file`);
  await P.ctx.close(); await Q.ctx.close();
}

// ================= 18. Start over on one device =================
// A phone and a laptop that have both played and synced. The phone starts over on Records; once it has synced, the
// laptop's next sync takes it back to the start too (1,000 chips, nothing in Records, no milestones), rather than
// putting its old totals back, and the file holds the reset marker. Play after it adds up on both as usual.
if (wants(18)) {
  const g = fakeGoogle();
  const P = await device(g), Q = await device(g);
  await turnOn(P.p); await turnOn(Q.p);
  await play(P.p, [[100, 0], [50, 200]]); await synced(P.p);
  await play(Q.p, [[200, 600]]); await synced(Q.p); await synced(P.p);
  await shows(P.p, 1450, '18: the phone before'); await shows(Q.p, 1450, '18: the laptop before');
  const rec = await page(P.ctx, 'records/');
  await rec.click('#startOver');
  assert.match(await rec.textContent('#overWhat'), / On every device that saves to your Google Drive too\./, '18: Start over doesn\'t say it reaches the other devices');
  await rec.click('#overYes');
  await rec.close();
  await shows(P.p, 1000, '18: the phone after Start over');
  await synced(P.p);
  assert.equal(inDrive(g).chips, 1000, '18: the file still holds the old stack');
  assert.equal(body(g).cage.reset?.by, await devId(P.p), '18: the file has no reset marker');
  await synced(Q.p);
  await shows(Q.p, 1000, '18: the laptop after the phone started over');
  assert.deepEqual(await recs(Q.p), {}, '18: the laptop kept its Records');
  assert.equal((await totals(Q.p)).wagered, 0, '18: the laptop kept its player\'s card');
  await play(Q.p, [[25, 75]]); await synced(Q.p); await synced(P.p);
  await shows(P.p, 1050, '18: the phone after the laptop played on'); await shows(Q.p, 1050, '18: the laptop after it played on');
  assert.equal(roundsInDrive(g, 'blackjack'), 1, '18: Records in Drive after Start over');
  await P.ctx.close(); await Q.ctx.close();
}

// ================= 19. Turning Drive on after a Start over elsewhere =================
// The phone started over and has played on since (1,200). A laptop that has never saved to Drive, at 3,000 from its own
// play, turns it on: its play adds in (3,200, both tables' rounds in Records), as any device's joining does, instead of
// giving way to the phone's Start over and dropping to 1,200. So does a laptop that started over on its own before it
// ever saved there. A device that had saved there before, and stopped, still gives way when it turns Drive on again.
if (wants(19)) {
  const g = fakeGoogle();
  const P = await device(g), R = await device(g);
  await turnOn(P.p); await turnOn(R.p);
  await play(R.p, [[100, 400]]); await synced(R.p);
  await R.p.click('#drive button[data-a="off"]'); await R.p.click('#drive button[data-a="off"]');
  await until(async () => (await syncState(R.p))?.on === false, '19: the old laptop to stop saving');
  await play(P.p, [[50, 0]]); await synced(P.p);
  const rec = await page(P.ctx, 'records/');
  await rec.click('#startOver'); await rec.click('#overYes'); await rec.close();
  await play(P.p, [[100, 300]], 'roulette'); await synced(P.p);
  assert.equal(inDrive(g).chips, 1200, '19: the phone after Start over');
  // a laptop that never saved to Drive
  const Q = await device(g);
  await play(Q.p, [[500, 2500]]);
  await shows(Q.p, 3000, '19: the laptop on its own');
  await turnOn(Q.p);
  await shows(Q.p, 3200, '19: the laptop turning Drive on after the phone started over');
  assert.equal(inDrive(g).chips, 3200, '19: the file after the laptop joined');
  assert.deepEqual(Object.fromEntries(Object.entries(await recs(Q.p)).map(([k, t]) => [k, t.rounds])), { blackjack: 1, roulette: 1 }, '19: Records on the laptop after it joined');
  assert.equal(body(g).cage.reset?.by, await devId(P.p), '19: the file lost the phone\'s Start over');
  await synced(P.p);
  await shows(P.p, 3200, '19: the phone after the laptop joined');
  // a laptop that started over on its own before it ever saved there: 1,000 again, then up 100
  const S = await device(g);
  await play(S.p, [[100, 900]]);
  const rs = await page(S.ctx, 'records/');
  await rs.click('#startOver'); await rs.click('#overYes'); await rs.close();
  await play(S.p, [[100, 200]]);
  await shows(S.p, 1100, '19: the second laptop after its own Start over');
  await turnOn(S.p);
  await shows(S.p, 3300, '19: the second laptop turning Drive on');
  assert.equal(body(g).cage.reset?.by, await devId(P.p), '19: the second laptop\'s own Start over reached Drive');
  // the device that had saved there before: its 1,300 from before the Start over doesn't come back
  await play(R.p, [[100, 0]]);
  await R.p.click('#drive button[data-a="on"]');
  await until(async () => ((await syncState(R.p))?.last || 0) > 0, '19: the old laptop to sync again');
  await shows(R.p, 3300, '19: the old laptop turning Drive on again after the Start over');
  assert.equal(inDrive(g).chips, 3300, '19: the file after the old laptop came back');
  await P.ctx.close(); await Q.ctx.close(); await R.ctx.close(); await S.ctx.close();
}

assert.deepEqual(problems, [], 'problems while using it');
await browser.close();
server.close();
console.log('Drive: all good');

// Cherry Bell on screen: the coin size and coins, the handle, the reels spinning and stopping left to right, the pay
// table lighting up, and the payout. The arithmetic is in machine.js; the reels and saving in shared/reels.js.

import * as M from './machine.js';
import { ART, icon } from './art.js';
import * as cage from '../../shared/cage.js';
import * as sound from '../../shared/sound.js';
import { chipEl } from '../../shared/chips.js';
import { mountTable, float, wait, hotkey, shortcut, overLine } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import { ReelSet, loadArt, pickStops, window as view, keeper } from '../../shared/reels.js';
import { guardEdges } from '../../shared/edge-guard.js';
import { bigWin, shown as bigShown, dismiss } from '../../shared/bigwin.js';

const T = byId(M.ID);
const $ = id => document.getElementById(id);
const pct = n => `${n.toFixed(1)}%`;
const COIN_SIZES = T.coins;

const keep = keeper(M.ID, { coins: 3, coin: 1 });
const s = keep.state;

const NAME = { cherry: 'cherries', bell: 'bells', plum: 'plums', orange: 'oranges', bar: 'bars', seven: 'sevens' };
const rowsHtml = M.TABLE.map((t, i) => {
  const parts = t.show.map(x => (x === 'any' ? '<span class="anyx">any</span>' : icon(x, 18)));
  // on the glass the symbols sit in a row of their own; in the help sheet, words between them: "any any"
  const shown = parts.join(''), help = parts.join(' ');
  const pays = [1, 2, 3].map(c => (i === 0 && c === 3 ? M.JACKPOT : t.pay * c));
  return { shown, help, pays, alt: !!t.alt, name: t.name };
});

const table = mountTable({
  id: M.ID, name: T.name, min: T.min, max: T.max, felt: keep.felt, offerIn: document.querySelector('.glass'),
  onCage: () => { if (!spinning) paint(); },
  help: `
    <p>An old three-reel fruit machine with one pay line, across the middle. Pick a coin size, put in one to three
    coins, and pull the handle (or press Spin). The reels stop left to right.</p>
    <h3>What pays</h3>
    <p>Coins paid for each coin bet, on the pay line, reading from the left:</p>
    <table>
      <tr><th>Line</th><th>Per coin</th></tr>
      ${rowsHtml.map((r, i) => `<tr><td>${r.help}${r.alt ? ' <small>or two and a BAR</small>' : ''}</td><td>${i === 0 ? `200 (${cage.fmt(M.JACKPOT)} on 3 coins)` : M.TABLE[i].pay}</td></tr>`).join('')}
    </table>
    <ul>
      <li><b>A BAR finishes the fruit.</b> Two bells, plums or oranges and a BAR on the third reel pay the same as three.</li>
      <li><b>Cherries count from the left.</b> One on the first reel pays 2, two on the first two pay 5.</li>
      <li><b>Three coins lift the top prize.</b> Three sevens pay 200 a coin on one or two coins, and ${cage.fmt(M.JACKPOT)} on three.</li>
      <li><b>Lemons pay nothing.</b> They never have.</li>
    </ul>
    <h3>The long run</h3>
    <p>Cherry Bell pays back about ${pct(M.RETURN.low)} of what goes in on one or two coins, and ${pct(M.RETURN.max)}
    on three. About one pull in four pays something. Behind each reel is a virtual reel: every symbol gets so many of
    128 chances, and the blanks share the rest, so a seven on all three comes about once in 32,768 pulls.</p>
    <p>The keyboard works too: Space or Enter pulls, and 1 to 3 sets the coins.</p>`,
});

// ---------- the pay table on the glass ----------

$('pays').querySelector('tbody').innerHTML = rowsHtml.map(r => `
  <tr><td>${r.shown}${r.alt ? '<span class="alt">/BAR</span>' : ''}</td>${r.pays.map((p, c) => `<td data-c="${c + 1}">${cage.fmt(p)}</td>`).join('')}</tr>`).join('');

// ---------- coin size ----------

const sizesEl = $('coinSize');
const sizeBtns = COIN_SIZES.map(v => {
  const b = chipEl(v, 'button');
  b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `Coin size ${v}`);
  b.addEventListener('click', () => { if (!spinning) { s.coin = v; keep.save(); sound.chip(); paint(); } });
  sizesEl.appendChild(b);
  return b;
});

// ---------- the reels ----------

let reels, spinning = false, lastWin = 0;
const bet = () => s.coins * s.coin;

function paint() {
  const { max } = table.limits();
  const allowed = COIN_SIZES.filter(v => v * 3 <= max);
  if (!allowed.includes(s.coin)) s.coin = allowed.filter(v => v <= s.coin).pop() || allowed[0];
  sizeBtns.forEach((b, i) => {
    const v = COIN_SIZES[i];
    b.hidden = !allowed.includes(v);
    b.classList.toggle('on', v === s.coin);
    b.setAttribute('aria-checked', v === s.coin);
    b.disabled = spinning;
  });
  $('coinsM').textContent = s.coins;
  $('betM').textContent = cage.fmt(bet());
  $('winM').textContent = cage.fmt(lastWin);
  document.querySelectorAll('.pays [data-c]').forEach(td => td.classList.toggle('on', +td.dataset.c === s.coins));
  document.querySelectorAll('.lamp').forEach((l, i) => l.classList.toggle('on', i < s.coins));
  const chips = cage.read().chips;
  $('spin').disabled = spinning || bet() > chips;
  $('betOne').disabled = spinning;
  $('betMax').disabled = spinning || s.coin * 3 > chips;
  $('handle').setAttribute('aria-disabled', spinning || bet() > chips);
  table.hold(spinning ? '' : overLine(bet(), chips, table.limits().min, 'Try fewer coins or a smaller coin.'));
  table.check();
}

$('betOne').addEventListener('click', () => {
  if (spinning) return;
  s.coins = s.coins >= 3 ? 1 : s.coins + 1; keep.save(); sound.chip(); paint();
});
$('betMax').addEventListener('click', () => {
  if (spinning) return;
  s.coins = 3; keep.save(); sound.chip(); paint(); pull();
});
$('spin').addEventListener('click', () => pull());

async function pull() {
  if (spinning) return;
  const b = bet();
  if (!keep.stake(b)) { table.say(b > cage.read().chips ? 'Not enough chips for that bet. Try fewer coins or a smaller coin.' : ''); return; }
  spinning = true; document.body.classList.add('spinning');
  lastWin = 0;
  document.querySelectorAll('.pays tr.lit').forEach(tr => tr.classList.remove('lit'));
  table.say('');
  $('reels').setAttribute('aria-label', 'The reels, spinning');
  paint();
  // the result is picked now, and kept, before the reels move
  const stops = pickStops(M.REELS);
  const grid = view(M.REELS, stops, M.ROWS, M.ANCHOR);
  const r = M.pay(grid, s.coins);
  const win = r.coins * s.coin;
  keep.begin({ stops, coins: s.coins, coin: s.coin, row: r.row, win, wagered: b,
    extra: r.row === 0 && s.coins === M.COINS ? { jackpots: 1 } : {}, max: { biggest: win }, marks: r.row === 0 ? ['sevens'] : [] });
  swing();
  // two sevens or bars showing: the last reel spins on a moment longer
  const line = grid.map(col => col[1]);
  const tease = (line[0] === line[1] && (line[0] === 'seven' || line[0] === 'bar')) ? [2] : [];
  await reels.spin(stops, { first: .7, stagger: .42, tease, onStop: () => sound.thunk() });
  keep.settle();
  spinning = false; document.body.classList.remove('spinning');
  await finish(r, win);
  paint();
}

// What's on the pay line, in words: "cherry, BAR, blank".
const WORD = { seven: 'seven', cherry: 'cherry', bar: 'BAR', lemon: 'lemon', orange: 'orange', bell: 'bell', plum: 'plum', blank: 'blank' };
const onLine = stops => view(M.REELS, stops, M.ROWS, M.ANCHOR).map(c => WORD[c[1]] || c[1]);
// The reels' picture, for a screen reader: "On the pay line: cherry, BAR, blank."
const describe = stops => $('reels').setAttribute('aria-label', `On the pay line: ${onLine(stops).join(', ')}.`);

async function finish(r, win) {
  lastWin = win;
  describe(s.last.stops);
  if (win > 0) {
    const row = $('pays').querySelectorAll('tbody tr')[r.row];
    row?.classList.add('lit');
    const t = M.TABLE[r.row];
    // two of a fruit finished by a BAR says so: "Two bells and a BAR pay 54."
    const line = view(M.REELS, s.last.stops, M.ROWS, M.ANCHOR).map(c => c[1]);
    const name = t.alt && line[2] === 'bar' && line[0] === t.alt[0] ? `Two ${NAME[t.alt[0]]} and a BAR` : t.name;
    const what = r.row === 0 && s.coins === 3 ? 'Three sevens on three coins: the top prize!' : `${name} ${M.pays(r.row)} ${cage.fmt(win)}.`;
    table.say(what, 'win');
    const big = win >= bet() * 50 ? 3 : win >= bet() * 10 ? 2 : 1;
    // ten times the bet or more, the marquee's bulbs chase for a moment
    if (big >= 2) chase();
    // the top prize: the big card, then the meter
    if (r.row === 0 && s.coins === M.COINS) {
      spinning = true; paint();
      await bigWin({ amount: win, title: 'Jackpot!', x: win / bet(), note: 'Three sevens on three coins', top: true });
      spinning = false;
    } else { sound.win(big); sound.chips(Math.min(12, 3 + big * 3)); }
    float($('reelBox'), `+${cage.fmt(win)}`);
    countUp(win);
  } else {
    // every pull says what it came to, a losing one too: "Bell, BAR, lemon. Nothing this time."
    const line = onLine(s.last.stops), said = line.join(', ');
    table.say(line.every(x => x === 'lemon') ? 'Three lemons. Of course.' : `${said[0].toUpperCase()}${said.slice(1)}. Nothing this time.`);
  }
}

let chaseTimer = 0;
function chase() {
  document.body.classList.add('winning');
  clearTimeout(chaseTimer);
  chaseTimer = setTimeout(() => document.body.classList.remove('winning'), 2400);
}

function countUp(to) {
  const el = $('winM');
  const t0 = performance.now(), dur = Math.min(1500, 300 + to * 4);
  sound.rollup(dur);   // a quiet tick while it climbs
  const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = cage.fmt(Math.round(to * k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- the handle ----------

const handle = $('handle');
// the handle's pivot sits level with the pay line
function placeHandle() {
  const stand = document.querySelector('.stand').getBoundingClientRect();
  const win = document.querySelector('.window').getBoundingClientRect();
  handle.style.top = `${Math.round(win.top + win.height / 2 - stand.top - 126)}px`;
}
addEventListener('resize', placeHandle);
// On a phone, the reels' window gives up height until the coins and the buttons are on the screen, down to the pay line
// and a little of the rows either side. Worked out from where the cabinet ends, so it settles at once and grows back
// when there's room again.
const phone = matchMedia('(max-width: 600px)');
function fitReels() {
  if (!reels) return;
  const box = $('reelBox');
  if (!phone.matches) { box.style.removeProperty('--fit'); return; }
  const cab = document.querySelector('.cab').getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom) || 0;
  const rest = cab.bottom + scrollY + pad - box.getBoundingClientRect().height;
  const room = innerHeight - rest;
  const fit = room >= reels.H ? '' : `${Math.round(Math.max(reels.cellH * 1.25, room))}px`;
  if (box.style.getPropertyValue('--fit') !== fit) { box.style.setProperty('--fit', fit); placeHandle(); }
}
new ResizeObserver(fitReels).observe(document.documentElement);
addEventListener('resize', fitReels);
let drag = null;
function setPull(p) { handle.style.setProperty('--pull', p.toFixed(3)); }
async function swing() {
  // the handle goes down and springs back, whether it was pulled or Spin was pressed
  if (drag) return;
  handle.classList.remove('back');
  setPull(1);
  await wait(130);
  handle.classList.add('back');
  setPull(0);
}
handle.addEventListener('pointerdown', e => {
  if (spinning) return;
  handle.setPointerCapture(e.pointerId);
  handle.classList.remove('back');
  drag = { y: e.clientY, p: 0 };
});
handle.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.p = Math.max(0, Math.min(1, (e.clientY - drag.y) / 120));
  setPull(drag.p);
});
// Let go past halfway and it pulls. A touch the browser takes away (pointercancel: the phone's edge swipe for Back,
// say) only lets the handle spring back: the pull wasn't finished, and the guard below keeps the page.
const release = pulled => {
  if (!drag) return;
  pulled &&= drag.p > .55;
  drag = null;
  handle.classList.add('back');
  setPull(0);
  if (pulled) { sound.tap(); pull(); }
};
handle.addEventListener('pointerup', () => release(true));
handle.addEventListener('pointercancel', () => release(false));
guardEdges({ surfaces: [handle] });
handle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pull(); } });

addEventListener('keydown', e => {
  if (!shortcut(e)) return;
  if (e.key === ' ' || e.key === 'Enter') { if (hotkey(e)) { e.preventDefault(); if (bigShown()) dismiss(); else pull(); } }
  else if (['1', '2', '3'].includes(e.key) && !spinning) { s.coins = +e.key; keep.save(); sound.chip(); paint(); }
});


// ---------- start ----------

(async () => {
  const art = await loadArt(ART);
  reels = new ReelSet($('reels'), {
    reels: M.REELS, rows: M.ROWS, anchor: M.ANCHOR, art, cell: .74, gap: 5, pad: .1, speed: 20,
    look: { face: '#fbf6e8', shade: .6 },
  });
  // a spin that never got paid (the page closed mid-spin) pays now, and the reels stand where it stopped
  const owed = keep.settle();
  if (s.last?.stops) {
    reels.set(s.last.stops);
    describe(s.last.stops);
    if (owed) { lastWin = owed; table.say(`Your last pull paid ${cage.fmt(owed)}.`, 'win'); }
  } else { reels.set([0, 0, 0]); describe([0, 0, 0]); } // three sevens on the line, the way a machine stands on the showroom floor
  // said before the first paint, which says instead why Spin is dimmed when the bet is more than the stack
  if (!owed) table.call('Pick a coin, then pull the handle.');
  paint();
  fitReels();
  placeHandle();
  document.fonts?.ready.then(fitReels);
})();

// Baccarat on screen: the five bets, the deal, the squeeze, the third cards, the payout and the scoreboard.
// The rules are in game.js. The whole coup is decided when it's dealt and saved straight away, so turning the cards
// over is only looking: a reload carries on with the same cards, and a coup is never paid twice.

import * as g from './game.js';
import * as cage from '../../shared/cage.js';
import * as records from '../../shared/records.js';
import * as sound from '../../shared/sound.js';
import { cardEl, turn, dealInto } from '../../shared/cards.js';
import { rack as makeRack, setStack } from '../../shared/chips.js';
import { mountTable, float, wait, netLine, hotkey, keepFocus } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import * as seat from '../../shared/seat.js';
import { guardEdges } from '../../shared/edge-guard.js';

const KEY = 'house-money.baccarat';
const SQUEEZE = 'house-money.baccarat.squeeze';
const T = byId('baccarat');
const $ = id => document.getElementById(id);
const NAME = { P: 'Player', B: 'Banker', T: 'Tie' };
const SPOT_NAMES = [['player', 'Player bet'], ['banker', 'Banker bet'], ['tie', 'Tie'], ['pp', 'Player pair'], ['bp', 'Banker pair']];
let toldCommission = false;   // the commission is explained once a visit, on the first Banker win

let s = load();
// the bets on the layout, until the coup is settled and paid
const onFelt = () => (s.phase === 'done' && s.paid !== false ? 0 : g.staked(s.bets));

const table = mountTable({
  id: 'baccarat', name: T.name, min: T.min, max: T.max, felt: onFelt,
  help: `
    <p>Two hands are dealt, the Player and the Banker, and you bet on which one comes closer to 9. You don’t play
    either hand: the cards and a fixed set of rules decide everything. Your part is the bet, and turning the cards over.</p>
    <h3>Counting</h3>
    <p>Aces count 1, two to nine count their number, and tens and pictures count nothing. A hand is only the last digit
    of its total, so 7 and 8 make 5, and 9 and a king make 9.</p>
    <h3>The bets</h3>
    <table>
      <tr><td>Player</td><td>1 to 1</td></tr>
      <tr><td>Banker</td><td>19 to 20</td></tr>
      <tr><td>Tie</td><td>8 to 1</td></tr>
      <tr><td>Player pair or Banker pair</td><td>11 to 1</td></tr>
    </table>
    <p>A Banker win pays even money less the house’s 5% commission. Fractions of a chip aren’t lost: they’re kept for
    you and added to your next Banker win. On a tie, Player and Banker bets come back. A pair bet wins when that hand’s
    first two cards are the same rank.</p>
    <h3>Third cards</h3>
    <ul>
      <li>An 8 or 9 on either hand’s first two cards is a natural, and nobody draws.</li>
      <li>The Player draws on 0 to 5 and stands on 6 or 7.</li>
      <li>If the Player stood, the Banker draws on 0 to 5. If the Player drew, the Banker draws on 0 to 2; on 3 unless
      the Player’s third card was an 8; on 4 against a 2 to 7; on 5 against a 4 to 7; on 6 against a 6 or 7; and
      stands on 7.</li>
    </ul>
    <h3>The squeeze</h3>
    <p>The cards come face down. Drag one up from an edge or a corner to peel it back a little at a time, the way the
    big players do, or tap it to turn it over. <b>Turn them over</b> does them all. You can switch the squeeze off
    under the buttons.</p>
    <h3>The scoreboard</h3>
    <p>The left side is the bead plate: every coup in order, down the columns. The right is the big road: a new
    column each time the winner changes, so streaks run down the board. Ties are marked across the coup before them.
    It starts again with each new shoe. Eight decks, with the cut card 16 from the end.</p>
    <p>The house keeps about 1.06% on Banker, 1.24% on Player and 14.4% on Tie.</p>`,
  onStake: () => paint(),
  // the stack changed, here or in another tab
  onCage: () => { if (!busy) paint(); },
});

const rack = makeRack($('rack'), { values: [5, 25, 100, 500, 1000], key: 'house-money.baccarat.chip' });
let busy = false;
let squeeze = (() => { try { return localStorage.getItem(SQUEEZE) !== 'off'; } catch { return true; } })();

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x && Array.isArray(x.shoe) && x.shoe.length && x.bets && Array.isArray(x.road)) return x;
  } catch { /* first visit */ }
  return g.fresh();
}
function save() { s.felt = onFelt(); seat.write(KEY, s); }

// ---------- the scoreboard ----------

let roadSeen = s.road.length;
function paintBoard() {
  const bead = $('bead'), road = $('road');
  const cell = parseFloat(getComputedStyle($('bead').parentElement).getPropertyValue('--cell')) || 14;
  const bcols = innerWidth >= 700 ? 10 : 8;
  bead.style.setProperty('--bcols', bcols);
  const n = s.road.length;
  const firstCol = Math.max(0, Math.ceil(n / 6) - bcols);
  bead.innerHTML = '';
  s.road.slice(firstCol * 6).forEach((x, i) => {
    const el = document.createElement('i');
    el.className = `${x.w}${x.pp ? ' pp' : ''}${x.bp ? ' bp' : ''}${firstCol * 6 + i >= roadSeen ? ' new' : ''}`;
    el.textContent = x.w;
    bead.appendChild(el);
  });
  const cells = g.bigRoad(s.road);
  const maxC = cells.reduce((a, c) => Math.max(a, c.c), 0);
  const fit = Math.max(4, Math.floor((road.clientWidth - 2) / cell));
  const from = Math.max(0, maxC - fit + 2);
  road.innerHTML = '';
  road.style.gridTemplateColumns = `repeat(${fit}, ${cell}px)`;
  road.style.gridAutoFlow = 'row';
  const last = cells[cells.length - 1];
  for (const c of cells) {
    if (c.c < from) continue;
    const el = document.createElement('i');
    el.className = `${c.w}${c.ties ? ' tie' : ''}${c === last && n > roadSeen ? ' new' : ''}`;
    el.style.gridColumn = c.c - from + 1;
    el.style.gridRow = c.r + 1;
    if (c.ties > 1) el.innerHTML = `<i class="n">${c.ties}</i>`;
    road.appendChild(el);
  }
  const t = g.tally(s.road);
  $('tally').innerHTML = n ? `<b class="p">P ${t.P}</b> · <b class="b">B ${t.B}</b> · <b class="t">T ${t.T}</b>` : 'A new shoe';
  $('bead').setAttribute('aria-label', n ? `This shoe so far: Player ${t.P}, Banker ${t.B}, Tie ${t.T}. Last: ${NAME[s.road[n - 1].w]}.` : 'A new shoe: no coups yet.');
  $('road').setAttribute('aria-label', 'The big road');
  roadSeen = n;
}

// ---------- the cards ----------

const els = new Map(); // 'p0' → card element

function place(key, { animate = true, down = true } = {}) {
  const card = g.cardOf(s, key);
  const el = cardEl(card, { down });
  if (key[1] === '2') el.classList.add('third');
  el.dataset.key = key;
  els.set(key, el);
  const row = key[0] === 'p' ? $('pCards') : $('bCards');
  peelable(el, key);
  if (!animate) { row.appendChild(el); return Promise.resolve(); }
  sound.card();
  return dealInto(row, el, { from: { left: innerWidth / 2 - 30, top: 60 } });
}

function paintTotals() {
  for (const side of ['p', 'b']) {
    const keys = g.out(s).filter(k => k[0] === side);
    const shown = keys.filter(k => s.turned.includes(k));
    const el = $(side === 'p' ? 'pTot' : 'bTot');
    const on = shown.length > 0;
    el.classList.toggle('on', on);
    el.textContent = on ? g.score(shown.map(k => g.cardOf(s, k))) : '';
  }
  const live = s.phase === 'reveal' && !busy;
  for (const [k, el] of els) el.classList.toggle('live', live && !s.turned.includes(k));
}

function clearCards() {
  $('pCards').innerHTML = ''; $('bCards').innerHTML = ''; els.clear();
  $('pSide').classList.remove('won'); $('bSide').classList.remove('won');
  $('pTot').classList.remove('on'); $('bTot').classList.remove('on');
}

// Turns a card face up and records it. peeled: it was squeezed open, so it doesn't spin over.
function turnUp(key, { peeled = false } = {}) {
  const el = els.get(key);
  if (!el || s.turned.includes(key)) return;
  s.turned.push(key); save();
  resetPeel(el);
  if (peeled) el.classList.add('instant');
  turn(el, g.cardOf(s, key));
  if (peeled) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('instant')));
  sound.flip();
  paintTotals();
  if (g.allTurned(s)) proceed();
}

// ---------- the squeeze ----------

function polygon(points) { return `polygon(${points.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ')})`; }

// The peel, as the part of the back still lying flat and the part folded over, for a peel of L from a corner
// (L 0 to 2) or an edge (0 to 1). Worked with the peeled corner at (1, 1) or the peeled edge at y = 1, then mapped.
function peelShape(zone, L) {
  let back, flap;
  if (zone.corner) {
    const k = 2 - L;
    if (k >= 2) { back = [[0, 0], [1, 0], [1, 1], [0, 1]]; flap = []; }
    else if (k >= 1) { back = [[0, 0], [1, 0], [1, k - 1], [k - 1, 1], [0, 1]]; flap = [[1, k - 1], [k - 1, 1], [k - 1, k - 1]]; }
    else if (k > 0) { back = [[0, 0], [k, 0], [0, k]]; flap = [[k, 0], [k, k - 1], [k - 1, k - 1], [k - 1, k], [0, k]]; }
    else { back = [[0, 0], [0, 0], [0, 0]]; flap = []; }
    const map = ([x, y]) => [zone.cx ? x : 1 - x, zone.cy ? y : 1 - y];
    return { back: back.map(map), flap: flap.map(map) };
  }
  const e = Math.min(1, L);
  back = [[0, 0], [1, 0], [1, 1 - e], [0, 1 - e]];
  flap = e > 0 ? [[0, Math.max(-1, 1 - 2 * e)], [1, Math.max(-1, 1 - 2 * e)], [1, 1 - e], [0, 1 - e]] : [];
  const map = {
    bottom: ([x, y]) => [x, y], top: ([x, y]) => [x, 1 - y],
    right: ([x, y]) => [y, x], left: ([x, y]) => [1 - y, x],
  }[zone.edge];
  return { back: back.map(map), flap: flap.map(map) };
}

function showPeel(el, zone, L) {
  el.classList.add('peeling');
  let w = el.querySelector('.flapw');
  if (!w) { w = document.createElement('span'); w.className = 'flapw'; w.innerHTML = '<span class="flap"></span>'; el.appendChild(w); }
  const { back, flap } = peelShape(zone, L);
  el.querySelector('.back').style.clipPath = polygon(back);
  w.firstChild.style.clipPath = flap.length ? polygon(flap) : 'polygon(0 0, 0 0, 0 0)';
}

function resetPeel(el) {
  el.classList.remove('peeling');
  el.querySelector('.flapw')?.remove();
  const b = el.querySelector('.back');
  if (b) b.style.clipPath = '';
}

function peelable(el, key) {
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (busy || s.phase !== 'reveal' || s.turned.includes(key) || !squeeze) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const third = el.classList.contains('third');
    // where on the card the finger went down, in the card's own frame (the third card lies on its side)
    const sx = (e.clientX - r.left) / r.width, sy = (e.clientY - r.top) / r.height;
    const lx = third ? sy : sx, ly = third ? 1 - sx : sy;
    const w = third ? r.height : r.width, h = third ? r.width : r.height;
    const nearX = lx < .34 || lx > .66, nearY = ly < .34 || ly > .66;
    let zone;
    if (nearX && nearY) zone = { corner: true, cx: lx > .5 ? 1 : 0, cy: ly > .5 ? 1 : 0 };
    else {
      const d = { left: lx, right: 1 - lx, top: ly, bottom: 1 - ly };
      zone = { edge: Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a)) };
    }
    drag = { x: e.clientX, y: e.clientY, w, h, third, zone, L: 0, moved: 0 };
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    const fx = (drag.third ? dy : dx) / drag.w, fy = (drag.third ? -dx : dy) / drag.h;
    const z = drag.zone;
    let L;
    if (z.corner) L = (z.cx ? -fx : fx) + (z.cy ? -fy : fy);
    else L = { bottom: -fy, top: fy, right: -fx, left: fx }[z.edge];
    drag.L = Math.max(0, Math.min(z.corner ? 2 : 1, L * 1.15));
    if (drag.moved > 4) showPeel(el, z, drag.L);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved < 6) { turnUp(key); return; }
    if (d.L > (d.zone.corner ? 1.2 : .62)) { turnUp(key, { peeled: true }); return; }
    // let go early: the card settles back down
    const t0 = performance.now(), from = d.L;
    const back = now => {
      const k = Math.min(1, (now - t0) / 160);
      if (s.turned.includes(key)) return;
      showPeel(el, d.zone, from * (1 - k));
      if (k < 1) requestAnimationFrame(back); else resetPeel(el);
    };
    requestAnimationFrame(back);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---------- the coup ----------

async function revealAll() {
  if (busy) return;
  busy = true; paint();
  for (const k of g.out(s)) {
    if (s.turned.includes(k)) continue;
    s.turned.push(k); save();
    const el = els.get(k);
    resetPeel(el); turn(el, g.cardOf(s, k)); sound.flip(); paintTotals();
    await wait(260);
  }
  busy = false;
  await proceed();
}

let proceeding = false;
// Once every card out is face up: the dealer's call, then the next card (face down to squeeze, or turned straight
// over with the squeeze off), or the payout.
async function proceed() {
  if (proceeding || s.phase !== 'reveal' || !g.allTurned(s)) return;
  proceeding = true; busy = true; paint();
  try {
    while (s.phase === 'reveal' && g.allTurned(s)) {
      await wait(450);
      const c = s.coup;
      const stageBefore = s.stage;
      const next = g.advance(s);
      save();
      const pt2 = g.score(c.player.slice(0, 2)), bt2 = g.score(c.banker.slice(0, 2));
      if (stageBefore === 1) {
        if (c.natural) table.say(pt2 >= 8 && bt2 >= 8 ? `A natural each: ${pt2} and ${bt2}.` : pt2 >= 8 ? `A natural ${pt2} for the Player.` : `A natural ${bt2} for the Banker.`);
        else if (next === 'p2') table.say(`Player has ${pt2} and draws.`);
        else table.say(next === 'b2' ? `Player stands on ${pt2}. Banker has ${bt2} and draws.` : `Player stands on ${pt2}. Banker stands on ${bt2}.`);
      } else if (stageBefore === 2) {
        table.say(next === 'b2' ? `Player has ${g.score(c.player)}. Banker has ${bt2} and draws.` : `Player has ${g.score(c.player)}. Banker stands on ${bt2}.`);
      }
      if (!next) { await wait(300); await payout(); break; }
      await wait(500);
      await place(next, { down: true });
      if (squeeze) break;           // your turn to squeeze it
      await wait(400);
      s.turned.push(next); save();
      turn(els.get(next), g.cardOf(s, next)); sound.flip(); paintTotals();
    }
  } finally {
    proceeding = false; busy = false; paint();
  }
}

async function payout() {
  const o = g.settle(s);
  s.paid = false; save();          // the result is kept before the chips move, so a reload can't pay twice
  if (!finish()) return;
  const c = s.coup;
  const net = o.back - o.wagered;
  showResult();
  const hi = Math.max(c.pt, c.bt), lo = Math.min(c.pt, c.bt);
  let line = c.winner === 'T' ? `Tie at ${c.pt}.` : `${NAME[c.winner]} wins, ${hi} to ${lo}.`;
  if (c.pPair || c.bPair) line += c.pPair && c.bPair ? ' A pair on both sides.' : c.pPair ? ' A Player pair.' : ' A Banker pair.';
  // each bet, when some won and others didn't: "The Banker bet wins 24; the Tie loses 25. Down 1."
  const bets = SPOT_NAMES.filter(([k]) => s.bets[k] > 0);
  const each = bets.map(([k, name], i) => {
    const won = o.pay[k] - s.bets[k], the = i ? 'the' : 'The';
    return won > 0 ? `${the} ${name} wins ${cage.fmt(won)}` : won === 0 ? `${the} ${name} comes back` : `${the} ${name} loses ${cage.fmt(s.bets[k])}`;
  });
  const mixed = bets.length > 1 && o.back > 0 && bets.some(([k]) => o.pay[k] < s.bets[k]);
  if (mixed) line += ` ${each.join('; ')}. ${netLine(o.wagered, o.back)}`;
  else if (net > 0) line += ` You win ${cage.fmt(net)}.`;
  else if (net === 0 && o.back) line += ' Your bets come back.';
  else line += ' The house takes it.';
  // the Banker's commission, the first time a Banker bet wins on this visit
  if (c.winner === 'B' && s.bets.banker > 0 && !toldCommission) {
    toldCommission = true;
    line += ' The Banker pays 19 to 20: even money less the house’s 5%, with any fraction of a chip kept toward your next Banker win.';
  }
  table.say(line, net > 0 ? 'win' : net < 0 ? 'lose' : '');
  if (net > 0) { sound.chips(5); sound.win(net >= o.wagered * 3 ? 3 : net >= o.wagered ? 2 : 1); float($('layout'), `+${cage.fmt(net)}`); }
  else if (net < 0) sound.lose(); else sound.push();
  paintBoard();
}

// A settled coup's chips to the rack and its line in Records, together and once: a coup just settled, or one settled
// before the page closed. False when there's nothing to pay.
function finish() {
  if (s.phase !== 'done' || !s.outcome || s.paid !== false || seat.guard()) return false;
  const o = s.outcome, c = s.coup;
  if (o.back > 0) cage.pay(o.back);
  s.paid = true; save();
  records.note('baccarat', { wagered: o.wagered, back: o.back, extra: { [NAME[c.winner].toLowerCase()]: 1, naturals: c.natural ? 1 : 0 } });
  return true;
}

function showResult() {
  const c = s.coup, o = s.outcome;
  $('pSide').classList.toggle('won', c.winner === 'P');
  $('bSide').classList.toggle('won', c.winner === 'B');
  for (const spot of document.querySelectorAll('.spot')) {
    const k = spot.dataset.bet;
    const bet = s.bets[k], pay = o?.pay?.[k] || 0;
    spot.classList.toggle('hit', bet > 0 && pay > 0);
    spot.classList.toggle('miss', bet > 0 && pay === 0);
    setStack(spot, pay, { most: 5 });
  }
}

// ---------- betting ----------

function paint() {
  const p = s.phase;
  const c = cage.read();
  const { min, max } = table.limits();
  const total = g.staked(s.bets);
  rack.limit(c.chips);
  $('rack').hidden = p === 'reveal';
  $('betActions').hidden = p !== 'bet';
  $('revealActions').hidden = p !== 'reveal';
  $('doneActions').hidden = p !== 'done';
  $('layout').classList.toggle('locked', p === 'reveal');
  if (p === 'bet') {
    for (const spot of document.querySelectorAll('.spot')) {
      spot.classList.remove('hit', 'miss');
      setStack(spot, s.bets[spot.dataset.bet], { most: 5 });
    }
  }
  $('clear').disabled = busy || !total;
  const lastTotal = g.staked(s.last);
  $('rebet').disabled = busy || !!total || !lastTotal || lastTotal > c.chips;
  $('deal').disabled = busy || total < min;
  $('deal').textContent = total && total < min ? `Deal (${min} min)` : 'Deal';
  $('reveal').disabled = busy;
  if (p === 'done') {
    $('again').textContent = lastTotal ? `Same bet: ${cage.fmt(lastTotal)}` : 'Same bet';
    $('again').disabled = busy || !lastTotal || lastTotal > c.chips;
  }
  $('squeeze').textContent = `Squeeze the cards: ${squeeze ? 'on' : 'off'}`;
  $('squeeze').setAttribute('aria-pressed', squeeze);
  paintTotals();
  table.check();
  // the button you pressed has gone (Deal, Turn them over): on to the next one, once the cards have stopped
  if (!busy) keepFocus(...({ bet: ['deal', 'rebet'], reveal: ['reveal'], done: ['again', 'newBet'] }[p] || []).map($));
}

function put(spot) {
  if (busy || seat.guard()) return;
  if (s.phase === 'done') newBet();
  if (s.phase !== 'bet') return;
  const v = rack.value;
  const { max } = table.limits();
  if (s.bets[spot] + v > max) { table.say(`The most on one bet here is ${cage.fmt(max)}.`); return; }
  if (!cage.take(v)) { table.say('Not enough chips for that one.'); return; }
  s.bets[spot] += v; save(); sound.chip(); table.say(''); paint();
}
for (const spot of document.querySelectorAll('.spot')) spot.addEventListener('click', () => put(spot.dataset.bet));

$('clear').addEventListener('click', () => {
  const total = g.staked(s.bets);
  if (!total || busy) return;
  cage.pay(total, { unwager: total });
  for (const k of g.SPOTS) s.bets[k] = 0;
  save(); sound.chips(3); paint();
});

function rebet() {
  const total = g.staked(s.last);
  if (!total || !cage.take(total)) return false;
  s.bets = { ...s.last }; save(); sound.chips(3); return true;
}
$('rebet').addEventListener('click', () => { if (!busy && !g.staked(s.bets) && rebet()) paint(); });

function newBet() {
  g.clear(s); clearCards(); save(); table.say(''); paint();
}
$('newBet').addEventListener('click', () => { if (!busy) newBet(); });
$('again').addEventListener('click', () => { if (busy) return; newBet(); if (rebet()) deal(); });

async function deal() {
  if (busy || seat.guard() || s.phase !== 'bet' || g.staked(s.bets) < table.limits().min) return;
  busy = true; paint();
  try {
    g.deal(s); save();
    clearCards();
    if (s.shuffled) { table.say('A fresh shoe. The scoreboard starts again.'); paintBoard(); }
    else table.say('');
    for (const k of g.out(s)) { await place(k, { down: true }); await wait(140); }
    if (!squeeze) {
      await wait(350);
      for (const k of g.out(s)) { s.turned.push(k); save(); turn(els.get(k), g.cardOf(s, k)); sound.flip(); paintTotals(); await wait(280); }
    } else if (!s.shuffled) table.say('Squeeze them, or turn them over.');
  } finally { busy = false; paint(); }
  if (g.allTurned(s)) proceed();
}
$('deal').addEventListener('click', deal);
$('reveal').addEventListener('click', revealAll);

$('squeeze').addEventListener('click', () => {
  squeeze = !squeeze;
  try { localStorage.setItem(SQUEEZE, squeeze ? 'on' : 'off'); } catch { /* off */ }
  sound.tap(); paint();
});

addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!hotkey(e)) return;
  const b = s.phase === 'bet' ? $('deal') : s.phase === 'reveal' ? $('reveal') : $('again');
  if (b && !b.disabled && !b.closest('[hidden]')) { b.click(); e.preventDefault(); }
});

let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(paintBoard, 150); });

// ---------- start: carry on where the last visit left off ----------

(async () => {
  finish();   // a coup settled but not paid (the page closed in between) is paid and recorded now
  if (s.phase !== 'bet' && s.coup) {
    for (const k of g.out(s)) place(k, { animate: false, down: !s.turned.includes(k) });
  }
  paintBoard();
  paint();
  if (s.phase === 'done') { showResult(); table.say('Same bet again, or a new one?'); }
  else if (s.phase === 'reveal') { table.say('Squeeze them, or turn them over.'); if (g.allTurned(s)) proceed(); }
  else table.say(g.staked(s.bets) ? '' : 'Place your bets.');
})();

// a squeeze that strays near the screen's side isn't Android's Back
guardEdges({ surfaces: [document.getElementById('pCards'), document.getElementById('bCards')] });

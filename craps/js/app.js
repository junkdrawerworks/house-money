// Craps on screen: chips onto the layout, the dice thrown against the back wall, and every bet paid or taken.
// The rules are in game.js; this file moves the chips (shared/cage.js) and saves the table after every move. A roll is
// decided and saved before the dice fly, with the chips it pays kept aside (pending) until they land, so a reload
// mid-throw pays exactly once. The roll's line for Records waits beside them (pendingRec) and goes in as they're paid.

import * as g from './game.js';
import * as cage from '../../shared/cage.js';
import * as records from '../../shared/records.js';
import * as sound from '../../shared/sound.js';
import { rack as makeRack, stackEl } from '../../shared/chips.js';
import { mountTable, float, wait, fast } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import * as seat from '../../shared/seat.js';

const KEY = 'house-money.craps';
const T = byId('craps');
const $ = id => document.getElementById(id);

let s = load();
// felt: the bets on the layout, and winnings decided but not yet in the rack (pending)
const onFelt = () => g.onFelt(s) + (s.pending || 0);
let busy = false;

const table = mountTable({
  id: 'craps', name: T.name, min: T.min, max: T.max,
  felt: onFelt,
  help: `
    <p>You’re the shooter. Put chips on the layout and press Roll. The first roll of a hand is the <b>come-out</b>.</p>
    <h3>The pass line</h3>
    <ul>
      <li>On the come-out, <b>Pass line</b> wins on 7 or 11 and loses on 2, 3 or 12 (craps). Any other number becomes
      <b>the point</b>, and the puck turns On.</li>
      <li>Then the pass line wins if the point comes again before a 7, and loses on a 7 (“seven out”). A pass bet
      can’t come down once there’s a point.</li>
      <li><b>Odds</b> behind the pass line pay true odds, with no house edge: 2 to 1 on 4 and 10, 3 to 2 on 5 and 9,
      6 to 5 on 6 and 8. Bet up to 3× your line bet on 4 and 10, 4× on 5 and 9, 5× on 6 and 8. An amount that doesn’t
      pay in whole chips (5 behind a 5 is owed 7½) pays the whole chips now and keeps the fraction for your next odds
      win, so nothing is lost.</li>
      <li><b>Don’t pass</b> is the other side: it wins on 2 or 3, ties on 12, loses on 7 or 11, and once there’s a point
      wins on a 7 before the point. <b>Lay odds</b> behind it (up to 6×) pay 1 to 2, 2 to 3 or 5 to 6, with any fraction
      kept the same way.</li>
    </ul>
    <h3>Come and don’t come</h3>
    <p>Once there’s a point, <b>Come</b> works just like the pass line, starting on the next roll: 7 or 11 wins, craps
    loses, and any other number moves your bet up to that number’s box. Tap the Come spot in that box to put odds on
    it. Come odds are off on a come-out roll. <b>Don’t come</b> is the don’t side, and its lay odds always work.</p>
    <h3>The numbers</h3>
    <p><b>Place</b> a number to bet it comes before a 7: 9 to 5 on 4 and 10, 7 to 5 on 5 and 9, 7 to 6 on 6 and 8.
    Place bets are off on the come-out. Bet sixes and eights in sixes, the rest in fives, or the odd chips are paid down.</p>
    <h3>The field and the middle</h3>
    <ul>
      <li><b>Field</b> is one roll: 3, 4, 9, 10 or 11 pays even money, 2 pays double, 12 pays triple, anything else loses.</li>
      <li><b>Hardways</b> bet a number comes as a pair before it comes any other way or a 7: hard 6 and 8 pay 9 to 1,
      hard 4 and 10 pay 7 to 1. They’re off on the come-out.</li>
      <li>The rest are one roll: <b>Seven</b> 4 to 1, <b>Any craps</b> 7 to 1, <b>3</b> and <b>11</b> 15 to 1,
      <b>2</b> and <b>12</b> 30 to 1.</li>
    </ul>
    <h3>Chips</h3>
    <p>Winning bets stay up, the way a dealer leaves them, and the winnings go to your rack. Odds and come bets that win
    come back with their winnings. <b>Undo</b> picks up the last chip you put down; <b>Take down</b> picks up every bet
    that’s allowed to come down. Hold a finger on one bet to take down just that one.</p>
    <p>Line and come bets start at ${T.min}. Played on the line with full odds, the house keeps well under one percent.</p>`,
  onStake: () => paint(),
  // the stack changed, here or in another tab
  onCage: () => { if (!busy) paint(); },
});

const rack = makeRack($('rack'), { values: [1, 5, 25, 100, 500], key: 'house-money.craps.chip' });
const bar = document.querySelector('header.bar'), dock = document.querySelector('.dock');
// the heights of the bar (the pit sticks under it) and of the dock (the pass line comes to rest just above it)
const setBarH = () => {
  document.body.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  document.body.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
};
setBarH(); addEventListener('resize', setBarH);

// On a come-out with nothing on the line, the pass line is brought up to sit just above the dock: on arrival, and after
// a seven out or a point made. (It's the last thing on the layout, a screen or more down on a phone.)
const lineEmpty = () => !s.bets.pass && !s.bets.dontPass;
function toPassLine() {
  if (s.point || !lineEmpty()) return;
  setBarH();
  const still = fast || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('.line.pass').scrollIntoView({ block: 'end', behavior: still ? 'instant' : 'smooth' });
}

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x && typeof x === 'object' && x.bets && typeof x.bets === 'object') {
      const bets = {};
      for (const [k, v] of Object.entries(x.bets)) { const n = Math.floor(Number(v)); if (n > 0 && g.NAMES[k]) bets[k] = n; }
      const carry = Number.isInteger(x.carry) && x.carry >= 0 && x.carry < g.CARRY ? x.carry : 0;
      return { ...g.fresh(), ...x, bets, point: g.POINTS.includes(x.point) ? x.point : 0, carry, undo: [] };
    }
  } catch { /* first visit */ }
  return { ...g.fresh(), undo: [] };
}
function save() { s.felt = onFelt(); seat.write(KEY, s); }

// ---------- the pieces ----------

function dieEl(v, mini = false) {
  const d = document.createElement('span');
  d.className = `die${mini ? ' mini' : ''}`;
  d.dataset.v = v;
  d.innerHTML = '<i></i>'.repeat(9);
  return d;
}
for (const b of document.querySelectorAll('.prop[data-d]')) {
  const [a, c] = b.dataset.d.split(',').map(Number);
  const pair = document.createElement('span'); pair.className = 'pair';
  pair.append(dieEl(a, true), dieEl(c, true));
  b.prepend(pair);
  b.setAttribute('aria-label', `${g.NAMES[b.dataset.spot]}, ${b.querySelector('small').textContent}`);
}

// The bet a tap on a spot makes: a come or don't come box in a number takes odds on the bet that's travelled there.
function betFor(el) {
  const k = el.dataset.spot;
  const m = /^(come|dcome)(\d+)$/.exec(k);
  return m ? `${m[1] === 'come' ? 'comeOdds' : 'dcomeOdds'}${m[2]}` : k;
}
// The element a bet sits in.
function spotEl(k) {
  const m = /^(comeOdds|dcomeOdds)(\d+)$/.exec(k);
  if (m) k = `${m[1] === 'comeOdds' ? 'come' : 'dcome'}${m[2]}`;
  return document.querySelector(`[data-spot="${k}"]`);
}

const spots = [...document.querySelectorAll('main [data-spot]')];

function paint() {
  const b = s.bets;
  for (const el of spots) {
    const k = el.dataset.spot;
    el.querySelectorAll(':scope > .stack').forEach(x => x.remove());
    const m = /^(come|dcome)(\d+)$/.exec(k);
    const amt = b[k] || 0;
    if (amt) el.appendChild(stackEl(amt, { most: 5 }));
    let odds = 0;
    if (m) { odds = b[betFor(el)] || 0; if (odds) { const o = stackEl(odds, { most: 4 }); o.classList.add('odds'); el.appendChild(o); } }
    const bet = betFor(el);
    const open = g.can(s, bet, table.limits().max).ok;
    el.classList.toggle('closed', !amt && !odds && !open);
    // off on the come-out: place bets, hardways, and odds on a come bet
    const off = !s.point && ((/^(place|hard)\d+$/.test(k) && amt) || (m && m[1] === 'come' && odds));
    el.classList.toggle('is-off', !!off);
    el.setAttribute('aria-label', label(el, amt, odds));
  }
  // the puck and the point
  const puck = $('puck');
  puck.className = `puck ${s.point ? 'on' : 'off'}`;
  puck.innerHTML = s.point ? `<b>On</b><span>${s.point}</span>` : '<b>Off</b>';
  puck.setAttribute('aria-label', s.point ? `The point is ${s.point}` : 'Come-out roll: no point');
  document.querySelectorAll('.box').forEach(x => x.classList.toggle('point', +x.dataset.n === s.point));
  // the last rolls
  const h = $('history');
  h.innerHTML = '';
  (s.history || []).slice(0, 10).forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = r.t; li.style.setProperty('--i', i);
    if (r.t === 7) li.classList.add('seven');
    h.appendChild(li);
  });
  // the dock
  const c = cage.read();
  rack.limit(Math.max(1, c.chips));
  const total = g.onFelt(s);
  $('undo').disabled = busy || !(s.undo || []).some(([k]) => g.removable(s, k) && s.bets[k]);
  $('clear').disabled = busy || !Object.keys(s.bets).some(k => g.removable(s, k));
  $('roll').disabled = busy || !total;
  const short = g.LINE.filter(k => b[k] && b[k] < T.min);
  // (on the come-out with nothing down, the stickman's line says where to start, so this says nothing)
  $('onfelt').textContent = !total ? (s.point ? `The point is ${s.point}. Bet Come, place a number, or anything in the middle.` : '')
    : short.length ? `${g.NAMES[short[0]]} needs at least ${T.min}.` : `On the layout: ${cage.fmt(total)}`;
  if (short.length) $('roll').disabled = true;
  table.check();
}

function label(el, amt, odds) {
  const k = el.dataset.spot;
  const parts = [g.NAMES[k]];
  if (amt) parts.push(`${cage.fmt(amt)} on it`);
  if (odds) parts.push(`${cage.fmt(odds)} odds`);
  return parts.join(', ');
}

// ---------- chips on and off ----------

function put(el) {
  if (busy) return;
  const k = betFor(el);
  const { ok, why, room } = g.can(s, k, table.limits().max);
  if (!ok) { table.say(why); return; }
  const n = Math.min(rack.value, room);
  if (!cage.take(n)) { table.say('Not enough chips for that one.'); return; }
  s.bets[k] = (s.bets[k] || 0) + n;
  (s.undo ||= []).push([k, n]);
  const pw = g.paysWhole(k, s.bets[k], s.point);
  if (n < rack.value) table.say(`That fills ${g.NAMES[k].toLowerCase()}: ${cage.fmt(s.bets[k])} is the most it takes.`);
  else if (pw && !pw.whole) { table.say(notWhole(k, s.bets[k], pw)); priced = true; }
  else if (priced) { table.say(''); priced = false; }
  save(); sound.chip(); paint();
}

// A bet that won't pay in whole chips, said as the chip goes down: a place bet is paid down, so it says what would
// pay whole; odds keep the fraction. "Five on the 6 pays 5. Make it 6 and it pays 7."
let priced = false;   // the line on screen is one of these
const WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const FRACTION = { '1/2': 'a half', '1/3': 'a third', '2/3': 'two thirds', '1/5': 'a fifth', '2/5': 'two fifths',
  '3/5': 'three fifths', '4/5': 'four fifths', '1/6': 'a sixth', '5/6': 'five sixths' };
function notWhole(k, amount, pw) {
  const n = /\d+$/.exec(k)?.[0] || s.point;
  const amt = WORD[amount] ? WORD[amount][0].toUpperCase() + WORD[amount].slice(1) : cage.fmt(amount);
  if (!pw.kept) return `${amt} on the ${n} pays ${cage.fmt(pw.pays)}. Make it ${cage.fmt(pw.better.amount)} and it pays ${cage.fmt(pw.better.pays)}.`;
  const owed = `${cage.fmt(pw.owed[0])} and ${FRACTION[pw.owed[1].join('/')]}`;
  const lay = /^(dontOdds|dcomeOdds)/.test(k);
  return `${lay ? `Laying ${cage.fmt(amount)} against` : `${amt} in odds on`} the ${n} pays ${owed}. The fraction’s kept toward your next odds win.`;
}

function takeDown(k, n = s.bets[k]) {
  if (!n || !g.removable(s, k)) return 0;
  n = Math.min(n, s.bets[k] || 0);
  if (!n) return 0;
  s.bets[k] -= n;
  if (!s.bets[k]) delete s.bets[k];
  // odds can't outlive the bet they're on
  const dep = { pass: 'passOdds', dontPass: 'dontOdds' }[k] || (/^dcome(\d+)$/.test(k) ? k.replace('dcome', 'dcomeOdds') : null);
  let extra = 0;
  if (dep && !s.bets[k] && s.bets[dep]) { extra = s.bets[dep]; delete s.bets[dep]; }
  cage.pay(n + extra, { unwager: n + extra });
  return n + extra;
}

// A long press on a bet takes that one down; a tap puts a chip on it.
for (const el of spots) {
  let timer = 0, held = false;
  el.addEventListener('pointerdown', () => {
    held = false;
    timer = setTimeout(() => {
      held = true;
      const k = betFor(el);
      const own = s.bets[k] ? k : s.bets[el.dataset.spot] ? el.dataset.spot : null;
      if (!own || busy) return;
      if (!g.removable(s, own)) { table.say(`${g.NAMES[own]} can’t come down once it has a point.`); return; }
      const n = takeDown(own);
      if (n) { s.undo = (s.undo || []).filter(([x]) => s.bets[x]); save(); sound.chips(3); table.say(`${g.NAMES[own]} comes down: ${cage.fmt(n)} back to your rack.`); paint(); }
    }, 550);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(timer));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => { if (held) { e.preventDefault(); held = false; return; } put(el); });
}

$('undo').addEventListener('click', () => {
  if (busy) return;
  while ((s.undo || []).length) {
    const [k, n] = s.undo.pop();
    if (s.bets[k] && g.removable(s, k)) { takeDown(k, n); sound.chip(); break; }
  }
  save(); paint();
});
$('clear').addEventListener('click', () => {
  if (busy) return;
  let n = 0;
  for (const k of Object.keys(s.bets)) if (s.bets[k] && g.removable(s, k)) n += takeDown(k);
  if (n) { sound.chips(5); table.say(`Taken down: ${cage.fmt(n)} back to your rack.`); }
  s.undo = []; save(); paint();
});

// ---------- the throw ----------

const pit = $('pit'), diceBox = $('dice');

async function throwDice(d1, d2) {
  diceBox.innerHTML = '';
  const W = pit.clientWidth, H = pit.clientHeight;
  const dice = [d1, d2].map(v => { const d = dieEl(v); diceBox.appendChild(d); return d; });
  if (fast || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dice.forEach((d, i) => { d.style.left = `${W / 2 - 40 + i * 46}px`; d.style.top = '54px'; });
    sound.dice();
    return;
  }
  const dur = 1150;
  const landX = W * (.32 + Math.random() * .22);
  const jobs = dice.map((d, i) => {
    const x0 = -50 - i * 30, y0 = H - 10 + i * 12;
    const xw = W * (.55 + Math.random() * .3) + i * 30, yw = 18;
    // landing between the row of last rolls and the stickman's line
    const x1 = landX + i * (44 + Math.random() * 14), y1 = 52 + Math.random() * (H - 140) + i * 5;
    const spin = (Math.random() < .5 ? -1 : 1) * (540 + Math.random() * 360);
    d.style.left = '0px'; d.style.top = '0px';
    // tumbling faces while it flies
    const faces = setInterval(() => { d.dataset.v = 1 + Math.floor(Math.random() * 6); }, 70);
    setTimeout(() => { clearInterval(faces); d.dataset.v = [d1, d2][i]; }, dur * .8);
    return d.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg)` },
      { transform: `translate(${xw}px, ${yw}px) rotate(${spin * .55}deg)`, offset: .5, easing: 'cubic-bezier(.3,.6,.6,1)' },
      { transform: `translate(${(xw + x1) / 2}px, ${y1 - 14}px) rotate(${spin * .85}deg)`, offset: .78 },
      { transform: `translate(${x1}px, ${y1}px) rotate(${spin}deg)` },
    ], { duration: dur, easing: 'cubic-bezier(.25,.75,.35,1)', fill: 'forwards' }).finished.catch(() => {});
  });
  setTimeout(() => sound.dice(), dur * .48);
  await Promise.all(jobs);
}

function roll() {
  if (busy || $('roll').disabled || seat.guard()) return;
  busy = true; paint();
  (async () => {
    try {
      const d1 = g.die(), d2 = g.die();
      const handBefore = s.handRolls || 0;
      const r = g.roll(s, d1, d2);
      s.pending = (s.pending || 0) + r.toRack; s.undo = [];
      s.pendingRec = r.wagered || r.back ? {
        wagered: r.wagered, back: r.back,
        extra: { pointsMade: r.point.made ? 1 : 0 },
        max: { longestHand: r.point.sevenOut ? handBefore + 1 : s.handRolls },
      } : null;
      save();
      table.say('');
      await throwDice(d1, d2);
      await wait(150);
      // bets decided: a glow and the winnings over the ones that won, a flash under the ones that lost
      let won = 0, lost = 0;
      for (const e of r.events) {
        const el = spotEl(e.spot);
        if (e.outcome === 'win') { won += e.win; if (el) { el.classList.remove('won'); void el.offsetWidth; el.classList.add('won'); float(el, `+${cage.fmt(e.win)}`); } }
        else if (e.outcome === 'lose') { lost += e.stake; if (el) { el.classList.remove('lost'); void el.offsetWidth; el.classList.add('lost'); } }
      }
      paint();
      finish();
      const net = won - lost;
      // bets that moved or stood off, which nothing else on screen says: "Your come bet goes to the 6."
      const moved = r.events.map(e => e.outcome === 'move' ? ` Your ${e.spot === 'come' ? 'come' : 'don’t come'} bet goes to the ${r.total}.`
        : e.outcome === 'push' ? ` ${e.spot === 'dontPass' ? 'Don’t pass' : 'Don’t come'} pushes on the 12.` : '').join('');
      // a new come-out with nothing on the line: the stickman calls for bets, and the pass line comes into view
      const comeOut = (r.point.made || r.point.sevenOut) && lineEmpty() ? ' Coming out: bets on the pass line.' : '';
      const sum = won && lost ? ` You win ${cage.fmt(won)} and lose ${cage.fmt(lost)}.` : won ? ` You win ${cage.fmt(won)}.` : lost ? ` You lose ${cage.fmt(lost)}.` : '';
      // odds that don't pay whole chips: the fraction is kept, or finishes a chip with what was kept before
      const frac = r.carry.now > r.carry.was ? ' The fraction of a chip left over is kept for your next odds win.'
        : r.carry.now < r.carry.was ? ' That includes the fraction kept from before.' : '';
      table.say(`${r.call}${moved}${sum}${frac}${comeOut}`, net > 0 ? 'win' : net < 0 ? 'lose' : '');
      if (comeOut) toPassLine();
      if (won) { sound.chips(4); sound.win(won >= 10 * Math.max(1, lost) && won >= 100 ? 3 : won >= 100 ? 2 : 1); } else if (lost) sound.lose();
    } finally { busy = false; paint(); }
  })();
}
$('roll').addEventListener('click', roll);

// A roll's winnings to the rack and its line in Records, together and once: dice just landed, or a throw the page
// closed on.
function finish() {
  if ((!(s.pending > 0) && !s.pendingRec) || seat.guard()) return;
  const owed = s.pending || 0, rec = s.pendingRec;
  if (owed > 0) cage.pay(owed);
  s.pending = 0; s.pendingRec = null; save();
  if (rec) records.note('craps', rec);
}

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if ((e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) { roll(); e.preventDefault(); }
  else if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') { $('undo').click(); e.preventDefault(); }
});

// ---------- start: a throw that never finished pays now ----------

finish();
save();
paint();
if (s.history?.length) {
  const [d1, d2] = s.history[0].d;
  diceBox.append(...[d1, d2].map((v, i) => { const d = dieEl(v); d.style.left = `${pit.clientWidth * .4 + i * 46}px`; d.style.top = '54px'; return d; }));
}
table.say(s.point ? `The point is ${s.point}.` : 'Coming out. Bets on the pass line.');
toPassLine();

// Roulette on screen: the layout you put chips on, the wheel, and the payout.
// The rules are in wheel.js and the drawing in draw.js; this file moves the chips (shared/cage.js) and saves the
// table after every change, so a reload brings back the chips on the layout and never pays a spin twice.

import * as R from './wheel.js';
import { Wheel } from './draw.js';
import * as cage from '../../shared/cage.js';
import * as records from '../../shared/records.js';
import * as sound from '../../shared/sound.js';
import { rack as makeRack, stackEl } from '../../shared/chips.js';
import { mountTable, float, wait, fast } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import { guardEdges } from '../../shared/edge-guard.js';

const KEY = 'house-money.roulette';
const T = byId('roulette');
const $ = id => document.getElementById(id);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let s = load();
const feltNow = () => sum(s.bets) + (s.spin && !s.spin.paid ? s.spin.wagered : 0);

const table = mountTable({
  id: 'roulette', name: T.name, min: T.min, max: T.max, felt: feltNow,
  help: `
    <p>Put chips on the numbers you think the ball will land on, then spin. The wheel has 37 pockets, 1 to 36 and a
    single green zero, so each number comes up 1 time in 37.</p>
    <h3>Putting chips down</h3>
    <ul>
      <li>Pick a chip from the rack, then tap the layout. As your finger goes down, the numbers your bet covers light
      up, and you can slide to another bet before you let go.</li>
      <li><b>On a number</b>: straight up. <b>On the line between two numbers</b>: a split. <b>Where four numbers
      meet</b>: a corner. <b>On the left edge of a row</b>: a street, its three numbers; on the left edge where two
      rows meet, a six line.</li>
      <li><b>Press and hold a number</b> (or right-click it) for a list of every bet that includes it, to pick from.</li>
      <li><b>Undo</b> picks up your last chip, <b>Clear</b> all of them. After a spin, <b>Rebet</b> puts the same
      bets back down, and once they're down the same button <b>doubles</b> them.</li>
    </ul>
    <h3>What it pays</h3>
    <table>
      <tr><th>Bet</th><th>Pays</th></tr>
      <tr><td>Straight up, one number</td><td>35 to 1</td></tr>
      <tr><td>Split, two numbers</td><td>17 to 1</td></tr>
      <tr><td>Street, three numbers (or a trio with the zero)</td><td>11 to 1</td></tr>
      <tr><td>Corner, four numbers (or the first four, 0 to 3)</td><td>8 to 1</td></tr>
      <tr><td>Six line, two rows</td><td>5 to 1</td></tr>
      <tr><td>Dozen or column</td><td>2 to 1</td></tr>
      <tr><td>Red, black, odd, even, 1 to 18, 19 to 36</td><td>1 to 1</td></tr>
    </table>
    <p>Zero is neither red nor black, odd nor even: when it comes up, the outside bets lose. Every bet gives the house
    the same 1 in 37 (2.7%), whichever you choose.</p>
    <h3>After the spin</h3>
    <p>The dolly marks the winning number. Winning bets come back to your rack with what they won, and the rest are
    swept. The strip above the layout keeps the last numbers, newest on the left. The wheel has no memory: a number
    that hasn't come up in a while is no more likely next time.</p>
    <p>On a keyboard, Space spins and Backspace undoes.</p>`,
  onStake: () => paint(),
  // the stack changed, here or in another tab
  onCage: () => { if (!busy) paint(); },
});

const rack = makeRack($('rack'), { values: [1, 5, 25, 100, 500], key: 'house-money.roulette.chip' });
const wheel = new Wheel($('wheel'));
wheel.onTick = v => sound.tick(v);
let busy = false;
let showing = null;   // the bets on the layout while a spin plays out (s.bets is empty by then)

function load() {
  let x = null;
  try { x = JSON.parse(localStorage.getItem(KEY)); } catch { /* first visit */ }
  const clean = o => {
    const out = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const n = Math.floor(Number(v)); if (R.valid(k) && n > 0) out[k] = n; }
    return out;
  };
  const st = { bets: {}, last: {}, undo: [], history: [], spin: null, felt: 0 };
  if (x && typeof x === 'object') {
    st.bets = clean(x.bets);
    st.last = clean(x.last);
    st.undo = Array.isArray(x.undo) ? x.undo.filter(u => Array.isArray(u) && R.valid(u[0]) && u[1] > 0) : [];
    st.history = Array.isArray(x.history) ? x.history.filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 14) : [];
    if (x.spin && Number.isInteger(x.spin.n)) st.spin = { ...x.spin, bets: clean(x.spin.bets) };
  }
  return st;
}
function save() { s.felt = feltNow(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full or off */ } }

// ---------- the layout ----------

const L = $('layout');
// a slide across the layout that strays near the screen's side isn't Android's Back
guardEdges({ surfaces: [L] });
function buildLayout() {
  const cell = (cls, html, style, data = {}) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = html; b.style.cssText = style;
    for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
    L.appendChild(b);
    return b;
  };
  const blank = (style, text = '') => { const d = document.createElement('div'); d.className = 'blank'; d.style.cssText = style; d.innerHTML = text ? `<span>${text}</span>` : ''; L.appendChild(d); };
  blank('grid-column: 1 / 3; grid-row: 1', 'Single<br>zero');
  cell('num zero', '<b>0</b>', '', { n: 0 }).setAttribute('aria-label', '0, green');
  for (let n = 1; n <= 36; n++) {
    const c = (n - 1) % 3, r = Math.floor((n - 1) / 3);
    cell(`num ${R.color(n)}`, `<b>${n}</b>`, `grid-column: ${3 + c}; grid-row: ${2 + r}`, { n }).setAttribute('aria-label', `${n}, ${R.color(n)}`);
  }
  const dz = ['1st 12', '2nd 12', '3rd 12'];
  dz.forEach((t, i) => cell('out v', `<span>${t}</span>`, `grid-column: 2; grid-row: ${2 + i * 4} / span 4`, { k: `d${i + 1}` }).setAttribute('aria-label', `${t}, pays 2 to 1`));
  const em = [['low', '1 to 18'], ['even', 'Even'], ['red', '<i class="dia red"></i>'], ['black', '<i class="dia black"></i>'], ['odd', 'Odd'], ['high', '19 to 36']];
  em.forEach(([k, t], i) => cell(`out v ${k}`, k === 'red' || k === 'black' ? t : `<span>${t}</span>`, `grid-column: 1; grid-row: ${2 + i * 2} / span 2`, { k }).setAttribute('aria-label', `${R.label(k)}, pays 1 to 1`));
  [1, 2, 3].forEach(i => cell('out col', '2 to 1', `grid-column: ${2 + i}; grid-row: 14`, { k: `col${i}` }).setAttribute('aria-label', `${R.label(`col${i}`)}, pays 2 to 1`));
  blank('grid-column: 1 / 3; grid-row: 14');
  const chips = document.createElement('div');
  chips.className = 'chips'; chips.id = 'chips';
  L.appendChild(chips);
}
buildLayout();
const cellOf = n => L.querySelector(`[data-n="${n}"]`);
const outOf = k => L.querySelector(`[data-k="${k}"]`);

// Which bet a point on a number lands on: the middle of a number is straight up, its edges splits, its corners
// corners, its left edge in the first column a street (or a six line where two rows meet).
function hit(el, x, y) {
  if (!el) return null;
  if (el.dataset.k) return el.dataset.k;
  const n = Number(el.dataset.n);
  const r = el.getBoundingClientRect();
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  const ex = Math.min(.27, 17 / r.width), ey = Math.min(.32, 12 / r.height);
  if (n === 0) {
    if (fy < 1 - Math.min(.3, 14 / r.height)) return 'n0';
    const px = fx * r.width, third = r.width / 3, near = 15;
    if (px < near) return 'b';
    if (Math.abs(px - third) < near) return 't0-1-2';
    if (Math.abs(px - 2 * third) < near) return 't0-2-3';
    return `s0-${Math.min(3, Math.floor(fx * 3) + 1)}`;
  }
  const c = (n - 1) % 3, row = Math.floor((n - 1) / 3);
  let dx = fx < ex ? -1 : fx > 1 - ex ? 1 : 0;
  const dy = fy < ey ? -1 : fy > 1 - ey ? 1 : 0;
  if (dx === -1 && c === 0) {
    if (dy === 0) return `st${n}`;
    if (dy === -1) return row === 0 ? 'b' : `l${n - 3}`;
    return row === 11 ? `st${n}` : `l${n}`;
  }
  if (dx === 1 && c === 2) dx = 0;
  if (dx && dy) {
    const r2 = row + dy;
    if (r2 < 0) return Math.min(c, c + dx) === 0 ? 't0-1-2' : 't0-2-3';
    if (r2 <= 11) return `c${Math.min(row, r2) * 3 + Math.min(c, c + dx) + 1}`;
    return `s${Math.min(n, n + dx)}-${Math.max(n, n + dx)}`;
  }
  if (dx) return `s${Math.min(n, n + dx)}-${Math.max(n, n + dx)}`;
  if (dy) {
    const r2 = row + dy;
    if (r2 < 0) return `s0-${n}`;
    if (r2 > 11) return `n${n}`;
    const m = n + 3 * dy;
    return `s${Math.min(n, m)}-${Math.max(n, m)}`;
  }
  return `n${n}`;
}

// Where a bet's chips sit on the layout, in px from its top left.
function spotOf(key) {
  const box = L.getBoundingClientRect();
  const rel = el => { const r = el.getBoundingClientRect(); return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top, w: r.width, h: r.height }; };
  const mid = q => ({ x: q.l + q.w / 2, y: q.t + q.h / 2 });
  if (outOf(key)) return mid(rel(outOf(key)));
  const ns = R.numbers(key);
  const k = key.replace(/[\d-]+$/, '');
  const a = rel(cellOf(ns[0] === 0 && k !== 'n' ? 1 : ns[0]));
  switch (k) {
    case 'n': return mid(rel(cellOf(ns[0])));
    case 's': {
      if (ns[0] === 0) { const q = rel(cellOf(ns[1])); return { x: q.l + q.w / 2, y: q.t - .75 }; }
      return ns[1] - ns[0] === 1 ? { x: a.r + .75, y: a.t + a.h / 2 } : { x: a.l + a.w / 2, y: a.b + .75 };
    }
    case 't': { const q = rel(cellOf(ns[1])); return { x: q.r + .75, y: q.t - .75 }; }
    case 'b': return { x: a.l + 1, y: a.t - .75 };
    case 'st': return { x: a.l + 1, y: a.t + a.h / 2 };
    case 'l': return { x: a.l + 1, y: a.b + .75 };
    case 'c': return { x: a.r + .75, y: a.b + .75 };
    default: return mid(a);
  }
}

function light(key) {
  L.querySelectorAll('.lit').forEach(e => e.classList.remove('lit'));
  if (!key) return;
  for (const n of R.numbers(key) || []) cellOf(n)?.classList.add('lit');
  outOf(key)?.classList.add('lit');
}

const pays = key => `pays ${R.payout(key)} to 1`;
const cap = t => t[0].toUpperCase() + t.slice(1);

// ---------- drawing ----------

function paintChips({ fresh = null } = {}) {
  const box = $('chips');
  const bets = showing || s.bets;
  const keep = new Set(Object.keys(bets));
  box.querySelectorAll('.stack').forEach(el => { if (!keep.has(el.dataset.key)) el.remove(); });
  for (const [key, amt] of Object.entries(bets)) {
    let el = box.querySelector(`.stack[data-key="${key}"]`);
    if (!el || Number(el.dataset.amt) !== amt) {
      const next = stackEl(amt, { most: 5, tag: false });
      next.dataset.key = key; next.dataset.amt = amt;
      if (key === fresh) next.classList.add('new');
      if (el) el.replaceWith(next); else box.appendChild(next);
      el = next;
    }
    const p = spotOf(key);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
  // the dolly, on the last winning number until the next chip goes down
  let dolly = box.querySelector('.dolly');
  const dn = s.spin && s.spin.shown !== 'cleared' ? s.spin.n : null;
  if (dn !== null && s.spin.shown === true) {
    if (!dolly) { dolly = document.createElement('span'); dolly.className = 'dolly'; box.appendChild(dolly); }
    const p = spotOf(`n${dn}`);
    dolly.style.left = `${p.x}px`; dolly.style.top = `${p.y}px`;
  } else dolly?.remove();
}

function paintHistory() {
  $('history').innerHTML = s.history.slice(0, 12).map(n => `<li class="${R.color(n)}" aria-label="${n} ${R.color(n)}">${n}</li>`).join('');
}

function paint() {
  const c = cage.read();
  rack.limit(c.chips);
  const on = sum(s.bets);
  $('onTable').textContent = on ? `${cage.fmt(on)} on the table` : '';
  $('undo').disabled = busy || !s.undo.length;
  $('clear').disabled = busy || !on;
  const lastTotal = sum(s.last);
  if (on) {
    $('again').textContent = 'Double';
    $('again').disabled = busy || on > c.chips;
  } else {
    $('again').textContent = 'Rebet';
    $('again').setAttribute('aria-label', lastTotal ? `Rebet ${cage.fmt(lastTotal)}` : 'Rebet');
    $('again').disabled = busy || !lastTotal || lastTotal > c.chips;
  }
  $('spin').disabled = busy || !on;
  paintChips();
  table.check();
}

// ---------- putting chips down ----------

function clearResult() {
  if (s.spin && s.spin.shown !== 'cleared') { s.spin.shown = 'cleared'; }
  L.querySelectorAll('.won').forEach(e => e.classList.remove('won'));
}

function place(key, v = rack.value) {
  if (busy || !R.valid(key)) return false;
  clearResult();
  const { max } = table.limits();
  const cur = s.bets[key] || 0;
  if (cur + v > max) { table.say(`The most on one bet is ${cage.fmt(max)}.`); sound.lose(); return false; }
  if (!cage.take(v)) { table.say('Not enough chips for that one.'); return false; }
  s.bets[key] = cur + v;
  s.undo.push([key, v]);
  if (s.undo.length > 200) s.undo.shift();
  save(); sound.chip();
  table.say(`${cap(R.label(key))}: ${cage.fmt(s.bets[key])} on it. It ${pays(key)}.`);
  paintChips({ fresh: key });
  paint();
  return true;
}

$('undo').addEventListener('click', () => {
  if (busy) return;
  const u = s.undo.pop();
  if (!u) return;
  const [key, v] = u;
  const take = Math.min(v, s.bets[key] || 0);
  if (take > 0) {
    s.bets[key] -= take;
    if (!s.bets[key]) delete s.bets[key];
    cage.pay(take, { unwager: take });
  }
  save(); sound.chip();
  table.say(take ? `Picked up ${cage.fmt(take)} from ${R.label(key)}.` : '');
  paint();
});

$('clear').addEventListener('click', () => {
  const on = sum(s.bets);
  if (busy || !on) return;
  cage.pay(on, { unwager: on });
  s.bets = {}; s.undo = [];
  save(); sound.chips(4);
  table.say('Chips back in your rack.');
  paint();
});

$('again').addEventListener('click', () => {
  if (busy) return;
  const { max } = table.limits();
  if (sum(s.bets)) {
    // double every bet on the table
    const over = Object.entries(s.bets).find(([, v]) => v * 2 > max);
    if (over) { table.say(`Doubling would put more than ${cage.fmt(max)} on ${R.label(over[0])}.`); return; }
    const on = sum(s.bets);
    if (!cage.take(on)) { table.say('Not enough chips to double.'); return; }
    for (const k of Object.keys(s.bets)) { s.undo.push([k, s.bets[k]]); s.bets[k] *= 2; }
    save(); sound.chips(5);
    table.say(`Doubled: ${cage.fmt(on * 2)} on the table.`);
  } else {
    const bets = Object.fromEntries(Object.entries(s.last).map(([k, v]) => [k, Math.min(v, max)]));
    const total = sum(bets);
    if (!total || !cage.take(total)) { table.say('Not enough chips for the same bets.'); return; }
    clearResult();
    s.bets = bets;
    s.undo = Object.entries(bets);
    save(); sound.chips(5);
    table.say(`The same bets again: ${cage.fmt(total)}.`);
  }
  paint();
});

// ---------- touching the layout ----------

let press = null;   // { id, el, key, x, y, timer, picked }

function targetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && L.contains(el) ? el.closest('.num, .out') : null;
}

function preview(key) {
  light(key);
  if (key) table.say(`${cap(R.label(key))}: ${pays(key)}.${s.bets[key] ? ` ${cage.fmt(s.bets[key])} on it.` : ''}`);
}

L.addEventListener('pointerdown', e => {
  if (busy || e.button > 0) return;
  const el = targetAt(e.clientX, e.clientY);
  if (!el) return;
  e.preventDefault();
  L.setPointerCapture?.(e.pointerId);
  const key = hit(el, e.clientX, e.clientY);
  press = { id: e.pointerId, el, key, x: e.clientX, y: e.clientY, timer: 0, picked: false };
  if (el.dataset.n !== undefined) {
    press.timer = setTimeout(() => {
      if (!press) return;
      press.picked = true;
      light(null);
      openPicker(Number(el.dataset.n));
    }, 520);
  }
  preview(key);
});

L.addEventListener('pointermove', e => {
  if (press && e.pointerId === press.id) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press.timer = 0; }
    const el = targetAt(e.clientX, e.clientY);
    const key = el ? hit(el, e.clientX, e.clientY) : null;
    if (key !== press.key) { press.key = key; press.el = el; preview(key); }
  } else if (!press && e.pointerType === 'mouse' && !busy) {
    const el = targetAt(e.clientX, e.clientY);
    light(el ? hit(el, e.clientX, e.clientY) : null);
  }
});

function endPress(e, placeIt) {
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.timer);
  const p = press; press = null;
  if (e.pointerType !== 'mouse') light(null);
  if (placeIt && !p.picked && p.key) place(p.key);
}
L.addEventListener('pointerup', e => endPress(e, true));
L.addEventListener('pointercancel', e => endPress(e, false));
L.addEventListener('pointerleave', e => { if (!press && e.pointerType === 'mouse') light(null); });
L.addEventListener('contextmenu', e => {
  e.preventDefault();
  const el = targetAt(e.clientX, e.clientY);
  if (el?.dataset.n !== undefined && !busy) { if (press) { clearTimeout(press.timer); press.picked = true; } openPicker(Number(el.dataset.n)); }
});
// the keyboard: Enter or Space on a number or an outside bet puts a chip on it
L.addEventListener('click', e => {
  if (e.detail !== 0) return;
  const el = e.target.closest('.num, .out');
  if (el) place(el.dataset.k || `n${el.dataset.n}`);
});

// ---------- the picker: every bet on one number ----------

const picker = $('picker');
function openPicker(n) {
  $('pickH').textContent = `Bets on ${n}`;
  $('pickWhat').textContent = `Tap one to put a ${cage.fmt(rack.value)} chip on it.`;
  const list = $('pickList');
  const draw = () => {
    list.innerHTML = '';
    for (const key of R.betsOn(n)) {
      const b = document.createElement('button');
      b.type = 'button';
      const on = s.bets[key];
      b.innerHTML = `<span>${cap(R.label(key))}${on ? ` <span class="has">${cage.fmt(on)}</span>` : ''}</span><small>${R.payout(key)} to 1</small>`;
      b.addEventListener('click', () => { if (place(key)) draw(); });
      list.appendChild(b);
    }
  };
  draw();
  if (!picker.open) picker.showModal();
}
$('pickClose').addEventListener('click', () => picker.close());
picker.addEventListener('click', e => { if (e.target === picker) picker.close(); });

// ---------- the spin ----------

const box = $('wheelBox');
const wide = () => matchMedia('(min-width: 900px) and (min-height: 600px)').matches;
$('peek').addEventListener('click', () => {
  if (busy) return;
  box.classList.toggle('show');
  wheel.size();
});
box.addEventListener('click', () => { if (!busy && !wide()) box.classList.remove('show'); });

async function spin() {
  if (busy) return;
  const on = sum(s.bets);
  if (!on) { table.say('Put a chip down first.'); return; }
  const { min } = table.limits();
  const small = Object.entries(s.bets).find(([, v]) => v < min);
  if (small) { table.say(`The minimum on a bet here is ${min}.`); return; }
  busy = true;
  clearResult();
  // the result is chosen and the spin settled now, before the wheel turns, and saved: a reload pays it
  const n = R.draw();
  const res = R.settle(s.bets, n);
  showing = { ...s.bets };
  s.spin = { n, bets: { ...s.bets }, back: res.back, wagered: res.wagered, paid: false, shown: false };
  s.last = { ...s.bets };
  s.bets = {}; s.undo = [];
  s.history.unshift(n); s.history = s.history.slice(0, 14);
  save();
  paint();
  light(null);
  table.say('No more bets.');
  $('result').innerHTML = '';
  if (!wide()) { box.classList.add('show'); wheel.size(); }
  await wait(wide() ? 0 : 420);
  if (fast || reduced()) wheel.place(n);
  else await wheel.spin(n, 6400);
  await reveal();
  busy = false;
  paint();
}
$('spin').addEventListener('click', spin);

// The ball is in: the number, the dolly, the winners paid and the losers swept.
async function reveal() {
  const sp = s.spin;
  const n = sp.n, col = R.color(n);
  const res = R.settle(sp.bets, n);
  $('result').innerHTML = `<b class="${col}">${n}</b> ${n === 0 ? 'Zero' : cap(col)}`;
  paintHistory();
  await wait(wide() ? 300 : 1300);
  if (!wide()) box.classList.remove('show');
  showing = { ...sp.bets };
  sp.shown = true;
  paintChips();
  cellOf(n)?.classList.add('won');
  await wait(450);
  // losers swept, winners lit
  const winners = new Set(res.wins.map(w => w.key));
  for (const el of $('chips').querySelectorAll('.stack')) el.classList.add(winners.has(el.dataset.key) ? 'winner' : 'swept');
  if (res.wins.length) sound.chips(3);
  for (const w of res.wins) {
    const el = $('chips').querySelector(`.stack[data-key="${w.key}"]`);
    if (el) float(el, `+${cage.fmt(w.pay)}`);
  }
  pay();
  const net = sp.back - sp.wagered;
  const name = n === 0 ? 'Zero' : `${n} ${col}`;
  if (net > 0) { table.say(`${name}. You win ${cage.fmt(net)}.`, 'win'); sound.win(net >= sp.wagered * 5 ? 3 : net >= sp.wagered ? 2 : 1); }
  else if (sp.back > 0) { table.say(`${name}. You get ${cage.fmt(sp.back)} back.`); sound.push(); }
  else { table.say(`${name}. ${n === 0 ? 'The zero sweeps the table.' : 'The house sweeps the table.'}`, 'lose'); sound.lose(); }
  await wait(1500);
  // the winners go home to the rack
  for (const el of $('chips').querySelectorAll('.stack.winner')) el.classList.add('home');
  await wait(700);
  showing = null;
  save();
  paintChips();
}

// The chips for a settled spin go to the rack exactly once.
function pay() {
  const sp = s.spin;
  if (!sp || sp.paid) return;
  sp.paid = true;
  save();                 // marked paid before the chips move: a reload in between can't pay twice
  if (sp.back > 0) cage.pay(sp.back);
  const straight = Object.keys(sp.bets).some(k => /^n\d/.test(k) && R.covers(k, sp.n));
  records.note('roulette', { wagered: sp.wagered, back: sp.back, extra: { straightHits: straight ? 1 : 0, zeros: sp.n === 0 ? 1 : 0 } });
}

// ---------- keys, resizing, other tabs ----------

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === ' ' && !(e.target instanceof HTMLButtonElement && L.contains(e.target))) { e.preventDefault(); if (!$('spin').disabled) spin(); }
  else if (e.key === 'Backspace' || e.key === 'z') { e.preventDefault(); $('undo').click(); }
});
addEventListener('storage', e => { if (e.key === KEY && !busy) { s = load(); paintHistory(); paint(); } });
let rs = 0;
addEventListener('resize', () => { cancelAnimationFrame(rs); rs = requestAnimationFrame(() => { wheel.size(); paintChips(); }); });

// ---------- start: carry on where the last visit left off ----------

(() => {
  if (s.spin && !s.spin.paid) {
    // a spin that was settled but not paid (the page closed mid-spin) pays now
    pay();
    s.spin.shown = true;
    save();
  }
  wheel.place(s.history.length ? s.history[0] : null);
  paintHistory();
  if (s.spin && s.spin.shown === true) cellOf(s.spin.n)?.classList.add('won');
  paint();
  const on = sum(s.bets);
  if (s.spin && s.spin.shown === true) table.say(`Last spin: ${s.spin.n === 0 ? 'zero' : `${s.spin.n} ${R.color(s.spin.n)}`}. Place your bets.`);
  else table.say(on ? `${cage.fmt(on)} on the table.` : 'Place your bets.');
  requestAnimationFrame(() => { wheel.size(); paintChips(); });
  if (document.fonts) document.fonts.ready.then(() => { wheel.face = null; wheel.draw(); paintChips(); });
})();

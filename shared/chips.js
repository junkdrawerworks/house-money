// Casino chips: the colours, a stack of them for any amount, and the rack you pick a chip from.

import { fmt } from './cage.js';

export const DENOMS = [1, 5, 25, 100, 500, 1000, 5000];
export const NAMES = { 1: 'white', 5: 'red', 10: 'blue', 25: 'green', 100: 'black', 500: 'purple', 1000: 'orange', 5000: 'gray' };

// Short money: 1,250 → 1.2K, 25,000 → 25K.
export function short(n) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function chipEl(v, tag = 'span') {
  const el = document.createElement(tag);
  el.className = `chip c${v}`;
  el.innerHTML = `<b>${short(v)}</b>`;
  return el;
}

// The chips that make up an amount, biggest first.
export function breakdown(amount) {
  const out = [];
  let left = Math.floor(amount);
  for (let i = DENOMS.length - 1; i >= 0; i--) {
    while (left >= DENOMS[i]) { out.push(DENOMS[i]); left -= DENOMS[i]; }
  }
  return out;
}

// A stack for an amount, drawn as at most `most` chips with the total on a tag. Empty for 0.
export function stackEl(amount, { most = 7, tag = true } = {}) {
  const el = document.createElement('span');
  el.className = 'stack';
  if (!(amount > 0)) return el;
  const chips = breakdown(amount); // biggest at the bottom of the stack
  const shown = chips.slice(0, most);
  shown.forEach((v, i) => {
    const c = chipEl(v);
    c.style.setProperty('--i', i);
    el.appendChild(c);
  });
  el.style.setProperty('--n', shown.length);
  if (tag) {
    const t = document.createElement('span');
    t.className = 'amt';
    t.textContent = fmt(amount);
    el.appendChild(t);
  }
  el.setAttribute('aria-label', `${fmt(amount)} in chips`);
  return el;
}

// Puts a stack for `amount` into a spot (replacing what was there).
export function setStack(spot, amount, opts) {
  let holder = spot.querySelector(':scope > .stack');
  const next = stackEl(amount, opts);
  if (holder) holder.replaceWith(next); else spot.appendChild(next);
  spot.classList.toggle('has', amount > 0);
  return next;
}

// The rack: a row of chip buttons to pick which chip a tap on the felt puts down.
// rack(el, { values, key, chips: () => stack size, onPick })
export function rack(el, { values = DENOMS.slice(0, 5), key = 'house-money.denom', onPick = () => {} } = {}) {
  el.classList.add('rack');
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', 'Chip to bet');
  let picked = Number((() => { try { return localStorage.getItem(key); } catch { return null; } })());
  if (!values.includes(picked)) picked = values[Math.min(1, values.length - 1)];
  const buttons = values.map(v => {
    const b = chipEl(v, 'button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `${fmt(v)} chip`);
    b.addEventListener('click', () => pick(v));
    el.appendChild(b);
    return b;
  });
  function pick(v) {
    picked = v;
    try { localStorage.setItem(key, String(v)); } catch { /* off */ }
    buttons.forEach((b, i) => { const on = values[i] === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    onPick(v);
  }
  pick(picked);
  return {
    get value() { return picked; },
    pick,
    // dims the chips bigger than what's left, and moves off one you can't afford
    limit(chips) {
      buttons.forEach((b, i) => { b.disabled = values[i] > chips; });
      if (picked > chips) { const fit = [...values].reverse().find(v => v <= chips); if (fit) pick(fit); }
    },
  };
}

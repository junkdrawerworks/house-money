// Playing cards for the card tables: a card is { r, s } with r from 1 (ace) to 13 (king) and s one of 'shdc'.
// A shoe is several decks shuffled together; cardEl() draws one card as plain DOM, styled by shared/casino.css.

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
export const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_NAME = ['', 'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
export const red = c => c.s === 'h' || c.s === 'd';
export const label = c => `${RANK_NAME[c.r]} of ${SUIT_NAME[c.s]}`;
export const short = c => `${RANK[c.r]}${SUIT[c.s]}`;

export function deck() {
  const d = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ r, s });
  return d;
}

// Fisher–Yates, with crypto randomness when there is some (rng() for tests and screenshots).
export function rand() {
  if (globalThis.crypto?.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; }
  return Math.random();
}
export function shuffle(a, rng = rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function shoe(decks = 6, rng = rand) {
  const a = [];
  for (let i = 0; i < decks; i++) a.push(...deck());
  return shuffle(a, rng);
}

// One card as an element. down: face down (the back shows). Turn it over later with turn(el, card).
export function cardEl(card, { down = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'img');
  if (card) paint(el, card);
  if (down || !card) { el.classList.add('down'); el.setAttribute('aria-label', 'a card, face down'); }
  return el;
}

// Where the suit marks go on the number cards, as % across and down the space between the corners, the way a printed deck lays them out.
const L = 16, M = 50, R = 84, TOP = 11, BOT = 89;
const PIPS = {
  2: [[M, TOP], [M, BOT]],
  3: [[M, TOP], [M, 50], [M, BOT]],
  4: [[L, TOP], [R, TOP], [L, BOT], [R, BOT]],
  5: [[L, TOP], [R, TOP], [M, 50], [L, BOT], [R, BOT]],
  6: [[L, TOP], [R, TOP], [L, 50], [R, 50], [L, BOT], [R, BOT]],
  7: [[L, TOP], [R, TOP], [M, 34.5], [L, 50], [R, 50], [L, BOT], [R, BOT]],
  8: [[L, TOP], [R, TOP], [M, 34.5], [L, 50], [R, 50], [M, 65.5], [L, BOT], [R, BOT]],
  9: [[L, TOP], [R, TOP], [L, 39.7], [R, 39.7], [M, 50], [L, 60.3], [R, 60.3], [L, BOT], [R, BOT]],
  10: [[L, TOP], [R, TOP], [M, 29.3], [L, 39.7], [R, 39.7], [L, 60.3], [R, 60.3], [M, 70.7], [L, BOT], [R, BOT]],
};

function paint(el, card) {
  const rk = RANK[card.r], st = SUIT[card.s];
  el.classList.toggle('red', red(card));
  el.dataset.r = card.r; el.dataset.s = card.s;
  const corner = `<b>${rk}</b><i>${st}</i>`;
  const middle = card.r > 10
    ? `<span class="face"><b>${rk}</b><i>${st}</i></span>`
    : card.r === 1 ? `<span class="pip ace">${st}</span>`
      : `<span class="pip one">${st}</span><span class="pips">${PIPS[card.r].map(([x, y]) => `<i style="left:${x}%;top:${y}%"${y > 50 ? ' class="flip"' : ''}>${st}</i>`).join('')}</span>`;
  el.innerHTML = `<span class="front"><span class="corner tl">${corner}</span>${middle}<span class="corner br">${corner}</span></span><span class="back"></span>`;
  el.setAttribute('aria-label', label(card));
}

export function turn(el, card) {
  if (card) paint(el, card);
  el.classList.remove('down');
  el.setAttribute('aria-label', label({ r: +el.dataset.r, s: el.dataset.s }));
}

// Deals an element into a row with a slide from the shoe's corner (top right of the screen by default).
export function dealInto(row, el, { from = null, delay = 0 } = {}) {
  row.appendChild(el);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const to = el.getBoundingClientRect();
  const fx = from ? from.left : innerWidth - 40, fy = from ? from.top : 40;
  const dx = fx - to.left, dy = fy - to.top;
  const a = el.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-20deg)`, opacity: .2 },
    { transform: 'none', opacity: 1 },
  ], { duration: 320, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
  return a.finished.catch(() => {});
}

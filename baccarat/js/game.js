// Baccarat's rules, with nothing on screen: punto banco from an eight-deck shoe. Player pays 1 to 1, Banker 19 to 20
// (even money less 5% commission), Tie 8 to 1, and the pair bets 11 to 1. Who draws a third card is fixed by the
// tableau below, so the whole coup is settled the moment it's dealt; the screen only turns the cards over.
// The game is one plain object (state), saved after every step, so a reload carries on mid-coup.

import { shoe as makeShoe, rand } from '../../shared/cards.js';

export const DECKS = 8;
export const CARDS = DECKS * 52;
export const CUT = 16;          // the cut card sits this many cards from the back of the shoe

// Tens and pictures count nothing, aces one, the rest their number; a hand is the last digit of its sum.
export const point = c => (c.r >= 10 ? 0 : c.r);
export const score = cards => cards.reduce((a, c) => a + point(c), 0) % 10;

// The Player draws on 0 to 5 and stands on 6 or 7.
export const playerDraws = p => p <= 5;

// The Banker's tableau. b: the Banker's two-card total; p3: the point of the Player's third card, or null when the
// Player stood (then the Banker draws on 0 to 5, like the Player).
export function bankerDraws(b, p3) {
  if (p3 === null || p3 === undefined) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}

// A whole coup from a supply of cards (draw() hands over the next one): the cards in the order they lie on the
// table, and who won.
export function coup(draw) {
  const p = [draw()], b = [draw()];
  p.push(draw()); b.push(draw());
  const p2 = score(p), b2 = score(b);
  const natural = p2 >= 8 || b2 >= 8;
  if (!natural) {
    let p3 = null;
    if (playerDraws(p2)) { const c = draw(); p.push(c); p3 = point(c); }
    if (bankerDraws(b2, p3)) b.push(draw());
  }
  const pt = score(p), bt = score(b);
  return {
    player: p, banker: b, pt, bt, natural,
    winner: pt > bt ? 'P' : bt > pt ? 'B' : 'T',
    pPair: p[0].r === p[1].r, bPair: b[0].r === b[1].r,
  };
}

export const SPOTS = ['player', 'banker', 'tie', 'pp', 'bp'];
const noBets = () => ({ player: 0, banker: 0, tie: 0, pp: 0, bp: 0 });
export const staked = bets => SPOTS.reduce((a, k) => a + (bets?.[k] || 0), 0);

export function fresh(rng = rand) {
  return { shoe: makeShoe(DECKS, rng), phase: 'bet', bets: noBets(), last: null, coup: null, stage: 0, turned: [],
    road: [], carry: 0, shuffled: true, felt: 0 };
}

export const dueShuffle = s => s.shoe.length < CUT + 6;

// Deals a coup on the bets down (already taken off the stack). Leaves the state in 'reveal' at stage 1: the first
// four cards are out. A new shoe clears the scoreboard.
export function deal(s, rng = rand) {
  if (s.phase !== 'bet' || !(staked(s.bets) > 0)) return s;
  s.shuffled = false;
  if (dueShuffle(s)) { s.shoe = makeShoe(DECKS, rng); s.shuffled = true; s.road = []; }
  s.coup = coup(() => s.shoe.pop());
  s.phase = 'reveal'; s.stage = 1; s.turned = [];
  s.last = { ...s.bets };
  return s;
}

// The cards out on the table at the current stage, as keys: 'p0', 'p1', 'b0', 'b1' at stage 1, then the Player's
// third ('p2') at stage 2 and the Banker's third ('b2') at stage 3, if they draw.
export function out(s) {
  if (!s.coup) return [];
  const keys = ['p0', 'b0', 'p1', 'b1'];
  if (s.stage >= 2 && s.coup.player[2]) keys.push('p2');
  if (s.stage >= 3 && s.coup.banker[2]) keys.push('b2');
  return keys;
}
export const cardOf = (s, key) => (key[0] === 'p' ? s.coup.player : s.coup.banker)[+key[1]];

// Every card out has been turned over?
export const allTurned = s => out(s).every(k => s.turned.includes(k));

// On to the next card to deal, once everything out is turned: returns 'p2', 'b2', or null when the coup is over.
export function advance(s) {
  if (s.phase !== 'reveal' || !allTurned(s)) return null;
  if (s.stage < 2 && s.coup.player[2]) { s.stage = 2; return 'p2'; }
  if (s.stage < 3 && s.coup.banker[2]) { s.stage = 3; return 'b2'; }
  s.stage = 3;
  return null;
}

// What each bet pays back (stake included). The Banker's 5% is worked in twentieths of a chip: whole chips are paid
// now and the fraction is kept in carry, so over many wins the commission comes to exactly 5%.
export function payouts(c, bets, carry = 0) {
  const pay = noBets();
  let nextCarry = carry;
  if (c.winner === 'P') pay.player = bets.player * 2;
  if (c.winner === 'B' && bets.banker) {
    const twentieths = bets.banker * 39 + carry; // bet back (20) + 19/20 of it
    pay.banker = Math.floor(twentieths / 20);
    nextCarry = twentieths % 20;
  }
  if (c.winner === 'T') { pay.player = bets.player; pay.banker = bets.banker; pay.tie = bets.tie * 9; }
  if (c.pPair) pay.pp = bets.pp * 12;
  if (c.bPair) pay.bp = bets.bp * 12;
  return { pay, carry: nextCarry, back: staked(pay) };
}

// Settles the coup: what comes back, onto the scoreboard, and the state to 'done'.
export function settle(s) {
  const c = s.coup;
  const { pay, carry, back } = payouts(c, s.bets, s.carry);
  s.carry = carry;
  s.phase = 'done';
  s.turned = out(s);
  s.road.push({ w: c.winner, pp: c.pPair, bp: c.bPair, p: c.pt, b: c.bt });
  s.outcome = { pay, back, wagered: staked(s.bets) };
  return s.outcome;
}

export function clear(s) {
  s.phase = 'bet'; s.bets = noBets(); s.coup = null; s.stage = 0; s.turned = []; s.outcome = null;
  return s;
}

// ---------- the scoreboard ----------

// The big road: a column for each run of Player or Banker wins, six down and then trailing right (the dragon's
// tail). Ties don't take a cell; they're counted on the win before them. A new run starts in the next column whose
// top is free, so a tail that has stepped up to the top row never has its cell taken. Returns cells as
// { c, r, w, ties }.
export function bigRoad(road) {
  const cells = new Map();
  const at = (c, r) => `${c},${r}`;
  let start = -1, col = 0, row = 0, lastW = null, last = null, early = 0;
  for (const x of road) {
    if (x.w === 'T') { if (last) last.ties++; else early++; continue; }
    if (x.w !== lastW) { start++; while (cells.has(at(start, 0))) start++; col = start; row = 0; }
    else if (row < 5 && !cells.has(at(col, row + 1))) row++;
    else col++;
    last = { c: col, r: row, w: x.w, ties: early };
    early = 0;
    cells.set(at(col, row), last);
    lastW = x.w;
  }
  return [...cells.values()];
}

export function tally(road) {
  const t = { P: 0, B: 0, T: 0 };
  for (const x of road) t[x.w]++;
  return t;
}

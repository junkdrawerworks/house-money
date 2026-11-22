// Blackjack's rules, with nothing on screen: six decks, dealer stands on all 17s, blackjack pays 3 to 2, double on any
// first two cards and after a split, split up to four hands (split aces take one card each), late surrender,
// insurance pays 2 to 1, and the dealer peeks under an ace or a ten for blackjack.
// The whole game is one plain object (state), saved after every move so a reload carries on mid-hand.

import { shoe as makeShoe, rand } from '../../shared/cards.js';

export const DECKS = 6;
export const CARDS = DECKS * 52;
export const CUT = 0.75;        // the cut card: a new shoe once three quarters of this one is dealt
export const MAX_HANDS = 4;

export const value = c => (c.r >= 10 ? 10 : c.r);

export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += value(c); if (c.r === 1) aces++; }
  const soft = aces > 0 && t + 10 <= 21;
  return { total: soft ? t + 10 : t, soft };
}
export const isBJ = cards => cards.length === 2 && total(cards).total === 21;

export function fresh(rng = rand) {
  return { shoe: makeShoe(DECKS, rng), phase: 'bet', bet: 0, last: 0, hands: [], active: 0, dealer: [], hole: true,
    insurance: 0, shuffled: true };
}

function draw(s, rng = rand) {
  if (!s.shoe.length) { s.shoe = makeShoe(DECKS, rng); s.shuffled = true; }
  return s.shoe.pop();
}

export const dueShuffle = s => s.shoe.length < CARDS * (1 - CUT);

// Deals a round on the bet in the circle. Leaves the state in 'insurance' (dealer shows an ace), 'play', or 'done'
// (someone had blackjack, and the round is settled). The caller has already taken the bet off the stack.
export function deal(s, rng = rand) {
  if (s.phase !== 'bet' || !(s.bet > 0)) return s;
  s.shuffled = false;
  if (dueShuffle(s)) { s.shoe = makeShoe(DECKS, rng); s.shuffled = true; }
  const p = [], d = [];
  p.push(draw(s, rng)); d.push(draw(s, rng)); p.push(draw(s, rng)); d.push(draw(s, rng));
  s.hands = [{ id: 0, cards: p, bet: s.bet, doubled: false, split: false, aces: false, done: false, surrendered: false }];
  s.dealer = d; s.hole = true; s.active = 0; s.insurance = 0; s.last = s.bet; s.bet = 0;
  if (d[0].r === 1) s.phase = 'insurance';
  else afterInsurance(s);
  return s;
}

// Insurance taken (amount, up to half the bet) or not (0), then the dealer peeks. A blackjack either side settles the
// round there and then, so a round is never 'done' without its outcome.
export function insure(s, amount = 0) {
  if (s.phase !== 'insurance') return s;
  s.insurance = Math.max(0, Math.min(Math.floor(amount), Math.floor(s.hands[0].bet / 2)));
  afterInsurance(s);
  return s;
}

function afterInsurance(s) {
  const up = s.dealer[0];
  const peeks = up.r === 1 || value(up) === 10;
  if ((peeks && isBJ(s.dealer)) || isBJ(s.hands[0].cards)) { s.hands[0].done = true; settle(s); return; }
  s.phase = 'play';
}

export const hand = s => s.hands[s.active];

export function can(s) {
  const h = hand(s);
  const no = { hit: false, stand: false, double: false, split: false, surrender: false };
  if (s.phase !== 'play' || !h || h.done) return no;
  const two = h.cards.length === 2;
  return {
    hit: true,
    stand: true,
    double: two,
    split: two && value(h.cards[0]) === value(h.cards[1]) && s.hands.length < MAX_HANDS && !h.aces,
    surrender: two && s.hands.length === 1 && !h.split,
  };
}

export function hit(s, rng = rand) {
  if (!can(s).hit) return s;
  const h = hand(s);
  h.cards.push(draw(s, rng));
  if (total(h.cards).total >= 21) { h.done = true; next(s, rng); }
  return s;
}

export function stand(s, rng = rand) {
  if (!can(s).stand) return s;
  hand(s).done = true;
  next(s, rng);
  return s;
}

// The caller takes another bet's worth of chips first.
export function double(s, rng = rand) {
  if (!can(s).double) return s;
  const h = hand(s);
  h.bet *= 2; h.doubled = true;
  h.cards.push(draw(s, rng));
  h.done = true;
  next(s, rng);
  return s;
}

// The caller takes another bet's worth of chips first. The first hand gets its second card now; the new one when
// its turn comes.
export function split(s, rng = rand) {
  if (!can(s).split) return s;
  const h = hand(s);
  const aces = h.cards[0].r === 1;
  const other = { id: Math.max(...s.hands.map(x => x.id || 0)) + 1, cards: [h.cards.pop()], bet: h.bet, doubled: false, split: true, aces, done: false, surrendered: false };
  h.split = true; h.aces = aces;
  s.hands.splice(s.active + 1, 0, other);
  h.cards.push(draw(s, rng));
  if (aces || total(h.cards).total === 21) { h.done = true; next(s, rng); }
  return s;
}

export function surrender(s, rng = rand) {
  if (!can(s).surrender) return s;
  const h = hand(s);
  h.surrendered = true; h.done = true;
  next(s, rng);
  return s;
}

// On to the next hand that still needs playing (dealing the second card to a split hand), or to the dealer.
function next(s, rng) {
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active < s.hands.length) {
    const h = s.hands[s.active];
    if (h.cards.length === 1) {
      h.cards.push(draw(s, rng));
      if (h.aces || total(h.cards).total === 21) { h.done = true; return next(s, rng); }
    }
    return;
  }
  s.active = s.hands.length - 1;
  s.phase = 'dealer';
  s.hole = false;
}

// Does the dealer still have to play? Not when every hand has busted or surrendered.
export const dealerPlays = s => s.hands.some(h => !h.surrendered && total(h.cards).total <= 21);
export const dealerHits = s => dealerPlays(s) && total(s.dealer).total < 17;

// One card to the dealer, when the dealer has to take one. Returns true if a card was drawn.
export function dealerStep(s, rng = rand) {
  if (s.phase !== 'dealer' || !dealerHits(s)) return false;
  s.dealer.push(draw(s, rng));
  return true;
}

// Every hand's result and what it pays back (bet included), and the insurance. Moves the state to 'done', not yet paid
// (paid: false until the chips reach the rack).
export function settle(s) {
  s.phase = 'done';
  s.paid = false;
  s.hole = false;
  const d = total(s.dealer).total, dBJ = isBJ(s.dealer), dBust = d > 21;
  const natural = s.hands.length === 1 && isBJ(s.hands[0].cards);
  let back = 0;
  for (const h of s.hands) {
    const p = total(h.cards).total;
    let r, pay;
    if (h.surrendered) { r = 'surrender'; pay = Math.floor(h.bet / 2); }
    else if (p > 21) { r = 'bust'; pay = 0; }
    else if (natural && !dBJ) { r = 'blackjack'; pay = h.bet + Math.floor(h.bet * 3 / 2); }
    else if (dBJ) { r = natural ? 'push' : 'lose'; pay = natural ? h.bet : 0; }
    else if (dBust || p > d) { r = 'win'; pay = h.bet * 2; }
    else if (p === d) { r = 'push'; pay = h.bet; }
    else { r = 'lose'; pay = 0; }
    h.result = r; h.pay = pay; back += pay;
  }
  const ins = s.insurance ? (dBJ ? s.insurance * 3 : 0) : 0;
  back += ins;
  const wagered = s.hands.reduce((a, h) => a + h.bet, 0) + s.insurance;
  s.outcome = { back, wagered, insurance: ins, dealerBJ: dBJ, natural };
  return s.outcome;
}

// Clears the table for the next bet (the cards go to the discard tray).
export function clear(s) {
  s.phase = 'bet'; s.hands = []; s.dealer = []; s.active = 0; s.insurance = 0; s.hole = true; s.outcome = null;
  return s;
}

// ---------- the book: basic strategy for this game (six decks, S17, double after split, late surrender) ----------

// hard totals 5–17 against dealer 2..A (index 0..9)
const HARD = {
  8: 'HHHHHHHHHH', 9: 'HDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDH', 12: 'HHSSSHHHHH',
  13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHRH', 16: 'SSSSSHHRRR', 17: 'SSSSSSSSSS',
};
// soft totals (A + x), x = 2..9
const SOFT = {
  2: 'HHHDDHHHHH', 3: 'HHHDDHHHHH', 4: 'HHDDDHHHHH', 5: 'HHDDDHHHHH', 6: 'HDDDDHHHHH',
  7: 'SXXXXSSHHH', 8: 'SSSSSSSSSS', 9: 'SSSSSSSSSS',
};
// pairs, by card value (1 = aces): P = split
const PAIR = {
  1: 'PPPPPPPPPP', 2: 'PPPPPPHHHH', 3: 'PPPPPPHHHH', 4: 'HHHPPHHHHH', 6: 'PPPPPHHHHH',
  7: 'PPPPPPHHHH', 8: 'PPPPPPPPPP', 9: 'PPPPPSPPSS', 10: 'SSSSSSSSSS',
};
const WORD = { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' };

// What the book says for the hand in play: { act, why }.
export function book(s) {
  const ok = can(s);
  const h = hand(s);
  if (!ok.hit) return null;
  const up = value(s.dealer[0]);
  const col = up === 1 ? 9 : up - 2;
  const upName = up === 1 ? 'an ace' : up === 8 ? 'an 8' : `a ${up}`;
  const { total: t, soft } = total(h.cards);
  let code, what;
  const v = value(h.cards[0]);
  if (ok.split && v !== 5) { code = PAIR[v][col]; what = `a pair of ${v === 1 ? 'aces' : v === 10 ? 'tens' : `${v}s`}`; }
  else if (soft && t >= 13 && t <= 20) { code = SOFT[t - 11][col]; what = `soft ${t}`; }
  else { code = HARD[Math.max(8, Math.min(17, t))][col]; what = `${soft ? 'soft' : 'hard'} ${t}`; }
  if (code === 'X') code = ok.double ? 'D' : 'S';
  if (code === 'D' && !ok.double) code = soft && t === 18 ? 'S' : 'H';
  if (code === 'R' && !ok.surrender) code = 'H';
  if (code === 'P' && !ok.split) code = 'H';
  if (t >= 21) code = 'S';
  const act = WORD[code] || 'hit';
  return { act, why: `With ${what} against ${upName}, the book says ${act}.` };
}

// Jacks or Better, with nothing on screen: the hand ranks, the full-pay (9/6) table, a fresh 52-card deck every
// hand, and the hold the strategy card recommends.

import { deck, shuffle, rand } from '../../shared/cards.js';

// Pays per coin, for one to five coins. Only the royal flush jumps at five coins: 4,000 instead of 1,250.
export const PAYTABLE = [
  { id: 'royal', name: 'Royal Flush', pays: [250, 500, 750, 1000, 4000] },
  { id: 'straight-flush', name: 'Straight Flush', per: 50 },
  { id: 'four', name: 'Four of a Kind', per: 25 },
  { id: 'full-house', name: 'Full House', per: 9 },
  { id: 'flush', name: 'Flush', per: 6 },
  { id: 'straight', name: 'Straight', per: 4 },
  { id: 'three', name: 'Three of a Kind', per: 3 },
  { id: 'two-pair', name: 'Two Pair', per: 2 },
  { id: 'jacks', name: 'Jacks or Better', per: 1 },
].map(x => ({ ...x, pays: x.pays || [1, 2, 3, 4, 5].map(n => n * x.per) }));

export const payFor = (id, coins) => PAYTABLE.find(x => x.id === id)?.pays[coins - 1] || 0;

const high = r => (r === 1 ? 14 : r);

// The best hand in five cards: { id, name } or null for nothing that pays.
export function evaluate(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || high(b[0]) - high(a[0]));
  const flush = cards.every(c => c.s === cards[0].s);
  const ranks = cards.map(c => high(c.r)).sort((a, b) => a - b);
  const distinct = counts.size === 5;
  const wheel = distinct && ranks.join() === '2,3,4,5,14';
  const straight = distinct && (ranks[4] - ranks[0] === 4 || wheel);
  let id = null;
  if (straight && flush) id = ranks[0] === 10 ? 'royal' : 'straight-flush';
  else if (groups[0][1] === 4) id = 'four';
  else if (groups[0][1] === 3 && groups[1][1] === 2) id = 'full-house';
  else if (flush) id = 'flush';
  else if (straight) id = 'straight';
  else if (groups[0][1] === 3) id = 'three';
  else if (groups[0][1] === 2 && groups[1][1] === 2) id = 'two-pair';
  else if (groups[0][1] === 2 && high(groups[0][0]) >= 11) id = 'jacks';
  return id ? { id, name: PAYTABLE.find(x => x.id === id).name } : null;
}

// Which of the five cards make the hand (for lighting them up): indexes.
export function makers(cards, id) {
  if (!id) return [];
  if (['royal', 'straight-flush', 'flush', 'straight', 'full-house'].includes(id)) return [0, 1, 2, 3, 4];
  const counts = new Map();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) || 0) + 1);
  return cards.map((c, i) => (counts.get(c.r) >= 2 ? i : -1)).filter(i => i >= 0);
}

export function fresh() {
  return { phase: 'bet', coins: 5, coin: 1, deck: [], hand: [], held: [false, false, false, false, false], result: null, felt: 0 };
}

// A new hand: a shuffled deck, five cards off the top. The draw comes from the same deck, so it's settled now.
export function deal(s, rng = rand) {
  s.deck = shuffle(deck(), rng);
  s.hand = s.deck.splice(0, 5);
  s.held = [false, false, false, false, false];
  s.result = null;
  s.phase = 'draw';
  return s;
}

export function draw(s) {
  if (s.phase !== 'draw') return s;
  s.hand = s.hand.map((c, i) => (s.held[i] ? c : s.deck.shift()));
  const best = evaluate(s.hand);
  s.result = best ? { ...best, pay: payFor(best.id, s.coins) * s.coin } : null;
  s.phase = 'done';
  return s;
}

// ---------- the strategy card: what to hold (for nine-six Jacks or Better) ----------

const suits = (cards, idx) => new Set(idx.map(i => cards[i].s));
function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < n; i++) { acc.push(i); yield* combos(n, k, i + 1, acc); acc.pop(); }
}
const isHigh = c => c.r === 1 || c.r >= 11;
// Do these cards fit inside one straight (five ranks in a row, ace high or low)?
function inStraight(cards, idx) {
  const rs = idx.map(i => cards[i].r);
  if (new Set(rs).size !== rs.length) return false;
  const hi = rs.map(high), lo = rs.map(r => (r === 1 ? 1 : r));
  return Math.max(...hi) - Math.min(...hi) <= 4 || Math.max(...lo) - Math.min(...lo) <= 4;
}
function find(cards, k, test) {
  let best = null;
  for (const idx of combos(5, k)) if (test(idx) && (!best || score(cards, idx) > score(cards, best))) best = idx;
  return best;
}
const score = (cards, idx) => idx.reduce((a, i) => a + high(cards[i].r), 0);
const suited = (cards, idx) => suits(cards, idx).size === 1;
const royalRanks = c => c.r === 1 || c.r >= 10;

// The hold as five booleans, and the line on the strategy card it comes from.
export function advise(cards) {
  const hold = idx => ({ held: [0, 1, 2, 3, 4].map(i => idx.includes(i)), why: '' });
  const out = (idx, why) => ({ ...hold(idx), why });
  const made = evaluate(cards);
  const all = [0, 1, 2, 3, 4];
  if (made && ['royal', 'straight-flush', 'four'].includes(made.id)) return out(made.id === 'four' ? makers(cards, 'four') : all, `Keep the ${made.name.toLowerCase()}.`);
  let x = find(cards, 4, idx => suited(cards, idx) && idx.every(i => royalRanks(cards[i])));
  if (x) return out(x, 'Four to a royal flush beats anything but a made royal, straight flush or four of a kind.');
  if (made && ['full-house', 'flush', 'straight'].includes(made.id)) return out(all, `Keep the ${made.name.toLowerCase()}.`);
  if (made?.id === 'three') return out(makers(cards, 'three'), 'Keep the three of a kind and draw two.');
  x = find(cards, 4, idx => suited(cards, idx) && inStraight(cards, idx));
  if (x) return out(x, 'Four to a straight flush.');
  if (made?.id === 'two-pair') return out(makers(cards, 'two-pair'), 'Keep both pairs and draw one.');
  if (made?.id === 'jacks') return out(makers(cards, 'jacks'), 'Keep the high pair.');
  x = find(cards, 3, idx => suited(cards, idx) && idx.every(i => royalRanks(cards[i])));
  if (x) return out(x, 'Three to a royal flush.');
  x = find(cards, 4, idx => suited(cards, idx));
  if (x) return out(x, 'Four to a flush.');
  const counts = new Map();
  cards.forEach(c => counts.set(c.r, (counts.get(c.r) || 0) + 1));
  const low = cards.map((c, i) => (counts.get(c.r) === 2 ? i : -1)).filter(i => i >= 0);
  if (low.length === 2) return out(low, 'Keep the low pair: it beats any straight draw.');
  x = find(cards, 4, idx => {
    const rs = idx.map(i => high(cards[i].r)).sort((a, b) => a - b);
    return new Set(rs).size === 4 && rs[3] - rs[0] === 3 && rs[0] >= 2 && rs[3] <= 13;
  });
  if (x) return out(x, 'Four to an open-ended straight.');
  x = find(cards, 2, idx => suited(cards, idx) && idx.every(i => isHigh(cards[i])));
  if (x) return out(x, 'Two suited high cards.');
  x = find(cards, 3, idx => suited(cards, idx) && inStraight(cards, idx));
  if (x) return out(x, 'Three to a straight flush.');
  const highs = all.filter(i => isHigh(cards[i])).sort((a, b) => high(cards[a].r) - high(cards[b].r));
  if (highs.length >= 2) return out(highs.slice(0, 2), highs.length > 2 ? 'The two lowest high cards.' : 'Two high cards.');
  x = find(cards, 2, idx => suited(cards, idx) && idx.some(i => cards[i].r === 10) && idx.some(i => cards[i].r >= 11 && cards[i].r <= 13));
  if (x) return out(x, 'A ten with a suited jack, queen or king.');
  if (highs.length === 1) return out(highs, 'One high card.');
  return out([], 'Nothing worth keeping: draw five new cards.');
}

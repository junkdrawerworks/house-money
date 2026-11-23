// Video poker with nothing on screen: three games on one machine (Jacks or Better 9/6, Bonus Poker 8/5 and Deuces
// Wild on the Not So Ugly Ducks pay table), their hand ranks and pay tables, a fresh 52-card deck every hand, and the
// hold each game's strategy card recommends.

import { deck, shuffle, rand } from '../../shared/cards.js';

// Pays per coin, for one to five coins. Only the royal flush jumps at five coins: 4,000 instead of 1,250.
// count: the Records counter a hand adds to (its own id unless it says otherwise; null for none).
const table = rows => rows.map(x => ({ ...x, pays: x.pays || [1, 2, 3, 4, 5].map(n => n * x.per) }));
const ROYAL = [250, 500, 750, 1000, 4000];

const high = r => (r === 1 ? 14 : r);
const isHigh = c => c.r === 1 || c.r >= 11;
const royalRanks = c => c.r === 1 || c.r >= 10;
const countRanks = cards => { const m = new Map(); for (const c of cards) m.set(c.r, (m.get(c.r) || 0) + 1); return m; };
// Do these cards fit inside one straight (five ranks in a row, ace high or low)?
function fits(cs) {
  const rs = cs.map(c => c.r);
  if (new Set(rs).size !== rs.length) return false;
  if (!rs.length) return true;
  const hi = rs.map(high);
  return Math.max(...hi) - Math.min(...hi) <= 4 || Math.max(...rs) - Math.min(...rs) <= 4;
}
const oneSuit = cs => new Set(cs.map(c => c.s)).size <= 1;

// The natural hand ranks, without wild cards: one of royal, straight-flush, four, full-house, flush, straight, three,
// two-pair, jacks (a pair of jacks or better), or null.
function natural(cards) {
  const counts = countRanks(cards);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = oneSuit(cards);
  const straight = counts.size === 5 && fits(cards);
  const ranks = cards.map(c => high(c.r));
  if (straight && flush) return Math.min(...ranks) === 10 ? 'royal' : 'straight-flush';
  if (groups[0] === 4) return 'four';
  if (groups[0] === 3 && groups[1] === 2) return 'full-house';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'three';
  if (groups[0] === 2 && groups[1] === 2) return 'two-pair';
  if (groups[0] === 2 && [...counts].some(([r, n]) => n === 2 && high(r) >= 11)) return 'jacks';
  return null;
}

// Deuces Wild: every 2 stands for any card. Natural royal (no deuces), four deuces, wild royal, five of a kind,
// straight flush, four of a kind, full house, flush, straight, three of a kind; two pair and a pair pay nothing.
function deucesHand(cards) {
  const w = cards.filter(c => c.r === 2).length;
  const rest = cards.filter(c => c.r !== 2);
  if (w === 4) return 'four-deuces';
  if (w === 0) { const n = natural(cards); return ['royal', 'straight-flush', 'four', 'full-house', 'flush', 'straight', 'three'].includes(n) ? n : null; }
  const counts = countRanks(rest);
  const most = Math.max(...counts.values());
  const flush = oneSuit(rest), straight = counts.size === rest.length && fits(rest);
  if (flush && straight && rest.every(royalRanks)) return 'wild-royal';
  if (most + w === 5) return 'five';
  if (flush && straight) return 'straight-flush';
  if (most + w === 4) return 'four';
  if (w === 1 && counts.size === 2) return 'full-house';     // two pair and a deuce
  if (flush) return 'flush';
  if (straight) return 'straight';
  return most + w >= 3 ? 'three' : null;                     // a deuce makes a pair three, two deuces any card
}

// Which of the five cards make the hand (for lighting them up): indexes.
function lights(cards, id) {
  if (!id) return [];
  if (['royal', 'straight-flush', 'flush', 'straight', 'full-house', 'wild-royal', 'five'].includes(id)) return [0, 1, 2, 3, 4];
  if (id === 'four-deuces') return cards.map((c, i) => (c.r === 2 ? i : -1)).filter(i => i >= 0);
  const wild = c => c.wild && c.r === 2;
  const counts = countRanks(cards.filter(c => !wild(c)));
  const top = Math.max(...counts.values());
  // with deuces wild, the deuces and the biggest set of one rank make four or three of a kind
  if (cards.some(wild)) {
    const r = [...counts].find(([, n]) => n === top)[0];
    return cards.map((c, i) => (wild(c) || c.r === r ? i : -1)).filter(i => i >= 0);
  }
  return cards.map((c, i) => (counts.get(c.r) >= 2 ? i : -1)).filter(i => i >= 0);
}

// ---------- the strategy cards ----------

function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < n; i++) { acc.push(i); yield* combos(n, k, i + 1, acc); acc.pop(); }
}
const score = (cards, idx) => idx.reduce((a, i) => a + high(cards[i].r), 0);
// the best-scoring k of the five cards that pass test, or null
function find(cards, k, test, by = score) {
  let best = null;
  for (const idx of combos(cards.length, k)) if (test(idx) && (!best || by(cards, idx) > by(cards, best))) best = idx;
  return best;
}
// gaps inside a straight draw, an ace counting low only with low cards: 9-J-Q has one, 5-6 none
function gapsIn(cards, idx) {
  const hi = idx.map(i => high(cards[i].r)), lo = idx.map(i => cards[i].r);
  return Math.min(Math.max(...hi) - Math.min(...hi), Math.max(...lo) - Math.min(...lo)) - idx.length + 1;
}
// for straight draws: fewer gaps first, then the higher cards (an ace counts low when it's with low cards)
function tight(cards, idx) {
  const hi = idx.map(i => high(cards[i].r)), lo = idx.map(i => cards[i].r);
  const span = Math.min(Math.max(...hi) - Math.min(...hi), Math.max(...lo) - Math.min(...lo));
  const low = Math.max(...hi) - Math.min(...hi) <= 4 ? Math.min(...hi) : 1;
  return -100 * (span - idx.length + 1) + low;
}
const pick = (cards, idx) => idx.map(i => cards[i]);
const answer = (idx, why) => ({ held: [0, 1, 2, 3, 4].map(i => idx.includes(i)), why });
const ALL = [0, 1, 2, 3, 4];

// Jacks or Better and Bonus Poker play the same card, Wizard of Odds' simple strategy for 9/6 Jacks or Better; four of
// a kind is 'four' whatever it pays.
function jacksCard(cards, made) {
  const out = answer;
  const suited = idx => oneSuit(pick(cards, idx));
  const highs = idx => idx.filter(i => isHigh(cards[i])).length;
  const has = (idx, ranks) => ranks.every(r => idx.some(i => cards[i].r === r));
  const gaps = idx => gapsIn(cards, idx);
  const aceLow = idx => idx.some(i => cards[i].r === 1) && idx.every(i => cards[i].r <= 5 || cards[i].r === 1);
  const sf3 = idx => suited(idx) && fits(pick(cards, idx));
  // three to a straight flush, by how good: 1 when its high cards at least match its gaps (not ace-low or 2-3-4),
  // 3 for two gaps and no high card, 2 for the rest
  const sfType = idx => {
    if (aceLow(idx) || has(idx, [2, 3, 4])) return 2;
    if (highs(idx) >= gaps(idx)) return 1;
    return gaps(idx) === 2 && highs(idx) === 0 ? 3 : 2;
  };
  const straight4 = idx => fits(pick(cards, idx));
  const outside = idx => { const rs = idx.map(i => high(cards[i].r)).sort((a, b) => a - b); return rs[3] - rs[0] === 3 && rs[0] >= 2 && rs[3] <= 13; };
  if (made?.startsWith('four')) made = 'four';
  const names = { royal: 'royal flush', 'straight-flush': 'straight flush', four: 'four of a kind', 'full-house': 'full house', flush: 'flush', straight: 'straight' };
  if (['royal', 'straight-flush', 'four'].includes(made)) return out(made === 'four' ? lights(cards, 'four') : ALL, `Keep the ${names[made]}.`);
  let x = find(cards, 4, idx => suited(idx) && idx.every(i => royalRanks(cards[i])));
  if (x) return out(x, 'Four to a royal flush beats anything but a made royal, straight flush or four of a kind.');
  if (['full-house', 'flush'].includes(made)) return out(ALL, `Keep the ${names[made]}.`);
  if (made === 'three') return out(lights(cards, 'three'), 'Keep the three of a kind and draw two.');
  if (made === 'straight') return out(ALL, 'Keep the straight.');
  x = find(cards, 4, idx => suited(idx) && fits(pick(cards, idx)));
  if (x) return out(x, 'Four to a straight flush.');
  if (made === 'two-pair') return out(lights(cards, 'two-pair'), 'Keep both pairs and draw one.');
  if (made === 'jacks') return out(lights(cards, 'jacks'), 'Keep the high pair.');
  x = find(cards, 3, idx => suited(idx) && idx.every(i => royalRanks(cards[i])));
  if (x) return out(x, 'Three to a royal flush.');
  x = find(cards, 4, idx => suited(idx));
  if (x) return out(x, 'Four to a flush.');
  x = find(cards, 4, idx => straight4(idx) && idx.every(i => cards[i].r >= 10 && cards[i].r <= 13));
  if (x) return out(x, 'Ten, jack, queen and king: four to a straight that can fill at both ends.');
  const counts = countRanks(cards);
  const low = cards.map((c, i) => (counts.get(c.r) === 2 ? i : -1)).filter(i => i >= 0);
  if (low.length === 2) return out(low, 'Keep the low pair: it beats any straight draw.');
  x = find(cards, 4, idx => straight4(idx) && outside(idx));
  if (x) return out(x, 'Four to an open-ended straight.');
  x = find(cards, 3, idx => sf3(idx) && sfType(idx) === 1);
  if (x) return out(x, 'Three to a straight flush, with as many high cards as gaps.');
  const pair = (test, why) => { const y = find(cards, 2, idx => idx.every(i => isHigh(cards[i])) && test(idx)); return y && out(y, why); };
  let p = pair(idx => suited(idx) && has(idx, [11, 12]), 'Jack and queen of one suit.');
  if (p) return p;
  x = find(cards, 4, idx => straight4(idx) && highs(idx) === 4);
  if (x) return out(x, 'Four to an inside straight, all high cards.');
  p = pair(idx => suited(idx) && idx.some(i => cards[i].r === 13) && !idx.some(i => cards[i].r === 1), 'King with a jack or queen of its suit.');
  if (p) return p;
  p = pair(idx => suited(idx), 'An ace with a high card of its suit.');
  if (p) return p;
  x = find(cards, 4, idx => straight4(idx) && highs(idx) === 3);
  if (x) return out(x, 'Four to an inside straight with three high cards.');
  x = find(cards, 3, idx => sf3(idx) && sfType(idx) === 2);
  if (x) return out(x, 'Three to a straight flush.');
  const hs = ALL.filter(i => isHigh(cards[i])).sort((a, b) => high(cards[a].r) - high(cards[b].r));
  const jqk = hs.filter(i => cards[i].r >= 11 && cards[i].r <= 13);
  if (jqk.length === 3) return out(jqk, 'Jack, queen and king.');
  if (hs.length >= 2 && has(hs, [11, 12])) return out(hs.filter(i => cards[i].r === 11 || cards[i].r === 12), 'Jack and queen.');
  x = find(cards, 2, idx => suited(idx) && has(idx, [10, 11]));
  if (x) return out(x, 'Ten and jack of one suit.');
  if (hs.length >= 2) return out(hs.slice(0, 2), hs.length > 2 ? 'The two lowest high cards.' : 'Two high cards.');
  x = find(cards, 2, idx => suited(idx) && has(idx, [10, 12]));
  if (x) return out(x, 'Ten and queen of one suit.');
  if (hs.length === 1 && cards[hs[0]].r !== 1) return out(hs, 'One high card.');
  x = find(cards, 2, idx => suited(idx) && has(idx, [10, 13]));
  if (x) return out(x, 'Ten and king of one suit.');
  if (hs.length === 1) return out(hs, 'One high card.');
  x = find(cards, 3, idx => sf3(idx) && sfType(idx) === 3);
  if (x) return out(x, 'Three to a straight flush, two gaps.');
  return out([], 'Nothing worth keeping: draw five new cards.');
}

function deucesCard(cards, made) {
  const out = answer;
  const d = ALL.filter(i => cards[i].r === 2);
  const w = d.length;
  const suited = idx => oneSuit(pick(cards, idx));
  // k of the cards that aren't deuces, held with every deuce, passing test
  const withDeuces = (k, test) => {
    const x = find(cards, k, idx => idx.every(i => cards[i].r !== 2) && test(idx), tight);
    return x && [...d, ...x];
  };
  const royalDraw = idx => suited(idx) && fits(pick(cards, idx)) && idx.every(i => royalRanks(cards[i]));
  const sfDraw = idx => suited(idx) && fits(pick(cards, idx));
  const gaps = idx => gapsIn(cards, idx);
  const hasAce = idx => idx.some(i => cards[i].r === 1);
  // the lowest card, an ace counting low when it's with low cards
  const lowest = idx => { const hi = idx.map(i => high(cards[i].r)); return Math.max(...hi) - Math.min(...hi) <= 4 ? Math.min(...hi) : 1; };
  // two suited cards close enough to build on: in a row from 4-5 up, or one gap from 5-7 up
  const good = idx => sfDraw(idx) && (gaps(idx) === 0 ? lowest(idx) >= 4 : gaps(idx) === 1 && lowest(idx) >= 5);
  // a straight draw with no gap, open at both ends (lowest card 4 or higher, highest a king or lower)
  const open = idx => { const rs = idx.map(i => high(cards[i].r)).sort((a, b) => a - b); return rs.at(-1) - rs[0] === idx.length - 1 && rs[0] >= 4 && rs.at(-1) <= 13; };
  const set = () => lights(cards.map(c => ({ ...c, wild: true })), made);
  if (w === 4) return out(ALL, 'Keep the four deuces.');
  if (made === 'royal') return out(ALL, 'Keep the natural royal flush.');
  if (['wild-royal', 'five'].includes(made)) return out(ALL, `Keep the ${made === 'five' ? 'five of a kind' : 'wild royal flush'}.`);
  if (w === 3) return out(d, 'Keep the three deuces and draw two.');
  let x = w === 0 && find(cards, 4, royalDraw);
  if (x) return out(x, 'Four to a royal flush: worth more than a straight flush.');
  if (made === 'straight-flush') return out(ALL, 'Keep the straight flush.');
  if (made === 'four') return out(set(), 'Keep the four of a kind and draw one.');
  x = withDeuces(4 - w, royalDraw);
  if (x) return out(x, 'Four to a royal flush, deuces and all.');
  if (w === 2) {
    x = withDeuces(2, good);
    if (x) return out(x, 'Four to a straight flush: the deuces and two suited cards, in a row from 4-5 up or one apart from 5-7 up.');
    return out(d, 'Keep the two deuces and draw three.');
  }
  if (w === 1) {
    if (['full-house', 'flush'].includes(made)) return out(ALL, `Keep the ${made.replace('-', ' ')}.`);
    x = withDeuces(3, idx => sfDraw(idx) && (gaps(idx) === 0 || (gaps(idx) === 1 && lowest(idx) >= 4)));
    if (x) return out(x, 'Four to a straight flush with no more than one card missing in the middle.');
    if (made === 'three') return out(set(), 'Keep the three of a kind.');
    if (made === 'straight') return out(ALL, 'Keep the straight.');
    x = withDeuces(3, sfDraw);
    if (x) return out(x, 'Four to a straight flush.');
    x = withDeuces(2, idx => royalDraw(idx) && !idx.some(i => cards[i].r === 1));
    if (x) return out(x, 'Three to a royal flush.');
    x = withDeuces(2, good);
    if (x) return out(x, 'Three to a straight flush: the deuce and two suited cards, in a row from 4-5 up or one apart from 5-7 up.');
    x = withDeuces(2, royalDraw);
    if (x) return out(x, 'Three to a royal flush.');
    return out(d, 'Keep the deuce and draw four.');
  }
  // no deuces
  if (made === 'four' || made === 'three') return out(lights(cards, made), `Keep the ${made === 'four' ? 'four' : 'three'} of a kind.`);
  if (['full-house', 'flush', 'straight'].includes(made)) return out(ALL, `Keep the ${made.replace('-', ' ')}.`);
  x = find(cards, 4, sfDraw, tight);
  if (x) return out(x, 'Four to a straight flush.');
  x = find(cards, 3, royalDraw);
  if (x) return out(x, 'Three to a royal flush.');
  // two pair pays nothing here, but both pairs are kept for the full house
  const counts = countRanks(cards);
  const pairs = ALL.filter(i => counts.get(cards[i].r) === 2);
  if (pairs.length === 4) return out(pairs, 'Keep both pairs: a full house is one card away.');
  const flush4 = find(cards, 4, suited);
  if (flush4) return out(flush4, 'Four to a flush: worth more than a pair here.');
  x = find(cards, 3, idx => sfDraw(idx) && gaps(idx) === 0 && lowest(idx) >= 5, tight);
  if (x) return out(x, 'Three in a row to a straight flush, five or higher: worth more than a pair.');
  if (pairs.length) return out(pairs, 'Keep the pair.');
  x = find(cards, 3, idx => sfDraw(idx) && gaps(idx) <= 1 && lowest(idx) >= 3, tight);
  if (x) return out(x, 'Three to a straight flush.');
  x = find(cards, 4, idx => open(idx));
  if (x) return out(x, 'Four to an open-ended straight.');
  x = find(cards, 3, idx => sfDraw(idx) && !hasAce(idx), tight);
  if (x) return out(x, 'Three to a straight flush.');
  x = find(cards, 2, idx => royalDraw(idx) && idx.every(i => cards[i].r !== 1));
  if (x) return out(x, 'Two to a royal flush, no ace.');
  x = find(cards, 4, idx => fits(pick(cards, idx)) && lowest(idx) >= 5);
  if (x) return out(x, 'Four to a straight with a gap, five or higher.');
  x = find(cards, 3, sfDraw, tight);
  if (x) return out(x, 'Three to a straight flush.');
  return out([], 'Nothing worth keeping: draw five new cards.');
}

export const GAMES = [
  // back: what it pays back played perfectly, hand by hand (Wizard of Odds' figure for the pay table); card: played
  // the strategy card's way. Both are worked out exactly in test/video-poker.unit.test.mjs.
  { id: 'jacks', name: 'Jacks or Better', blurb: 'Full pay: 9 for a full house, 6 for a flush.', back: 0.995439, card: 0.995393,
    paytable: table([
      { id: 'royal', name: 'Royal Flush', pays: ROYAL },
      { id: 'straight-flush', name: 'Straight Flush', per: 50 },
      { id: 'four', name: 'Four of a Kind', per: 25 },
      { id: 'full-house', name: 'Full House', per: 9 },
      { id: 'flush', name: 'Flush', per: 6 },
      { id: 'straight', name: 'Straight', per: 4 },
      { id: 'three', name: 'Three of a Kind', per: 3 },
      { id: 'two-pair', name: 'Two Pair', per: 2 },
      { id: 'jacks', name: 'Jacks or Better', per: 1 },
    ]),
    hand: natural, strategy: jacksCard },
  { id: 'bonus', name: 'Bonus Poker', blurb: 'Four aces pay 80, four 2s, 3s or 4s pay 40.', back: 0.991660, card: 0.991628,
    paytable: table([
      { id: 'royal', name: 'Royal Flush', pays: ROYAL },
      { id: 'four-aces', name: 'Four Aces', per: 80, count: 'four' },
      { id: 'straight-flush', name: 'Straight Flush', per: 50 },
      { id: 'four-low', name: 'Four 2s, 3s or 4s', per: 40, count: 'four' },
      { id: 'four', name: 'Four 5s to Kings', per: 25 },
      { id: 'full-house', name: 'Full House', per: 8 },
      { id: 'flush', name: 'Flush', per: 5 },
      { id: 'straight', name: 'Straight', per: 4 },
      { id: 'three', name: 'Three of a Kind', per: 3 },
      { id: 'two-pair', name: 'Two Pair', per: 2 },
      { id: 'jacks', name: 'Jacks or Better', per: 1 },
    ]),
    hand: cards => {
      const n = natural(cards);
      if (n !== 'four') return n;
      const r = [...countRanks(cards)].find(([, k]) => k === 4)[0];
      return r === 1 ? 'four-aces' : r <= 4 ? 'four-low' : 'four';
    },
    strategy: jacksCard },
  { id: 'deuces', name: 'Deuces Wild', blurb: 'Every 2 is wild. Three of a kind is the lowest win.', back: 0.997283, card: 0.996880,
    paytable: table([
      { id: 'royal', name: 'Natural Royal Flush', pays: ROYAL },
      { id: 'four-deuces', name: 'Four Deuces', per: 200 },
      { id: 'wild-royal', name: 'Wild Royal Flush', per: 25 },
      { id: 'five', name: 'Five of a Kind', per: 16 },
      // wild cards make these everyday hands here: Records counts them at the other two games only
      { id: 'straight-flush', name: 'Straight Flush', per: 10, count: null },
      { id: 'four', name: 'Four of a Kind', per: 4, count: null },
      { id: 'full-house', name: 'Full House', per: 4, count: null },
      { id: 'flush', name: 'Flush', per: 3, count: null },
      { id: 'straight', name: 'Straight', per: 2, count: null },
      { id: 'three', name: 'Three of a Kind', per: 1, count: null },
    ]),
    hand: deucesHand, strategy: deucesCard, wild: true },
];

export const game = id => GAMES.find(g => g.id === id) || GAMES[0];
// Jacks or Better's pay table, the one the machine started with
export const PAYTABLE = GAMES[0].paytable;
const row = (id, g) => game(g).paytable.find(x => x.id === id);

export const payFor = (id, coins, g = 'jacks') => row(id, g)?.pays[coins - 1] || 0;

// The best hand in five cards: { id, name } or null for nothing that pays.
export function evaluate(cards, g = 'jacks') {
  const id = game(g).hand(cards);
  return id ? { id, name: row(id, g).name } : null;
}

// The Records counters a winning hand adds to: { four: 1 }, or {} for none.
export function counters(id, g = 'jacks') {
  const r = row(id, g);
  const k = !r ? null : 'count' in r ? r.count : r.id;
  return k ? { [k]: 1 } : {};
}

export const makers = (cards, id, g = 'jacks') => lights(game(g).wild ? cards.map(c => ({ ...c, wild: true })) : cards, id);

export function fresh() {
  return { phase: 'bet', game: 'jacks', coins: 5, coin: 1, deck: [], hand: [], held: [false, false, false, false, false], result: null, felt: 0 };
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
  const best = evaluate(s.hand, s.game);
  s.result = best ? { ...best, pay: payFor(best.id, s.coins, s.game) * s.coin } : null;
  s.phase = 'done';
  return s;
}

// The hold as five booleans, and the line on the game's strategy card it comes from.
export const advise = (cards, g = 'jacks') => game(g).strategy(cards, game(g).hand(cards));

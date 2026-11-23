// The exact return of a video poker game, over every one of the 2,598,960 hands a deck can deal: played perfectly
// (the best of the 32 ways to hold each hand), and played by the game's own strategy card. Used by
// test/video-poker.unit.test.mjs.
//
// How: every final five-card hand is scored once, and its pay added to each of its 32 subsets, so tot[S] is the pay
// summed over every final hand that contains the cards S. Holding S from a dealt hand H draws from the 47 cards not
// dealt, so the hands it can end in contain S and none of H's other cards: by inclusion and exclusion, the sum of
// (-1)^|T-S| tot[T] over S ⊆ T ⊆ H. Hands that differ only by suits are worked out once.
//
//   game: { evaluate(cards) -> { id } | null, pay(id) -> per coin with five coins bet, advise(cards) -> { held },
//           wild: true when deuces are wild (a hand is then a flush when the cards that aren't deuces share a suit) }

const C = [];
for (let n = 0; n <= 52; n++) { C[n] = []; for (let k = 0; k <= 5; k++) C[n][k] = k === 0 ? 1 : n === 0 ? 0 : C[n - 1][k - 1] + C[n - 1][k]; }
// where each size of subset starts in tot[]
const OFF = [0]; for (let k = 1; k <= 6; k++) OFF[k] = OFF[k - 1] + C[52][k - 1];
const SUIT = 'shdc';
const card = i => ({ r: (i >> 2) + 1, s: SUIT[i & 3] });
const PRIME = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

export function returns(game) {
  const tot = new Float64Array(OFF[6]);
  const memo = new Map();
  const h = [0, 0, 0, 0, 0];
  const rank = new Int32Array(32), size = new Int32Array(32);
  for (let m = 0; m < 32; m++) size[m] = (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1) + (m >> 4 & 1);
  // the index of each subset of h in tot[], for the 32 masks
  const ranks = () => {
    for (let m = 0; m < 32; m++) {
      let r = OFF[size[m]], j = 0;
      for (let b = 0; b < 5; b++) if (m >> b & 1) { r += C[h[b]][++j]; }
      rank[m] = r;
    }
  };
  const each = fn => {
    for (h[0] = 0; h[0] < 48; h[0]++) for (h[1] = h[0] + 1; h[1] < 49; h[1]++) for (h[2] = h[1] + 1; h[2] < 50; h[2]++)
      for (h[3] = h[2] + 1; h[3] < 51; h[3]++) for (h[4] = h[3] + 1; h[4] < 52; h[4]++) fn();
  };
  // 1. what every final hand pays, added to each of its subsets
  each(() => {
    let suit = -1, flush = true;
    for (let b = 0; b < 5; b++) {
      if (game.wild && h[b] >> 2 === 1) continue;
      if (suit < 0) suit = h[b] & 3; else if ((h[b] & 3) !== suit) { flush = false; break; }
    }
    const key = PRIME[h[0] >> 2] * PRIME[h[1] >> 2] * PRIME[h[2] >> 2] * PRIME[h[3] >> 2] * PRIME[h[4] >> 2] * (flush ? 2 : 1);
    let p = memo.get(key);
    if (p === undefined) { const e = game.evaluate(h.map(card)); p = e ? game.pay(e.id) : 0; memo.set(key, p); }
    if (!p) return;
    ranks();
    for (let m = 0; m < 32; m++) tot[rank[m]] += p;
  });
  // 2. every dealt hand: the value of each hold, the best, and the strategy card's
  const seen = new Map();
  const g = new Float64Array(32);
  const draws = [1, 2, 3, 4, 5, 6].map((_, k) => C[47][5 - k]);
  let best = 0, byCard = 0, misses = [];
  const masks = [0, 0, 0, 0];
  each(() => {
    masks[0] = masks[1] = masks[2] = masks[3] = 0;
    for (let b = 0; b < 5; b++) masks[h[b] & 3] |= 1 << (h[b] >> 2);
    const key = masks.slice().sort((a, b) => b - a).reduce((a, m) => a * 8192 + m, 0);
    const hit = seen.get(key);
    if (hit) { best += hit[0]; byCard += hit[1]; return; }
    ranks();
    for (let m = 0; m < 32; m++) g[m] = tot[rank[m]];
    for (let b = 0; b < 5; b++) for (let m = 0; m < 32; m++) if (!(m >> b & 1)) g[m] -= g[m | 1 << b];
    let top = -1, topM = 0;
    for (let m = 0; m < 32; m++) { g[m] /= draws[size[m]]; if (g[m] > top + 1e-12) { top = g[m]; topM = m; } }
    const cards = h.map(card);
    const held = game.advise(cards).held;
    let m = 0; held.forEach((x, b) => { if (x) m |= 1 << b; });
    const v = [top, g[m]];
    seen.set(key, v);
    if (top - g[m] > 1e-9) misses.push({ cards: cards.map(c => c.r + c.s).join(' '), best: topM, card: m, loss: top - g[m], key });
    best += top; byCard += g[m];
  });
  // how often each class comes up, for weighting the misses
  if (misses.length) {
    const count = new Map();
    each(() => {
      masks[0] = masks[1] = masks[2] = masks[3] = 0;
      for (let b = 0; b < 5; b++) masks[h[b] & 3] |= 1 << (h[b] >> 2);
      const key = masks.slice().sort((a, b) => b - a).reduce((a, m) => a * 8192 + m, 0);
      count.set(key, (count.get(key) || 0) + 1);
    });
    for (const x of misses) x.weight = x.loss * count.get(x.key) / C[52][5] / 5;
    misses.sort((a, b) => b.weight - a.weight);
  }
  // per coin of a five-coin bet
  return { best: best / C[52][5] / 5, card: byCard / C[52][5] / 5, misses };
}

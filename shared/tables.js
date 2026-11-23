// The tables on the floor, in the order they stand. The floor, the records and the tests all read this list.
// slot: one of the slot machines, which stand together in their own row.
// min and max: a table's limits on a Red card (a higher card multiplies max; see shared/cage.js).
// unit: what one round is called there, on the floor and in Records (see units()). Blackjack's is the round: a split
// round is several hands, and Records counts rounds (and rounds won).
// coins: a machine's coin sizes, where a bet is a number of coins. top(limit): the most one bet can come to there with
// the limit on your card, when that isn't the limit itself; coinsLine(limit) says how, in the menu (see topBet()).

// the biggest coin no more than `most`
const biggest = (coins, most) => coins.filter(v => v <= most).at(-1) || 0;
const VP_COINS = [1, 5, 25, 100, 500], CB_COINS = [1, 5, 10, 25, 50, 100, 250, 500];

export const TABLES = [
  { id: 'blackjack', name: 'Blackjack', min: 10, max: 500, unit: 'round',
    what: 'Six decks, dealer stands on all 17s, blackjack pays 3 to 2. Double, split, surrender, and ask the book when you’re stuck.' },
  { id: 'roulette', name: 'Roulette', min: 1, max: 500, unit: 'spin',
    what: 'A single-zero wheel. Spread chips on numbers, splits, corners, dozens or red and black, then watch the ball drop.' },
  { id: 'craps', name: 'Craps', min: 5, max: 500, unit: 'roll',
    what: 'The loudest table in the house. Pass line, come bets, odds behind them, place numbers, the field and the hardways.' },
  { id: 'baccarat', name: 'Baccarat', min: 10, max: 1000, unit: 'hand',
    what: 'Bet the Player, the Banker or a Tie, and squeeze the cards up one corner at a time. The scoreboard keeps the shoe.' },
  // up to five coins a hand, each up to the limit
  { id: 'video-poker', name: 'Video Poker', min: 1, max: 100, unit: 'hand', coins: VP_COINS,
    top: lim => 5 * biggest(VP_COINS, lim), coinsLine: lim => `five coins of up to ${biggest(VP_COINS, lim).toLocaleString('en-US')}`,
    what: 'Jacks or Better, Bonus Poker or Deuces Wild, picked on the marquee. Hold the cards you want, draw for the rest, and bet five coins for the royal.' },
  // up to three coins a spin, all three together within the limit
  { id: 'cherry-bell', name: 'Cherry Bell', min: 1, max: 100, slot: true, unit: 'spin', coins: CB_COINS,
    top: lim => 3 * biggest(CB_COINS, lim / 3),
    what: 'An old three-reel slot: cherries, lemons, bells, bars and sevens on one pay line. Pull the handle.' },
  { id: 'odds-and-ends', name: 'Odds & Ends', min: 1, max: 100, slot: true, unit: 'spin',
    what: 'A slot machine stocked from the junk drawer: keys, batteries, rubber bands and the odd lucky penny, on five lines.' },
  { id: 'motherlode', name: 'Motherlode', min: 20, max: 100, slot: true, unit: 'spin',
    what: 'Five reels and twenty lines down a gold mine. Three lanterns light up free spins, and the wild pickaxes stick.' },
];

export const byId = id => TABLES.find(t => t.id === id);

// The most one bet can come to at table t, with `limit` the most on your card (cage.maxBet(t.max)).
export const topBet = (t, limit) => (t?.top ? t.top(limit) : limit);

// n rounds at a table in its own word: "1 hand", "22 spins", "3 rolls". word: true leaves out the number ("hands").
export const units = (t, n, { word = false } = {}) => {
  const w = `${t.unit || 'round'}${n === 1 ? '' : 's'}`;
  return word ? w : `${n.toLocaleString('en-US')} ${w}`;
};

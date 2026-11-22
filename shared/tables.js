// The tables on the floor, in the order they stand. The floor, the records and the tests all read this list.
// slot: one of the slot machines, which stand together in their own row.
// min and max: a table's limits on a Red card (a higher card multiplies max; see shared/cage.js).

export const TABLES = [
  { id: 'blackjack', name: 'Blackjack', min: 10, max: 500,
    what: 'Six decks, dealer stands on all 17s, blackjack pays 3 to 2. Double, split, surrender, and ask the book when you’re stuck.' },
  { id: 'roulette', name: 'Roulette', min: 1, max: 500,
    what: 'A single-zero wheel. Spread chips on numbers, splits, corners, dozens or red and black, then watch the ball drop.' },
  { id: 'craps', name: 'Craps', min: 5, max: 500,
    what: 'The loudest table in the house. Pass line, come bets, odds behind them, place numbers, the field and the hardways.' },
  { id: 'baccarat', name: 'Baccarat', min: 10, max: 1000,
    what: 'Bet the Player, the Banker or a Tie, and squeeze the cards up one corner at a time. The scoreboard keeps the shoe.' },
  { id: 'video-poker', name: 'Video Poker', min: 1, max: 100,
    what: 'Jacks or Better on a full-pay machine. Hold the cards you want, draw for the rest, and bet five coins for the royal.' },
  { id: 'cherry-bell', name: 'Cherry Bell', min: 1, max: 100, slot: true,
    what: 'An old three-reel slot: cherries, lemons, bells, bars and sevens on one pay line. Pull the handle.' },
  { id: 'odds-and-ends', name: 'Odds & Ends', min: 1, max: 100, slot: true,
    what: 'A slot machine stocked from the junk drawer: keys, batteries, rubber bands and the odd lucky penny, on five lines.' },
  { id: 'motherlode', name: 'Motherlode', min: 20, max: 100, slot: true,
    what: 'Five reels and twenty lines down a gold mine. Three lanterns light up free spins, and the wild pickaxes stick.' },
];

export const byId = id => TABLES.find(t => t.id === id);

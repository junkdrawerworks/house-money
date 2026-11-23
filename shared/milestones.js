// Milestones: firsts and rare moments, shown on Records (greyed until earned, then dated) and said once at the table
// where one lands. Nothing is paid for them: they're for looking back on. They're kept in Records (ms in
// shared/ledger.js: the day each was earned, the earliest of any device's), so they follow Google Drive saving.
// Nothing here touches the page, so the tests run it in Node.
//
// check(c) says whether a round just settled earns one. c:
//   id       the table the round was at
//   won      what the round came to (back − wagered)
//   add, top the table's own counters for the round, as given to Records ({ blackjacks: 1 }, { longestHand: 9 })
//   marks    rare moments the table names that Records doesn't count ('tie': a Tie bet won at Baccarat; 'sevens':
//            three sevens on Cherry Bell's line; 'lode': Motherlode's free spins paid over 100 times the bet)
//   tables   every table's totals in Records, this round included
//   cage     { chips, high, wagered }: the stack, the most it's held, and every chip bet (the player's card)
// say: the line at the table, or none (a new player's card already has its own).

import { TABLES } from './tables.js';

const rounds = c => Object.values(c.tables).reduce((a, t) => a + (t.rounds || 0), 0);

export const MILESTONES = [
  { id: 'blackjack', title: 'First blackjack', what: 'A blackjack dealt to you.', check: c => c.id === 'blackjack' && c.add.blackjacks > 0 },
  { id: 'straight-up', title: 'Right on the number', what: 'A straight-up bet hits at Roulette.', check: c => c.id === 'roulette' && c.add.straightHits > 0 },
  { id: 'hot-hand', title: 'Hot hand', what: 'Ten rolls in one hand at Craps.', check: c => c.id === 'craps' && c.top.longestHand >= 10 },
  { id: 'on-fire', title: 'On fire', what: 'Twenty rolls in one hand at Craps.', check: c => c.id === 'craps' && c.top.longestHand >= 20 },
  { id: 'tie', title: 'Tie game', what: 'A Tie bet wins at Baccarat, 8 to 1.', check: c => c.id === 'baccarat' && c.marks.includes('tie') },
  { id: 'four', title: 'Four of a kind', what: 'Four of a kind at Video Poker.', check: c => c.id === 'video-poker' && c.add.four > 0 },
  { id: 'straight-flush', title: 'Straight flush', what: 'A straight flush at Video Poker.', check: c => c.id === 'video-poker' && c.add['straight-flush'] > 0 },
  { id: 'royal', title: 'Royal flush', what: 'A natural royal flush at Video Poker.', check: c => c.id === 'video-poker' && c.add.royal > 0 },
  { id: 'sevens', title: 'Three sevens', what: 'Three sevens on the line at Cherry Bell.', check: c => c.id === 'cherry-bell' && c.marks.includes('sevens') },
  { id: 'pennies', title: 'Lucky pennies', what: 'Three lucky pennies on a line at Odds & Ends.', check: c => c.id === 'odds-and-ends' && c.add.jackpots > 0 },
  { id: 'free-spins', title: 'Down the mine', what: 'Free spins at Motherlode.', check: c => c.id === 'motherlode' && c.add.features > 0 },
  { id: 'mother-lode', title: 'The mother lode', what: 'Free spins at Motherlode that pay over 100 times the bet.', check: c => c.id === 'motherlode' && c.marks.includes('lode') },
  { id: 'four-figures', title: 'Four figures', what: 'A win of 1,000 or more in one round.', check: c => c.won >= 1000 },
  { id: 'ten-k', title: '10,000 in the rack', what: 'Holding 10,000 chips at once.', check: c => c.cage.high >= 10000 },
  { id: 'hundred-k', title: '100,000 in the rack', what: 'Holding 100,000 chips at once.', check: c => c.cage.high >= 100000 },
  { id: 'silver', title: 'Silver card', what: 'Your player’s card goes Silver.', check: c => c.cage.wagered >= 10000, quiet: true },
  { id: 'gold', title: 'Gold card', what: 'Your player’s card goes Gold.', check: c => c.cage.wagered >= 50000, quiet: true },
  { id: 'black', title: 'Black card', what: 'Your player’s card goes Black.', check: c => c.cage.wagered >= 250000, quiet: true },
  { id: 'grand-tour', title: 'The grand tour', what: 'A round at every table on the floor.', check: c => TABLES.every(t => c.tables[t.id]?.rounds > 0) },
  { id: 'regular', title: 'A regular', what: '1,000 plays across the floor.', check: c => rounds(c) >= 1000 },
];

export const byId = id => MILESTONES.find(m => m.id === id);

// The milestones a round earns that aren't earned yet (have: { id: day }), in the list's order.
export function earned(c, have = {}) {
  const ctx = { won: 0, add: {}, top: {}, marks: [], tables: {}, cage: { chips: 0, high: 0, wagered: 0 }, ...c };
  return MILESTONES.filter(m => !have[m.id] && m.check(ctx)).map(m => m.id);
}

// What the table says when one lands: "That’s a milestone: first blackjack." '' for a new player's card, which the
// table already announces.
export const said = id => { const m = byId(id); return !m || m.quiet ? '' : `That’s a milestone: ${m.title[0].toLowerCase()}${m.title.slice(1)}.`; };

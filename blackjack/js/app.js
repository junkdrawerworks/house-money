// Blackjack on screen: the bet circle and rack, the deal, your choices, the dealer's turn and the payout.
// The rules are in game.js; this file moves the chips (shared/cage.js) and the cards, and saves the game after every
// step, so a reload picks up exactly where the hand was.

import * as g from './game.js';
import * as cage from '../../shared/cage.js';
import * as records from '../../shared/records.js';
import * as sound from '../../shared/sound.js';
import { cardEl, turn, dealInto } from '../../shared/cards.js';
import { rack as makeRack, setStack } from '../../shared/chips.js';
import { mountTable, float, wait, netLine } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import * as seat from '../../shared/seat.js';

const KEY = 'house-money.blackjack';
const T = byId('blackjack');
const $ = id => document.getElementById(id);

let s = load();
const table = mountTable({
  id: 'blackjack', name: T.name, min: T.min, max: T.max,
  felt: () => onFelt(),
  help: `
    <p>Get closer to 21 than the dealer without going over. Number cards count as their number, jacks, queens and kings
    count 10, and an ace counts 1 or 11, whichever helps.</p>
    <h3>Betting</h3>
    <p>Pick a chip from the rack, tap the circle to put it down, and press Deal. Clear picks your chips back up; Rebet
    puts down what you bet last time.</p>
    <h3>Your choices</h3>
    <ul>
      <li><b>Hit</b> takes another card. <b>Stand</b> keeps what you have.</li>
      <li><b>Double</b> doubles your bet on your first two cards and takes exactly one more card.</li>
      <li><b>Split</b> two cards of the same value into two hands, with a second bet. You can split up to four hands and
      double after splitting. Split aces get one card each.</li>
      <li><b>Surrender</b> gives up your first two cards for half your bet back.</li>
      <li><b>Insurance</b> is offered when the dealer shows an ace: a side bet of up to half your bet that pays 2 to 1
      if the dealer has blackjack.</li>
    </ul>
    <h3>The house rules</h3>
    <ul>
      <li>Six decks, shuffled when the cut card comes out, about three quarters of the way through.</li>
      <li>Blackjack (an ace and a ten-card as your first two) pays 3 to 2. A win pays even money.</li>
      <li>No lost half chips: on an odd bet, the half chip a blackjack or a surrender owes you is kept and paid with
      the next one. A blackjack on 25 pays 37 and keeps the half; the next pays 38.</li>
      <li>The dealer checks for blackjack under an ace or a ten, and stands on every 17, soft ones too.</li>
    </ul>
    <h3>The book</h3>
    <p><b>Ask the book</b> shows what basic strategy says for your hand against the dealer’s card: the play that loses
    least in the long run. Played that way, the house keeps about half a percent.</p>`,
  onStake: () => paint(),
  // the stack changed, here or in another tab
  onCage: () => { if (!busy) paint(); },
});

const rack = makeRack($('rack'), { values: [5, 25, 100, 500, 1000], key: 'house-money.blackjack.chip' });
let busy = false;     // cards are moving; buttons wait

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x && Array.isArray(x.shoe) && x.shoe.length && typeof x.phase === 'string') return x;
  } catch { /* first visit */ }
  return g.fresh();
}
// felt: the chips out on the table right now, which the cage counts as yours: the bet in the circle, and the hands
// in play until the round is settled and paid
function onFelt() {
  const over = s.phase === 'bet' || (s.phase === 'done' && s.paid !== false);
  return s.bet + (over ? 0 : s.hands.reduce((a, h) => a + h.bet, 0) + s.insurance);
}
function save() { s.felt = onFelt(); seat.write(KEY, s); }

// ---------- drawing the table ----------

const dealerRow = $('dealerRow'), handsEl = $('hands');
const handEls = new Map(); // hand id → element

// Each card on screen carries the card it shows (data-c, 'As'), so the row can be checked against the hand card by
// card: from the first one that doesn't match (a split takes the second card away and deals a new one in its place),
// the rest are taken off and dealt in again from the shoe.
const tag = c => `${c.r}${c.s}`;
function syncRow(row, cards, { hole = false, size } = {}) {
  if (size) row.style.setProperty('--size', `${size}px`);
  let keep = 0;
  while (keep < cards.length && row.children[keep]?.dataset.c === tag(cards[keep])) keep++;
  while (row.children.length > keep) row.lastElementChild.remove();
  const jobs = [];
  cards.forEach((c, i) => {
    const down = hole && i === 1;
    let el = row.children[i];
    if (!el) {
      el = cardEl(c, { down });
      el.dataset.c = tag(c);
      jobs.push(dealInto(row, el, { from: $('shoe').getBoundingClientRect(), delay: jobs.length * 140 }));
      sound.card();
    } else if (el.classList.contains('down') && !down) {
      turn(el, c); sound.flip();
    }
  });
  return Promise.all(jobs);
}

function cardSize() {
  const n = s.hands.length;
  const w = Math.min(innerWidth, 760);
  const base = w >= 700 && innerHeight >= 700 ? 92 : w < 370 ? 62 : 70;
  return Math.round(base * (n <= 1 ? 1 : n === 2 ? .8 : .62));
}

// 'Blackjack' only for the hand as dealt: two cards to 21 after a split is a plain 21, and pays even money.
function totText(cards, one = true) {
  const { total, soft } = g.total(cards);
  if (one && g.isBJ(cards)) return 'Blackjack';
  if (total > 21) return `${total} · Bust`;
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
}

async function paintCards() {
  const jobs = [];
  jobs.push(syncRow(dealerRow, s.dealer, { hole: s.hole, size: Math.round(cardSize() / (s.hands.length <= 1 ? 1 : s.hands.length === 2 ? .8 : .62)) }));
  const dt = $('dealerTot');
  if (s.dealer.length) {
    const shown = s.hole ? [s.dealer[0]] : s.dealer;
    dt.hidden = false;
    dt.textContent = s.hole ? String(g.total(shown).total) : totText(shown);
    dt.classList.toggle('bust', !s.hole && g.total(shown).total > 21);
    dt.classList.toggle('bj', !s.hole && g.isBJ(shown));
  } else dt.hidden = true;

  const ids = new Set(s.hands.map(h => h.id));
  for (const [id, el] of handEls) if (!ids.has(id)) { el.remove(); handEls.delete(id); }
  const size = cardSize();
  handsEl.classList.toggle('many', s.hands.length > 1);
  s.hands.forEach((h, i) => {
    let el = handEls.get(h.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'hand';
      el.innerHTML = '<div class="row"></div><span class="tot"></span><div class="bet"></div>';
      handEls.set(h.id, el);
    }
    if (handsEl.children[i] !== el) handsEl.insertBefore(el, handsEl.children[i] || null);
    el.classList.toggle('active', s.phase === 'play' && i === s.active && s.hands.length > 1);
    el.setAttribute('aria-label', `Hand ${i + 1}`);
    jobs.push(syncRow(el.querySelector('.row'), h.cards, { size }));
    const tot = el.querySelector('.tot');
    tot.textContent = totText(h.cards, s.hands.length === 1);
    tot.classList.toggle('bust', g.total(h.cards).total > 21);
    tot.classList.toggle('bj', s.hands.length === 1 && g.isBJ(h.cards));
    setStack(el.querySelector('.bet'), h.bet, { most: 6 });
    let res = el.querySelector('.res');
    if (h.result && s.phase === 'done') {
      if (!res) { res = document.createElement('span'); el.appendChild(res); }
      res.className = `res ${h.result}`;
      res.textContent = { win: 'Win', lose: 'Lose', bust: 'Bust', push: 'Push', blackjack: 'Blackjack', surrender: 'Surrendered' }[h.result];
    } else if (res) res.remove();
  });
  return Promise.all(jobs);
}

function paint() {
  const p = s.phase;
  const betting = p === 'bet' || p === 'done';
  $('betting').hidden = !(p === 'bet');
  setStack($('spot'), s.bet, { most: 8 });
  const c = cage.read();
  rack.limit(c.chips);
  $('rack').hidden = !betting;
  $('betActions').hidden = p !== 'bet';
  $('insActions').hidden = p !== 'insurance';
  $('playActions').hidden = p !== 'play';
  $('doneActions').hidden = p !== 'done';
  $('book').hidden = p !== 'play';
  const { min, max } = table.limits();
  $('clear').disabled = busy || !s.bet;
  $('rebet').disabled = busy || !!s.bet || !s.last || s.last > c.chips;
  $('rebet').textContent = s.last ? `Rebet ${cage.fmt(Math.min(s.last, max))}` : 'Rebet';
  $('deal').disabled = busy || s.bet < min;
  $('betHint').textContent = s.bet ? (s.bet < min ? `The minimum here is ${min}.` : '') : `Bets ${cage.fmt(min)} to ${cage.fmt(max)}`;
  if (p === 'insurance') {
    const half = Math.floor(s.hands[0].bet / 2);
    $('ins').textContent = `Insure for ${cage.fmt(half)}`;
    $('ins').disabled = busy || half < 1 || half > c.chips;
    $('noIns').disabled = busy;
  }
  if (p === 'play') {
    const ok = g.can(s);
    const h = g.hand(s);
    for (const k of ['hit', 'stand', 'surrender']) $(k).disabled = busy || !ok[k];
    $('double').disabled = busy || !ok.double || h.bet > c.chips;
    $('split').disabled = busy || !ok.split || h.bet > c.chips;
    $('split').hidden = !ok.split;
    $('surrender').hidden = !ok.surrender;
  }
  if (p === 'done') {
    const again = Math.min(s.last, max);
    $('again').textContent = `Same bet: ${cage.fmt(again)}`;
    $('again').disabled = busy || again > c.chips || again < min;
    $('newBet').disabled = busy;
  }
  const left = s.shoe.length / g.CARDS;
  $('shoe').style.setProperty('--left', Math.max(0, (left - (1 - g.CUT)) / g.CUT).toFixed(3));
  table.check();
}

async function show() { paint(); await paintCards(); }

// ---------- betting ----------

function put(v) {
  if (busy || seat.guard()) return;
  if (s.phase === 'done') newBet();
  if (s.phase !== 'bet') return;
  const { max } = table.limits();
  if (s.bet + v > max) { table.say(`The most you can bet here is ${cage.fmt(max)}.`); return; }
  if (!cage.take(v)) { table.say('Not enough chips for that one.'); return; }
  s.bet += v; save(); sound.chip(); table.say(''); paint();
}

$('spot').addEventListener('click', () => put(rack.value));
$('clear').addEventListener('click', () => {
  if (!s.bet || busy) return;
  cage.pay(s.bet, { unwager: s.bet }); s.bet = 0; save(); sound.chips(3); paint();
});
$('rebet').addEventListener('click', () => {
  if (s.bet || busy) return;
  const n = Math.min(s.last, table.limits().max);
  if (!cage.take(n)) return;
  s.bet = n; save(); sound.chips(3); paint();
});

function newBet() {
  g.clear(s);
  dealerRow.innerHTML = ''; handsEl.innerHTML = ''; handEls.clear();
  save(); table.say(''); paint(); paintCards();
}
$('newBet').addEventListener('click', () => { if (!busy) newBet(); });
$('again').addEventListener('click', () => {
  if (busy) return;
  const n = Math.min(s.last, table.limits().max);
  newBet();
  if (!cage.take(n)) return;
  s.bet = n; save(); sound.chips(3);
  deal();
});

// ---------- the round ----------

async function step(fn) {
  if (busy) return;
  busy = true; paint();
  try { await fn(); } finally { busy = false; paint(); }
}

function deal() {
  if (seat.guard()) return;
  step(async () => {
    if (s.phase !== 'bet' || s.bet < table.limits().min) return;
    table.say('');
    g.deal(s); save();
    if (s.shuffled) { table.say('A fresh shoe.'); }
    await paintCards();
    await wait(250);
    await after();
  });
}
$('deal').addEventListener('click', deal);

// Whatever comes next after a move: the dealer's turn, the payout, or your next choice.
async function after() {
  if (s.phase === 'insurance') { table.say('The dealer shows an ace. Insurance?'); return; }
  if (s.phase === 'play') { prompt(); return; }
  if (s.phase === 'dealer') {
    save();
    await paintCards();
    await wait(500);
    while (g.dealerStep(s)) { save(); await paintCards(); await wait(600); }
  }
  if (s.phase === 'dealer' || (s.phase === 'done' && s.paid === false)) await payout();
}

function prompt() {
  const h = g.hand(s);
  const t = g.total(h.cards);
  const up = g.value(s.dealer[0]);
  const upWord = up === 1 ? 'an ace' : up === 10 ? 'a ten' : up === 8 ? 'an 8' : `a ${up}`;
  const which = s.hands.length > 1 ? `Hand ${s.active + 1}: ` : '';
  table.say(`${which}${t.soft && t.total < 21 ? 'soft ' : ''}${t.total} against ${upWord}.`);
  document.querySelectorAll('.play .btn.tip').forEach(b => b.classList.remove('tip'));
}

// The dealer's turn is over (or a blackjack settled the round as it was dealt): the round is settled and kept before
// the chips move, so a reload can't pay twice, and then it's paid.
async function payout() {
  if (s.phase === 'dealer') { g.settle(s); save(); }
  await paintCards();
  if (!finish()) return;
  const o = s.outcome;
  const net = o.back - o.wagered;
  const d = g.total(s.dealer).total;
  const dealerLine = o.dealerBJ ? 'Dealer has blackjack.' : !g.dealerPlays(s) ? '' : d > 21 ? `Dealer busts with ${d}.` : `Dealer has ${d}.`;
  let line;
  const kept = o.half === 'kept', before = o.half === 'paid';
  const one = s.hands.length === 1, h0 = s.hands[0];
  const VERB = { win: 'wins', lose: 'loses', bust: 'busts', push: 'pushes', blackjack: 'wins', surrender: 'surrenders' };
  // with more than one hand, what each did: "Hand 1 pushes, hand 2 busts."
  const each = one ? '' : `${s.hands.map((h, i) => `${i ? 'hand' : 'Hand'} ${i + 1} ${VERB[h.result]}`).join(', ')}.`;
  const lostIns = s.insurance > 0 && !o.dealerBJ;
  if (o.natural && !o.dealerBJ) line = `Blackjack! That pays ${cage.fmt(h0.pay - h0.bet)}${kept ? ', and the half chip’s kept for your next one' : before ? ', with the half chip kept from before' : ''}.`;
  else if (s.hands[0].surrendered) line = before ? `You surrender: half your bet and the half chip kept from before, ${cage.fmt(o.back)}, come back.`
    : `You surrender: half your bet, ${cage.fmt(o.back)}, comes back${kept ? ', and the half chip’s kept for later' : ''}.`;
  else if (one && h0.result === 'bust') line = `Bust with ${g.total(h0.cards).total}. The house takes it.`;
  else if (net > 0) line = `${dealerLine} ${each} You win ${cage.fmt(net)}.`;
  else if (net === 0) line = one && !o.insurance ? `${dealerLine} Push: your bet comes back.` : `${dealerLine} ${each} Even.`;
  // some came back and more didn't: say what each did and where it leaves you, so it can't read like a push
  else if (o.back > 0) line = `${dealerLine} ${one ? `Your hand ${VERB[h0.result]}.` : each} ${netLine(o.wagered, o.back)}`;
  else line = `${dealerLine} ${each} The house takes it.`;
  if (lostIns) line = `No blackjack: the insurance loses. ${line}`;
  if (o.insurance) line = `Insurance pays ${cage.fmt(o.insurance)}. ${line}`;
  table.say(line.replace(/ {2,}/g, ' ').trim(), net > 0 ? 'win' : net < 0 ? 'lose' : '');
  if (net > 0) { sound.chips(5); sound.win(o.natural ? 3 : net >= o.wagered * 2 ? 2 : 1); float($('hands'), `+${cage.fmt(net)}`); }
  else if (net < 0) sound.lose(); else sound.push();
}

// A settled round's chips to the rack and its line in Records, together and once: a hand just settled, or one settled
// before the page closed. False when there's nothing to pay.
function finish() {
  if (s.phase !== 'done' || s.paid !== false || seat.guard()) return false;
  const o = s.outcome;
  if (o.back > 0) cage.pay(o.back);
  s.paid = true; save();
  records.note('blackjack', { wagered: o.wagered, back: o.back, extra: { blackjacks: o.natural && !o.dealerBJ ? 1 : 0, won: o.back > o.wagered ? 1 : 0 } });
  return true;
}

function act(name, cost = 0) {
  if (seat.guard()) return;
  step(async () => {
    if (cost && !cage.take(cost)) { table.say('Not enough chips for that.'); return; }
    g[name](s); save(); sound.tap();
    await paintCards();
    await wait(200);
    await after();
  });
}
$('hit').addEventListener('click', () => act('hit'));
$('stand').addEventListener('click', () => act('stand'));
$('double').addEventListener('click', () => act('double', g.hand(s).bet));
$('split').addEventListener('click', () => act('split', g.hand(s).bet));
$('surrender').addEventListener('click', () => {
  step(async () => {
    g.surrender(s); save(); sound.tap();
    await after();
  });
});
$('noIns').addEventListener('click', () => step(async () => { g.insure(s, 0); save(); await paintCards(); await after(); }));
$('ins').addEventListener('click', () => step(async () => {
  const half = Math.floor(s.hands[0].bet / 2);
  if (!cage.take(half)) return;
  g.insure(s, half); save(); sound.chip();
  await paintCards(); await after();
}));

$('book').addEventListener('click', () => {
  const b = g.book(s);
  if (!b) return;
  table.say(b.why);
  document.querySelectorAll('.play .btn').forEach(el => el.classList.toggle('tip', el.id === b.act));
});

// The keyboard: H, S, D, P (split), R (surrender), Enter deals or deals again.
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };
  if (s.phase === 'play' && map[k]) { $(map[k]).click(); e.preventDefault(); }
  else if (k === 'enter') {
    const b = s.phase === 'bet' ? $('deal') : s.phase === 'done' ? $('again') : null;
    if (b && !b.disabled) { b.click(); e.preventDefault(); }
  }
});

addEventListener('resize', () => paintCards());

// ---------- start: carry on where the last visit left off ----------

(async () => {
  await show();
  if (s.phase === 'play') prompt();
  else if (s.phase === 'insurance') table.say('The dealer shows an ace. Insurance?');
  // the dealer's turn, or a round settled whose chips never reached the rack (the page closed in between): on to the payout
  else if (s.phase === 'dealer' || (s.phase === 'done' && s.paid === false)) step(after);
  else if (s.phase === 'done') table.say('Same bet again, or a new one?');
  else table.say(s.bet ? '' : 'Place your bet.');
})();

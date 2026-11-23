// Video Poker on screen: the game on the marquee, the coin size and coins, the deal, the holds, the draw and the pay.
// The rules are in poker.js. The draw comes off the same shuffled deck as the deal, saved with it, so a reload shows
// the same cards and a hand is never paid twice.

import * as vp from './poker.js';
import * as cage from '../../shared/cage.js';
import { bigWin, shown as bigShown, dismiss } from '../../shared/bigwin.js';
import * as records from '../../shared/records.js';
import * as sound from '../../shared/sound.js';
import { cardEl, turn, label } from '../../shared/cards.js';
import { rack as makeRack } from '../../shared/chips.js';
import { mountTable, float, wait, hotkey, shortcut } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import * as seat from '../../shared/seat.js';

const KEY = 'house-money.video-poker';
const T = byId('video-poker');
const $ = id => document.getElementById(id);

let s = load();
const G = () => vp.game(s.game);
// the coins in play: dealt and not drawn, or drawn and not yet paid (the coin size can't change till they're paid)
const inPlay = () => s.phase === 'draw' || (s.phase === 'done' && s.paid === false);
const onFelt = () => (inPlay() ? s.coins * s.coin : 0);

const pct = x => `${(100 * x).toFixed(2)}%`;
const PAYS = {
  jacks: `<p>This is a full-pay machine (nine for a full house, six for a flush), the best Jacks or Better there is.
    Everything pays the same per coin whether you play one coin or five, except the royal flush: 250 a coin up to four
    coins, and 4,000 for five. So play five when you can.</p>`,
  bonus: `<p>Bonus Poker pays like Jacks or Better, except four of a kind: 80 a coin for four aces, 40 for four 2s, 3s or
    4s, and 25 for the rest. A full house pays 8 and a flush 5 (the 8/5 machine). Everything pays the same per coin
    whether you play one coin or five, except the royal flush: 250 a coin up to four coins, and 4,000 for five.</p>`,
  deuces: `<p>Every 2 is wild: it stands for whatever card makes the hand best. A natural royal flush (no deuces in it)
    pays 250 a coin, or 4,000 for five coins. Four deuces pay 200 a coin, a royal flush made with deuces 25, five of a
    kind 16 and a straight flush 10; four of a kind and a full house 4, a flush 3, a straight 2 and three of a kind 1.
    A pair or two pair pays nothing. This is the pay table known as Not So Ugly Ducks.</p>`,
};
const WINS = {
  jacks: 'Anything from a pair of jacks up pays.',
  bonus: 'Anything from a pair of jacks up pays, and four aces or four 2s, 3s or 4s pay extra.',
  deuces: 'The four 2s are wild, and three of a kind is the lowest hand that pays.',
};
const helpFor = g => `
    <p>Five cards, one draw. Keep the cards you like, replace the rest, and the machine pays on what you end up with.
    ${WINS[g.id]}</p>
    <h3>Three games</h3>
    <p>Tap the red sign at the top for <b>Jacks or Better</b>, <b>Bonus Poker</b> or <b>Deuces Wild</b>. The machine
    remembers your game, and it changes between hands, never during one.</p>
    <h3>Playing</h3>
    <ul>
      <li>Pick a <b>coin</b> size from the rack, and how many coins to play with <b>Bet one</b> (one to five).
      <b>Bet max</b> plays five coins and deals straight away.</li>
      <li><b>Deal</b>, then tap the cards you want to keep (or the Hold button under each). Tap again to let one go.</li>
      <li><b>Draw</b> replaces every card you didn’t hold.</li>
    </ul>
    <h3>The pay table: ${g.name}</h3>
    ${PAYS[g.id]}
    <h3>The strategy card</h3>
    <p>The link under the buttons lights up the cards this game’s strategy card would hold, and says which line of it
    applies (${g.wild ? '' : 'high cards are jacks, queens, kings and aces; '}a gap is a card missing from the middle of a
    straight${g.wild ? ', and 4-5 or 5-7 up means two cards in a row from 4-5 upward, or one apart from 5-7 upward' : ''}).
    Played perfectly, ${g.name} here pays back ${pct(g.back)} of what goes in over the long run. The strategy card is
    simpler, and played its way the machine pays back ${pct(g.card)}.</p>
    <p>A new 52-card deck is shuffled for every hand.</p>
    <p>The keyboard works too: 1 to 5 hold, and Enter deals and draws.</p>`;

const table = mountTable({
  id: 'video-poker', name: T.name, min: T.min, max: T.max, felt: onFelt,
  help: helpFor(G()),
  onStake: () => paint(),
  // the stack changed, here or in another tab
  onCage: () => { if (!busy) paint(); },
});

const rack = makeRack($('rack'), { values: T.coins, key: 'house-money.video-poker.chip', onPick: v => { if (s && !inPlay()) { s.coin = v; save(); paintMeters(); } } });
let busy = false;

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x && Array.isArray(x.hand) && typeof x.phase === 'string') return { ...x, game: vp.game(x.game).id };
  } catch { /* first visit */ }
  return vp.fresh();
}
function save() { s.felt = onFelt(); seat.write(KEY, s); }

// ---------- the screen ----------

function paintPaytable() {
  const rows = $('payRows');
  if (rows.dataset.game !== s.game) {
    rows.dataset.game = s.game;
    rows.replaceChildren();
    for (const p of G().paytable) {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;
      tr.innerHTML = `<td>${p.name}</td>${p.pays.map(n => `<td>${n.toLocaleString('en-US')}</td>`).join('')}`;
      rows.appendChild(tr);
    }
  }
  for (const tr of rows.children) {
    [...tr.children].forEach((td, i) => td.classList.toggle('on', i === s.coins));
    tr.classList.toggle('hit', s.phase === 'done' && s.result?.id === tr.dataset.id);
  }
}

function paintMeters() {
  $('betM').textContent = cage.fmt(s.coins * s.coin);
  $('winM').textContent = s.phase === 'done' && s.result ? cage.fmt(s.result.pay) : '0';
  $('coinsM').textContent = s.coins;
  $('coinM').textContent = cage.fmt(s.coin);
  paintPaytable();
}

const slots = [];
function buildHand() {
  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div');
    el.className = 'slot';
    // each card is one tab stop, its Hold button; the card itself still takes a tap
    el.innerHTML = `<span class="held">Held</span><button type="button" class="cardwrap" tabindex="-1"></button><button type="button" class="hold">Hold</button>`;
    el.querySelector('.cardwrap').addEventListener('click', () => toggle(i));
    el.querySelector('.hold').addEventListener('click', () => toggle(i));
    $('hand').appendChild(el);
    slots.push(el);
  }
}

function setCard(i, card, { down = false } = {}) {
  const wrap = slots[i].querySelector('.cardwrap');
  wrap.innerHTML = '';
  const el = cardEl(card, { down });
  wrap.appendChild(el);
  named(i);
  return el;
}

// A screen reader hears each card by name, on the card and on its Hold button: "Card 2: king of spades", "Hold card
// 2, king of spades" ("face down" while the back shows).
function named(i) {
  const c = slots[i].querySelector('.card');
  const what = c && !c.classList.contains('down') ? label({ r: +c.dataset.r, s: c.dataset.s }) : '';
  slots[i].querySelector('.cardwrap').setAttribute('aria-label', `Card ${i + 1}: ${what || 'face down'}`);
  slots[i].querySelector('.hold').setAttribute('aria-label', `Hold card ${i + 1}${what ? `, ${what}` : ''}`);
}
function show(i, el) { turn(el, s.hand[i]); named(i); }

function paintHolds() {
  const lit = s.phase === 'done' && s.result ? vp.makers(s.hand, s.result.id, s.game) : [];
  slots.forEach((el, i) => {
    el.classList.toggle('on', s.phase === 'draw' && s.held[i]);
    el.querySelector('.hold').disabled = busy || s.phase !== 'draw';
    el.querySelector('.hold').setAttribute('aria-pressed', s.phase === 'draw' && s.held[i]);
    el.querySelector('.cardwrap').disabled = busy || s.phase !== 'draw';
    const c = el.querySelector('.card');
    if (c) {
      c.classList.toggle('lit', lit.includes(i));
      c.classList.toggle('dim', s.phase === 'done' && !!s.result && !lit.includes(i));
    }
  });
}

function paint() {
  const c = cage.read();
  const { max } = table.limits();
  // coin sizes over the table's top bet are off; so are coins you can't cover. The coin can't change mid-hand: the
  // rack stays on the coin in play until the hand is paid.
  rack.lock(inPlay());
  if (inPlay() && rack.value !== s.coin) rack.pick(s.coin);
  rack.limit(Math.min(max, c.chips));
  if (!inPlay() && s.coin !== rack.value) { s.coin = rack.value; save(); }
  $('rack').hidden = false;
  const betting = s.phase !== 'draw';
  $('betOne').disabled = busy || !betting;
  $('betMax').disabled = busy || !betting || 5 * s.coin > c.chips;
  $('deal').textContent = s.phase === 'draw' ? 'Draw' : 'Deal';
  $('deal').disabled = busy || (betting && s.coins * s.coin > c.chips);
  $('hint').hidden = s.phase !== 'draw';
  paintGame();
  paintMeters();
  paintHolds();
  table.check();
}

function toggle(i) {
  if (busy || s.phase !== 'draw') return;
  s.held[i] = !s.held[i];
  save(); sound.tap();
  slots.forEach(el => el.classList.remove('tip'));
  paintHolds();
}

// ---------- betting ----------

$('betOne').addEventListener('click', () => {
  if (busy || s.phase === 'draw') return;
  s.coins = s.coins >= 5 ? 1 : s.coins + 1;
  save(); sound.chip(); clearShown(); paint();
});
$('betMax').addEventListener('click', () => {
  if (busy || s.phase === 'draw') return;
  s.coins = 5; save(); sound.chip(); paint();
  deal();
});
$('deal').addEventListener('click', () => (s.phase === 'draw' ? draw() : deal()));

// After a hand, betting again clears the old result off the screen.
function clearShown() {
  if (s.phase === 'done') { s.phase = 'bet'; s.result = null; save(); table.say(''); }
}

async function deal() {
  if (busy || s.phase === 'draw' || seat.guard()) return;
  showGames(false);
  const bet = s.coins * s.coin;
  if (bet > table.limits().max * 5) return;
  if (!cage.take(bet)) { table.say('Not enough chips: bet fewer coins or a smaller coin.'); return; }
  busy = true;
  vp.deal(s); save();
  table.say('');
  paint();
  try {
    const els = s.hand.map((c, i) => setCard(i, c, { down: true }));
    for (let i = 0; i < 5; i++) { await wait(90); show(i, els[i]); sound.card(); }
    const best = vp.evaluate(s.hand, s.game);
    table.say(best ? `${best.name}` : 'Hold the cards you want');
  } finally { busy = false; paint(); }
}

async function draw() {
  if (busy || s.phase !== 'draw' || seat.guard()) return;
  busy = true;
  const held = s.held.slice();
  vp.draw(s);
  s.paid = false; save();           // the hand is kept before the chips move, so a reload can't pay twice
  slots.forEach(el => el.classList.remove('tip'));
  paint();
  try {
    const els = [];
    for (let i = 0; i < 5; i++) {
      if (held[i]) continue;
      els[i] = setCard(i, s.hand[i], { down: true });
    }
    for (let i = 0; i < 5; i++) {
      if (held[i]) continue;
      await wait(110); show(i, els[i]); sound.card();
    }
    await wait(150);
    const o = finish();
    if (!o) return;
    if (s.result) {
      table.say(`${s.result.name}! Win ${cage.fmt(o.pay)}`, 'win');
      const rows = G().paytable, big = rows.findIndex(p => p.id === s.result.id);
      // a royal flush (a natural one at Deuces Wild), and four deuces: the big card, once the hand is paid and saved
      const card = { royal: 'Royal flush!', 'four-deuces': 'Four deuces!' }[s.result.id];
      if (card) await bigWin({ amount: o.pay, title: card, x: o.pay / o.wagered, note: `${s.coins} coin${s.coins === 1 ? '' : 's'} of ${cage.fmt(s.coin)}`, top: s.result.id === 'royal' });
      else { sound.chips(Math.min(10, 3 + (rows.length - 1 - big))); sound.win(big <= 2 ? 3 : big <= 5 ? 2 : 1); }
      float($('hand'), `+${cage.fmt(o.pay)}`);
    } else { table.say('Game over', 'lose'); sound.lose(); }
  } finally { busy = false; paint(); }
}

// A drawn hand's chips to the rack and its line in Records, together and once: a hand just drawn, or one drawn before
// the page closed, winning or not. Returns { pay, wagered }, or null when there's nothing to pay.
function finish() {
  if (s.phase !== 'done' || s.paid !== false || seat.guard()) return null;
  const o = { pay: s.result?.pay || 0, wagered: s.coins * s.coin };
  if (o.pay > 0) cage.pay(o.pay);
  s.paid = true; save();
  records.note('video-poker', { wagered: o.wagered, back: o.pay, extra: s.result ? vp.counters(s.result.id, s.game) : {} });
  return o;
}

$('hint').addEventListener('click', () => {
  if (s.phase !== 'draw' || busy) return;
  const a = vp.advise(s.hand, s.game);
  slots.forEach((el, i) => el.classList.toggle('tip', a.held[i]));
  table.say(a.why);
});

// ---------- the games: the marquee opens the list on the screen, between hands ----------

for (const g of vp.GAMES) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pick'; b.dataset.game = g.id;
  b.innerHTML = `<b>${g.name}</b><em>Pays back ${pct(g.back)}</em><span>${g.blurb}</span>`;
  b.addEventListener('click', () => pickGame(g.id));
  $('gamesList').appendChild(b);
}
const gamesOpen = () => !$('games').hidden;
function showGames(on) {
  if (on === gamesOpen()) return;
  $('games').hidden = !on;
  $('gameBtn').setAttribute('aria-expanded', on);
  if (on) $('gamesList').querySelector('[aria-pressed="true"]')?.focus();
}
function paintGame() {
  const g = G();
  $('gameName').textContent = g.name;
  $('gameBtn').setAttribute('aria-label', inPlay() ? `${g.name}. The game changes once this hand is over.` : `${g.name}: change game`);
  $('gameBtn').disabled = busy || inPlay();
  if (inPlay()) showGames(false);
  for (const b of $('gamesList').children) b.setAttribute('aria-pressed', b.dataset.game === g.id);
}
function pickGame(id) {
  if (busy || inPlay()) return;
  const was = s.game;
  s.game = vp.game(id).id;
  showGames(false);
  $('gameBtn').focus();
  if (s.game === was) return;
  if (s.phase === 'done') { s.phase = 'bet'; s.result = null; }
  save(); sound.tap();
  table.sheet.querySelector('.help').innerHTML = helpFor(G());
  paint();
  table.say(`${G().name}. ${G().blurb}`);
}
$('gameBtn').addEventListener('click', () => { if (!busy && !inPlay()) showGames(!gamesOpen()); });
addEventListener('keydown', e => { if (e.key === 'Escape' && gamesOpen()) { showGames(false); $('gameBtn').focus(); } });

addEventListener('keydown', e => {
  if (!shortcut(e)) return;
  if (/^[1-5]$/.test(e.key)) { toggle(Number(e.key) - 1); e.preventDefault(); }
  else if (e.key === 'Enter' && hotkey(e)) {
    if (bigShown()) { dismiss(); e.preventDefault(); }
    else if (!$('deal').disabled) { $('deal').click(); e.preventDefault(); }
  }
});


// ---------- start: carry on where the last visit left off ----------

buildHand();
// a hand drawn but not paid (the page closed while the cards turned) is paid and recorded now
finish();
if (s.hand.length === 5) s.hand.forEach((c, i) => setCard(i, c));
else for (let i = 0; i < 5; i++) setCard(i, { r: 1, s: 's' }, { down: true }); // backs until the first deal
if (s.phase !== 'draw') rack.pick(rack.value);
paint();
if (s.phase === 'draw') table.say('Hold the cards you want');
else if (s.phase === 'done') table.say(s.result ? `${s.result.name}! Win ${cage.fmt(s.result.pay)}` : 'Game over', s.result ? 'win' : 'lose');
else table.call('Pick a coin and deal');

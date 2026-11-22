// The frame every table sits in: the bar across the top (the way back to the floor, the table's name, your stack and
// the menu), the menu itself (how to play, the limits on your card, sound, records), the line the dealer speaks in,
// and the cage's offer to stake you when you run dry (or, when it can't, a line saying why).
//
//   const t = mountTable({ id: 'blackjack', name: 'Blackjack', help: '<p>…</p>', min: 10, max: 500, felt: () => n })
//   felt: the chips out on this table right now (bets down, or a round dealt and not yet paid): the cage won't stake
//   you while there are any, here or on any other table
//   inPlay: true while a round plays on without needing chips from the rack (Motherlode's free spins)
//   onCage: the stack changed, in this tab or another one (repaint the rack and the buttons)
//   t.say('Dealer has 20.')       a line from the dealer
//   t.hold('A 25 bet is…')        a line that stands while it's true: said once, and taken back with hold('') unless
//                                 something else has been said since
//   t.limits()                    { min, max } on your card
//   t.check()                     shows or hides the stake offer (call after a round settles)
//   netLine(20, 10, 'on the spin') "Down 10 on the spin." for a result line

import * as cage from './cage.js';
import * as sound from './sound.js';
import { TABLES } from './tables.js';
import { sit } from './seat.js';
import { drive } from './sync.js';

const SEEN = 'house-money.seen';

export function mountTable({ id, name, help = '', min = 1, max = 500, felt = () => 0, onStake = () => {}, offerIn = null,
  inPlay = () => false, onCage = () => {} }) {
  sit({ id, name });   // one live tab per table: see seat.js
  const bar = document.querySelector('header.bar') || document.body.insertBefore(document.createElement('header'), document.body.firstChild);
  bar.className = 'bar';
  bar.innerHTML = `
    <a class="back" href="../" aria-label="Back to the floor"><span class="arrow" aria-hidden="true">‹</span> <span class="word">Floor</span></a>
    <h1 class="name">${name}</h1>
    <span class="purse"><span class="chip c100 mini" aria-hidden="true"></span><b id="purse">0</b><span class="vh"> chips</span></span>
    <button type="button" class="menu-btn" aria-label="Menu" aria-haspopup="dialog"><span></span><span></span><span></span></button>`;

  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', `${name}: menu`);
  sheet.innerHTML = `
    <div class="sheet-in">
      <div class="sheet-x"><button type="button" class="x" data-act="close" aria-label="Back to the table"><span aria-hidden="true">×</span></button></div>
      <h2 tabindex="-1">${name}</h2>
      <p class="limits" id="limits"></p>
      <div class="help">${help}</div>
      <p class="drive-line" hidden></p>
      <div class="sheet-btns">
        <button type="button" class="btn" data-act="close">Back to the table</button>
        <a class="btn ghost" href="../">The floor</a>
        <a class="btn ghost" href="../records/">Records</a>
        <button type="button" class="btn ghost" data-act="sound" aria-pressed="true">Sound: on</button>
        <button type="button" class="btn ghost" data-act="sync" hidden>Sync now</button>
      </div>
      <footer class="jd-foot">
        <a href="https://junkdrawer.works/">Part of junkdrawer.works</a>
        <span aria-hidden="true">·</span>
        <a href="https://junkdrawer.works/privacy.html">Privacy</a>
      </footer>
    </div>`;
  document.body.appendChild(sheet);

  const say = document.querySelector('.say') || (() => {
    const p = document.createElement('p'); p.className = 'say'; p.setAttribute('aria-live', 'polite');
    document.querySelector('main')?.prepend(p); return p;
  })();

  // The cage's offer is a banner at the top of the dock, above the rack and the buttons rather than on top of them, so
  // every control stays in reach while it's up. A table with no dock says where it goes instead (offerIn: Cherry Bell
  // puts it on the machine's glass, over the pay table).
  // the chips out on this table now, which stand in for what it last saved when the cage adds up every table's felt
  const here = () => ({ id, felt: felt() });
  const stakeBox = document.createElement('div');
  stakeBox.className = 'stake-offer';
  stakeBox.hidden = true;
  stakeBox.innerHTML = `<p></p><button type="button" class="btn gold">Take ${cage.fmt(cage.START)} from the cage</button>`;
  // When there's no offer and you can't play here either, a line in the same place says why.
  const note = document.createElement('p');
  note.className = 'cage-note';
  note.hidden = true;
  note.setAttribute('aria-live', 'polite');
  const dock = document.querySelector('.dock');
  if (offerIn) offerIn.append(stakeBox, note);
  else if (dock) dock.prepend(stakeBox, note);
  else (document.querySelector('main') || bar).after(stakeBox, note);
  stakeBox.querySelector('button').addEventListener('click', () => {
    if (cage.stake(here())) { sound.chips(8); line(`The cage sends over ${cage.fmt(cage.START)} in chips. Good luck.`); onStake(); }
    check();
  });

  // The stack counts up or down to its new figure. It isn't a live region: a screen reader would read out every step
  // of the count, over the dealer's line, which already says what was won or lost.
  const purse = bar.querySelector('#purse');
  let shown = null;
  function show(c) {
    const to = c.chips;
    if (shown === null || matchMedia('(prefers-reduced-motion: reduce)').matches) { purse.textContent = cage.fmt(to); shown = to; return; }
    const from = shown; shown = to;
    if (from === to) return;
    const t0 = performance.now(), dur = Math.min(700, 200 + Math.abs(to - from));
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      purse.textContent = cage.fmt(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1 && shown === to) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    bar.querySelector('.purse').classList.remove('up', 'down');
    void bar.offsetWidth;
    bar.querySelector('.purse').classList.add(to > from ? 'up' : 'down');
  }

  function limits() { return { min, max: cage.maxBet(max) }; }
  function limitsLine() {
    const t = cage.tier();
    sheet.querySelector('#limits').textContent = `Bets ${cage.fmt(min)} to ${cage.fmt(limits().max)} on your ${t.name} card.`;
  }

  const soundBtn = sheet.querySelector('[data-act="sound"]');
  const soundLabel = () => { soundBtn.textContent = `Sound: ${sound.enabled() ? 'on' : 'off'}`; soundBtn.setAttribute('aria-pressed', sound.enabled()); };
  soundLabel();
  addEventListener('house-money:sound', soundLabel);
  addEventListener('storage', e => { if (e.key === sound.KEY) soundLabel(); });
  soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled()); sound.tap(); });

  // Google Drive saving, when it's on: the purse is a button that syncs (a dot on it says how it stands), and the
  // menu says when it last synced, with Sync now beside Sound. One tap signs back in to Google if it has to.
  let pill = bar.querySelector('.purse');
  function driveBits() {
    const on = drive.isOn();
    if (on !== (pill.tagName === 'BUTTON')) {
      const el = document.createElement(on ? 'button' : 'span');
      if (on) { el.type = 'button'; el.addEventListener('click', () => drive.now()); }
      el.className = pill.className;
      el.append(...[...pill.childNodes].filter(n => !n.classList?.contains('dot')));
      if (on) el.insertAdjacentHTML('beforeend', '<i class="dot" aria-hidden="true"></i>');
      pill.replaceWith(el);
      pill = el;
    }
    if (on) {
      pill.dataset.s = drive.status();
      pill.title = drive.title();
      pill.setAttribute('aria-label', `${cage.fmt(cage.read().chips)} chips. ${drive.title()}`);
    }
    const dl = sheet.querySelector('.drive-line');
    dl.textContent = on ? drive.menuLine() : '';
    dl.hidden = !on;
    sheet.querySelector('[data-act="sync"]').hidden = !on;
  }
  drive.watch(driveBits);
  sheet.querySelector('[data-act="sync"]').addEventListener('click', () => drive.now());

  // opens at the top, on the table's name, rather than scrolled down to the first button
  const open = () => { limitsLine(); driveBits(); sheet.showModal(); sheet.scrollTop = 0; sheet.querySelector('h2').focus(); };
  bar.querySelector('.menu-btn').addEventListener('click', open);
  // the × that stays at the top while the sheet scrolls, and the button at the bottom
  sheet.querySelectorAll('[data-act="close"]').forEach(b => b.addEventListener('click', () => sheet.close()));
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

  // The first time you sit down at a table, its menu opens on how to play.
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(SEEN)) || {}; } catch { /* first visit */ }
  if (!seen[id] && !/[?&]seen\b/.test(location.search)) {
    seen[id] = 1;
    try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch { /* off */ }
    open();
  }

  let lineTimer = 0;
  function line(text, kind = '') {
    clearTimeout(lineTimer);
    if (text && cardDue >= 0 && cardRound) text = `${text} ${cardUp()}`.trim();
    say.textContent = text;
    say.className = `say ${kind}`.trim();
  }

  // Moving up a card: the bet that does it goes down mid-round, so the card is announced after that round's own line,
  // once, whichever tab or device gets there first (the cage keeps the highest card announced). "Your player's card
  // goes Silver: bets up to 1,000 here now, and double the limits at every table."
  let cardSeen = cage.tierIndex(), cardDue = -1, cardRound = false;
  addEventListener('house-money:round', () => { if (cardDue >= 0) cardRound = true; });
  function cardMoves(c) {
    const i = cage.tierIndex(c.wagered);
    if (i > cardSeen && i > cage.told()) cardDue = i;
    cardSeen = Math.max(cardSeen, i);
  }
  function cardUp() {
    const i = cardDue;
    cardDue = -1; cardRound = false;
    if (!cage.tell(i)) return '';
    const t = cage.TIERS[i];
    const times = { 2: 'double', 5: 'five times', 10: 'ten times' }[t.limit] || `${t.limit} times`;
    sound.win(2);
    const p = bar.querySelector('.purse');
    p.style.setProperty('--tier', { silver: '#d9dde3', gold: '#f2c33a', black: '#ffffff' }[t.id] || '#f5dc93');
    p.classList.remove('tier-up'); void p.offsetWidth; p.classList.add('tier-up');
    return `Your player’s card goes ${t.name}: bets up to ${cage.fmt(limits().max)} here now, and ${times} the limits at every table.`;
  }
  let held = '';
  function hold(text = '') {
    if (text === held) return;
    if (text) line(text); else if (held && say.textContent === held) line('');
    held = text;
  }

  // Runs once the code that called it has finished, so a bet that's just been taken is counted on the felt (a table
  // takes the chips, then deals and saves) and the offer never flashes up in between.
  let checking = false;
  function check() {
    if (checking) return;
    checking = true;
    queueMicrotask(() => { checking = false; recheck(); });
  }
  function recheck() {
    const offer = cage.canStake(here());
    const why = offer ? '' : stuck();
    if (note.innerHTML !== why) note.innerHTML = why;
    note.hidden = !why;
    if (offer) {
      const n = cage.read().chips;
      stakeBox.firstChild.textContent = `${n ? `You’re down to ${cage.fmt(n)} chip${n === 1 ? '' : 's'}.` : 'You’re out of chips.'} It’s all house money anyway: the cage will stake you another ${cage.fmt(cage.START)}.`;
    }
    stakeBox.hidden = !offer;
    document.body.classList.toggle('broke', offer);
  }
  // Why you can't play here and the cage isn't offering: the chips are out on other tables, or what's in the rack
  // won't cover this table's smallest bet. '' when you can play, or have a bet down here.
  function stuck() {
    if (felt() > 0 || inPlay()) return '';
    const n = cage.read().chips;
    const away = cage.out(here()), there = cage.elsewhere();
    const short = n < min;
    if (!short && !(n < cage.LOW && (away.length || there.length))) return '';
    const me = TABLES.find(t => t.id === id);
    const parts = [];
    if (short && !n) parts.push('Your rack is empty.');
    else if (short) parts.push(me?.slot ?`${name} takes ${cage.fmt(min)} a spin and you have ${cage.fmt(n)}.` : `The smallest bet at ${name} is ${cage.fmt(min)}, and you have ${cage.fmt(n)}.`);
    if (away.length || there.length) {
      // here, then on another device that saves to Google Drive
      const where = [away.length ? outLine(away, '../', { stake: false }) : '', there.length ? elsewhereLine(there, away.length > 0) : ''];
      parts.push(`${where.filter(Boolean).join(' ')} The cage stakes you when nothing’s left out.`);
    } else {
      // somewhere you can play with what you have: the same kind of game first
      const fits = TABLES.filter(t => t.id !== id && t.min <= n);
      const like = fits.filter(t => !!t.slot === !!me?.slot);
      const go = (like.length ? like : fits).slice(0, 3);
      if (go.length) {
        const one = go.length === 1;
        parts.push(`${names(go, '../')} ${go.every(t => t.min === 1) ? (one ? 'takes a chip at a time' : 'take a chip at a time') : (one ? 'starts lower' : 'start lower')}.`);
      }
    }
    return parts.join(' ');
  }

  // The stack, the offer and the table's own buttons follow every change to the chips, whichever tab made it (the
  // table's own onCage waits until it's set up). Chips put down or picked up at another table, in another tab, change
  // what's out on the felt, so those count too.
  let mounted = false;
  cage.watch(c => { cardMoves(c); show(c); limitsLine(); check(); if (mounted) onCage(c); if (drive.isOn()) driveBits(); });
  addEventListener('storage', e => { if (e.key?.startsWith('house-money.') && e.key !== cage.KEY) check(); });
  mounted = true;

  // the offline copy, for anyone who comes straight to a table without passing the floor
  if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});

  return { say: line, hold, limits, check, open, sheet };
}

// The tables as links, in words: "Craps", "Roulette and Craps", "Roulette, Craps and Baccarat". up: the way to the
// floor's folder from the page ('../' at a table, '' on the floor).
export const names = (list, up = '../') => {
  const a = list.map(t => `<a href="${up}${t.id}/">${t.name.replace(/&/g, '&amp;')}</a>`);
  return a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '';
};
// Chips out on the tables, in words: "300 out on Craps", "315 out on Craps and Blackjack" (list: from cage.out();
// still: "300 still out on Craps"). The floor, the tables' notes and Records all say it this way.
export const outWords = (list, up = '../', still = false) =>
  `${cage.fmt(list.reduce((a, t) => a + t.felt, 0))} ${still ? 'still ' : ''}out on ${names(list, up)}`;
// Where the chips are: "300 still out on Craps." With stake (while the cage holds back its stake, under 10 chips),
// "The cage stakes you when nothing’s left out." after it.
export const outLine = (list, up = '../', { stake = true } = {}) =>
  `${outWords(list, up, true)}.${stake ? ' The cage stakes you when nothing’s left out.' : ''}`;

// Chips another device that saves to Google Drive has out on its tables, in words: "Plus 200 on the craps layout on
// another device." (list: from cage.elsewhere(); plus: after a line about this device's own.)
export function elsewhereLine(list, plus = true) {
  const parts = list.map(t => `${cage.fmt(t.felt)} ${t.id === 'craps' || t.id === 'roulette' ? `on the ${t.name.toLowerCase()} layout` : `at ${t.name.replace(/&/g, '&amp;')}`}`);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${plus ? 'Plus ' : ''}${what} on ${list.devices > 1 ? 'your other devices' : 'another device'}.`;
}

// 'a' or 'an' before an amount, the way it's read out: an 8, an 80, an 11, an 18,000; a 25, a 110.
export const article = n => (/^8|^1[18](,\d{3})*$/.test(cage.fmt(n)) ? 'an' : 'a');

// A slot's Spin dims when the bet is more than the stack (after a losing spin at a high bet, say), and this says why:
// "A 25 bet is more than your 12 chips. Play fewer lines or a smaller chip." '' when the bet fits, or when the stack
// won't cover even the smallest bet (the cage's note says so then). fix: what to do about it.
export function overLine(bet, chips, min, fix) {
  if (bet <= chips || chips < min) return '';
  const a = article(bet);
  return `${a[0].toUpperCase()}${a.slice(1)} ${cage.fmt(bet)} bet is more than your ${cage.fmt(chips)} chip${chips === 1 ? '' : 's'}. ${fix}`;
}

// What a round came to, for the end of a result line where some bets came back and others didn't, so it can't read
// like a push: "Down 10 on the spin.", "Up 15.", "Even." (wagered: chips bet; back: chips that came back, stakes
// included; on: words after the amount)
export function netLine(wagered, back, on = '') {
  const n = back - wagered, at = on ? ` ${on}` : '';
  return n > 0 ? `Up ${cage.fmt(n)}${at}.` : n < 0 ? `Down ${cage.fmt(-n)}${at}.` : `Even${at}.`;
}

// The table's own keys. Enter and Space belong to whatever has focus: a button, a link or a rack chip does its own
// thing with them (Clear clears, the floor link goes to the floor, a chip is picked), so a table's Enter or Space
// (deal, roll, spin) only acts when nothing that takes those keys has focus, and not on a key held down.
//   if ((e.key === ' ' || e.key === 'Enter') && hotkey(e)) roll();
export function hotkey(e) {
  if (!shortcut(e) || e.repeat) return false;
  return !e.target?.closest?.('button, a, input, select, textarea, [role=button], [role=radio], [tabindex]');
}
// Letter, number and Backspace keys (H to hit, 1 to 5 to hold, Backspace or Z to undo) don't clash with a focused
// button, so they act anywhere but in a dialog or a box being typed in.
export function shortcut(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return false;
  return !e.target?.closest?.('input, select, textarea');
}

// After a step that hides or dims the button you pressed (Deal, Turn them over, Stand), focus moves on to the button
// that comes next, so a keyboard or screen-reader player doesn't land back at the top of the page. Only when focus was
// in the dock and has been lost (to the page itself, or to a hidden or dimmed button): a tap or a click elsewhere
// since, or focus anywhere else, is left alone. next: the button to go to (the first of a list that can take it).
//   keepFocus($('hit'), $('stand'))
let lastFocus = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', e => { lastFocus = e.target; });
  document.addEventListener('pointerdown', e => { if (!e.target?.closest?.('.dock')) lastFocus = null; }, true);
}
const usable = el => el && !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0;
export function keepFocus(...next) {
  const a = document.activeElement;
  if (!lastFocus?.closest?.('.dock')) return;
  if (a && a !== document.body && a !== lastFocus) return;
  if (a === lastFocus && usable(a)) return;
  const to = next.find(usable);
  if (to && to !== a) to.focus();
}

// A brief flash of the amount won over an element: "+250".
export function float(over, text, kind = 'win') {
  const r = over.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `float ${kind}`;
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// A pause in the dealing. Shorter with reduced motion; ?fast (the tests) makes every pause a blink.
const FAST = /[?&]fast\b/.test(location.search);
export const wait = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 5) : matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.min(ms, 60) : ms));
export const fast = FAST;

// The frame every table sits in: the bar across the top (the way back to the floor, the table's name, your stack and
// the menu), the menu itself (how to play, the limits on your card, sound, records), the line the dealer speaks in,
// and the cage's offer to stake you when you run dry.
//
//   const t = mountTable({ id: 'blackjack', name: 'Blackjack', help: '<p>…</p>', min: 10, max: 500, felt: () => n })
//   t.say('Dealer has 20.')       a line from the dealer
//   t.limits()                    { min, max } on your card
//   t.check()                     shows or hides the stake offer (call after a round settles)

import * as cage from './cage.js';
import * as sound from './sound.js';

const SEEN = 'house-money.seen';

export function mountTable({ id, name, help = '', min = 1, max = 500, felt = () => 0, onStake = () => {} }) {
  const bar = document.querySelector('header.bar') || document.body.insertBefore(document.createElement('header'), document.body.firstChild);
  bar.className = 'bar';
  bar.innerHTML = `
    <a class="back" href="../" aria-label="Back to the floor"><span aria-hidden="true">‹</span> Floor</a>
    <h1 class="name">${name}</h1>
    <span class="purse" aria-live="polite"><span class="chip c100 mini" aria-hidden="true"></span><b id="purse">0</b><span class="vh"> chips</span></span>
    <button type="button" class="menu-btn" aria-label="Menu" aria-haspopup="dialog"><span></span><span></span><span></span></button>`;

  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', `${name}: menu`);
  sheet.innerHTML = `
    <div class="sheet-in">
      <h2>${name}</h2>
      <p class="limits" id="limits"></p>
      <div class="help">${help}</div>
      <div class="sheet-btns">
        <button type="button" class="btn" data-act="close">Back to the table</button>
        <a class="btn ghost" href="../">The floor</a>
        <a class="btn ghost" href="../records/">Records</a>
        <button type="button" class="btn ghost" data-act="sound" aria-pressed="true">Sound: on</button>
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

  const stakeBox = document.createElement('div');
  stakeBox.className = 'stake-offer';
  stakeBox.hidden = true;
  stakeBox.innerHTML = `<p>You're out of chips. It's all house money anyway: the cage will stake you another ${cage.fmt(cage.START)}.</p>
    <button type="button" class="btn gold">Take ${cage.fmt(cage.START)} from the cage</button>`;
  document.body.appendChild(stakeBox);
  stakeBox.querySelector('button').addEventListener('click', () => {
    if (cage.stake(felt())) { sound.chips(8); line(`The cage sends over ${cage.fmt(cage.START)} in chips. Good luck.`); onStake(); }
    check();
  });

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
  cage.watch(c => { show(c); limitsLine(); });

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

  const open = () => { limitsLine(); sheet.showModal(); };
  bar.querySelector('.menu-btn').addEventListener('click', open);
  sheet.querySelector('[data-act="close"]').addEventListener('click', () => sheet.close());
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
    say.textContent = text;
    say.className = `say ${kind}`.trim();
  }

  function check() {
    stakeBox.hidden = !cage.canStake(felt());
    document.body.classList.toggle('broke', !stakeBox.hidden);
  }
  check();
  addEventListener('house-money:cage', () => requestAnimationFrame(check));

  return { say: line, limits, check, open, sheet };
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

// The big moment: a card over the table that counts up to what came in, with coins raining for a big one. Motherlode's
// big wins and its free spins' closing card, Cherry Bell's top prize, three lucky pennies at Odds & Ends and a royal
// flush. A table calls it only once the round is settled and saved, so a reload during the card has nothing to pay.
//
//   await bigWin({ amount: 1000, title: 'Huge win', x: 50 })
//   amount  what came in, counted up to
//   title   the big words ('Big win', 'Jackpot!', 'Royal flush!')
//   x       how many times the bet it is: sets how long it counts and how hard the coins rain
//   kick    a word over the title ('Free spins'), or ''
//   note    a line under the amount ('8 spins · 6 pickaxes'), or ''
//   small   a quiet card: no rain and no pulse (the free spins' closing card when they paid little)
// Resolves when it's put away: a tap, Space (see shown()), or on its own a little after the count is done. Under ?fast
// it's a blink.

import * as cage from './cage.js';
import * as sound from './sound.js';
import { fast } from './table.js';

let box = null;
const $ = id => document.getElementById(id);
function ensure() {
  if (box || typeof document === 'undefined') return box;
  box = document.createElement('div');
  box.className = 'bigwin'; box.id = 'bigwin'; box.hidden = true;
  box.innerHTML = `<canvas id="coins" aria-hidden="true"></canvas>
    <div class="bw-in"><p class="bw-kick" id="bwKick" hidden></p><p class="bw-title" id="bwTitle"></p><p class="bw-amt" id="bwAmt"></p><p class="bw-note" id="bwNote" hidden></p><p class="bw-tap">Tap to carry on</p></div>`;
  document.body.appendChild(box);
  return box;
}
if (typeof document !== 'undefined') { if (document.body) ensure(); else addEventListener('DOMContentLoaded', ensure); }

// whether the card is up (a table's Space puts it away instead of playing on)
export const shown = () => !!box && !box.hidden;
export const dismiss = () => { if (shown()) box.click(); };

export function bigWin({ amount, title, x = 15, kick = '', note = '', small = false }) {
  ensure();
  $('bwTitle').textContent = title;
  $('bwKick').textContent = kick; $('bwKick').hidden = !kick;
  $('bwNote').textContent = note; $('bwNote').hidden = !note;
  box.classList.toggle('small', small);
  box.hidden = false;
  const dur = fast ? 50 : small ? 1600 : Math.min(6000, 2200 + x * 30);
  const cv = $('coins'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const coins = [];
  const rate = small ? 0 : Math.min(14, 3 + x / 10);
  let done = false;
  const t0 = performance.now();
  let last = t0;
  if (!small) { sound.win(3); sound.chips(12); } else if (amount > 0) sound.chips(4);
  return new Promise(resolve => {
    const end = () => { if (done) return; done = true; box.hidden = true; box.removeEventListener('click', end); ctx.clearRect(0, 0, cv.width, cv.height); resolve(); };
    box.addEventListener('click', end);
    const frame = now => {
      if (done) return;
      const t = now - t0, dt = Math.min(50, now - last) / 1000; last = now;
      const k = Math.min(1, t / (dur * .8));
      $('bwAmt').textContent = cage.fmt(Math.round(amount * (1 - (1 - k) ** 2)));
      if (t < dur) for (let i = 0; i < rate; i++) if (Math.random() < .5) coins.push({ x: Math.random() * cv.width, y: -20 * dpr, vx: (Math.random() - .5) * 60 * dpr, vy: (80 + Math.random() * 120) * dpr, r: (7 + Math.random() * 7) * dpr, a: Math.random() * 6, va: 4 + Math.random() * 6 });
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const c of coins) {
        c.vy += 600 * dpr * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
        const sx = Math.abs(Math.cos(c.a));
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.max(.15, sx), 1);
        const g = ctx.createRadialGradient(-c.r * .3, -c.r * .3, 1, 0, 0, c.r);
        g.addColorStop(0, '#fff6c0'); g.addColorStop(.5, '#f2c33a'); g.addColorStop(1, '#9a6a12');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a5008'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        ctx.restore();
      }
      for (let i = coins.length - 1; i >= 0; i--) if (coins[i].y > cv.height + 40) coins.splice(i, 1);
      if (t > dur + 1200) { end(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (fast) setTimeout(end, 60);
  });
}

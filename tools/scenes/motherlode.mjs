// Motherlode's pictures: down in the free spins, four pickaxes stuck to the glass and a fifth just landed, with the
// lines they made drawn across.
import { REELS } from '../../motherlode/js/machine.js';

const aim = stops => stops.map((st, c) => (st + .5) / REELS[c].strip.length);
const rig = seq => `{ const seq = ${JSON.stringify(seq)}; let i = 0; crypto.getRandomValues = a => { a[0] = Math.floor(seq[i++ % seq.length] * 2 ** 32); return a; }; }`;
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function go(page, base) {
  await page.addInitScript(rig(aim([12, 23, 31, 35, 23])));
  await page.goto(`${base}motherlode/?seen`);
  await page.evaluate(() => {
    localStorage.setItem('house-money.cage', JSON.stringify({ chips: 2240, wagered: 18400, high: 2900, stakes: 1 }));
    localStorage.setItem('house-money.motherlode', JSON.stringify({
      bet: 100, felt: 0,
      free: { left: 4, total: 8, won: 385, bet: 100, sticky: [[1, 0], [2, 1], [3, 2], [4, 1]] },
    }));
  });
  await page.reload();
  // the free spins carry on by themselves; catch the moment this one has landed, before the next begins
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('house-money.motherlode'));
    return s?.free?.left === 3 && s?.last?.paid === true;
  }, null, { polling: 30, timeout: 15000 });
  await page.evaluate(() => {
    // hold the next free spin back so the picture can be taken
    const real = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => real(fn, ms >= 500 && ms <= 1500 ? 1e9 : ms, ...a);
  });
  await wait(250);
}

export const tile = { w: 760, y: 114, vh: 800 };

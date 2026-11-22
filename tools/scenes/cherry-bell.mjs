// Cherry Bell's pictures: three bells on three five-chip coins, the bells' row lit on the glass.
import { REELS } from '../../cherry-bell/js/machine.js';
import { weightsOf } from '../../shared/reels.js';

// the draw's random number that lands each reel on the stop wanted (the middle of that stop's share of the weights)
const aim = stops => stops.map((st, c) => {
  const w = weightsOf(REELS[c]), t = w.reduce((a, b) => a + b, 0);
  return (w.slice(0, st).reduce((a, b) => a + b, 0) + w[st] / 2) / t;
});
const rig = seq => `{ const seq = ${JSON.stringify(seq)}; let i = 0; crypto.getRandomValues = a => { a[0] = Math.floor(seq[i++ % seq.length] * 2 ** 32); return a; }; }`;
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function go(page, base) {
  await page.addInitScript(rig(aim([10, 8, 8])));   // bell, bell, bell
  await page.goto(`${base}cherry-bell/?seen`);
  await page.evaluate(async () => {
    // the cage is kept one section per device (shared/ledger.js): this one's, from its totals
    localStorage.setItem('house-money.device', 'd-shots');
    localStorage.setItem('house-money.cage', JSON.stringify((await import('/shared/ledger.js')).cageFrom({ chips: 1185, wagered: 4800, high: 1640, stakes: 1 }, 'd-shots')));
    localStorage.setItem('house-money.cherry-bell', JSON.stringify({ coins: 3, coin: 5, felt: 0 }));
  });
  await page.reload();
  await wait(500);
  await page.click('#spin');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('house-money.cherry-bell'))?.last?.paid === true);
  await wait(1700);
}

export const tile = { w: 480, y: 382, vh: 900 };

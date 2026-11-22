// Odds & Ends' pictures: a spin that pays on four lines at once, all four drawn across the drawer.
import { REELS } from '../../odds-and-ends/js/machine.js';

const aim = stops => stops.map((st, c) => (st + .5) / REELS[c].strip.length);
const rig = seq => `{ const seq = ${JSON.stringify(seq)}; let i = 0; crypto.getRandomValues = a => { a[0] = Math.floor(seq[i++ % seq.length] * 2 ** 32); return a; }; }`;
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function go(page, base) {
  await page.addInitScript(rig(aim([15, 0, 27])));   // keys across the middle, paper clips on the top and both diagonals
  await page.goto(`${base}odds-and-ends/?seen`);
  await page.evaluate(() => {
    localStorage.setItem('house-money.cage', JSON.stringify({ chips: 930, wagered: 3100, high: 1310, stakes: 1 }));
    localStorage.setItem('house-money.odds-and-ends', JSON.stringify({ lines: 5, lineBet: 5, felt: 0 }));
  });
  await page.reload();
  await wait(500);
  await page.click('#spin');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('house-money.odds-and-ends'))?.last?.paid === true);
  await wait(900);
}

export const tile = { w: 760, y: 112, vh: 850 };

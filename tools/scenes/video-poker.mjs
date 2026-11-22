// Video Poker's pictures: three kings held, and the draw brings the fourth: Four of a Kind for 625 on five 5-chip
// coins, its row lit on the pay table.
const wait = ms => new Promise(r => setTimeout(r, ms));
const C = (r, s) => ({ r, s });

export const tile = { w: 600, y: 218, vh: 900 };

export async function go(page, base) {
  await page.goto(`${base}video-poker/?seen`);
  await page.evaluate(async ([hand, deck]) => {
    // the cage is kept one section per device (shared/ledger.js): this one's, from its totals
    localStorage.setItem('house-money.device', 'd-shots');
    localStorage.setItem('house-money.cage', JSON.stringify((await import('/shared/ledger.js')).cageFrom({ chips: 1840, wagered: 9600, high: 2600, stakes: 1 }, 'd-shots')));
    localStorage.setItem('house-money.video-poker.chip', '5');
    localStorage.setItem('house-money.video-poker', JSON.stringify({
      phase: 'draw', coins: 5, coin: 5, hand, deck, held: [true, true, false, true, false], result: null, felt: 25,
    }));
  }, [[C(13, 's'), C(13, 'h'), C(7, 'd'), C(13, 'c'), C(2, 's')], [C(13, 'd'), C(9, 'c'), C(4, 'h'), C(11, 's')]]);
  await page.reload();
  await wait(300);
  await page.click('#deal');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('house-money.video-poker')).paid === true, null, { timeout: 8000 });
  await wait(1700); // the +625 floats away
  // the winning row flashes on the machine; hold it in its lit half for the picture
  await page.addStyleTag({ content: '.paytable tr.hit td { animation: none; color: #fff; background: rgba(255, 228, 92, .35); } .paytable tr.hit td.on { background: #ff3b44; }' });
  await wait(100);
}

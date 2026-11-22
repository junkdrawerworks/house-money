// Roulette's pictures: chips spread over the layout and the ball rigged to land on 17.
// On the phone, the wheel has just stopped over the layout with 17 Black under it; on the wide screen the floor's tile
// is cut from, the wheel stands beside the layout with the dolly on 17 and the winning bets lit.

const wait = ms => new Promise(r => setTimeout(r, ms));

export const tile = { w: 960, vh: 900, y: 58 };

export async function go(page, base) {
  // the spin's draw comes out 17 (wheel.js takes one Uint32 from crypto.getRandomValues)
  await page.addInitScript(() => {
    const own = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = a => {
      if (a instanceof Uint32Array && a.length === 1 && location.pathname.includes('roulette')) { a[0] = 17; return a; }
      return own(a);
    };
  });
  await page.goto(`${base}roulette/?seen`);
  await page.evaluate(() => {
    const bets = { n17: 25, 's17-20': 10, c13: 10, red: 50, d2: 25, st22: 5, n32: 5, 's8-11': 5, col1: 25, c26: 5, n0: 5 };
    const felt = Object.values(bets).reduce((a, b) => a + b, 0);
    localStorage.setItem('house-money.cage', JSON.stringify({ chips: 1450, wagered: 8400, high: 2100, stakes: 1 }));
    localStorage.setItem('house-money.roulette', JSON.stringify({
      bets, last: bets, undo: [], felt, spin: null,
      history: [32, 4, 19, 0, 26, 11, 7, 30, 23, 8, 15, 36, 2, 21],
    }));
  });
  await page.reload();
  await wait(400);
  await page.click('#spin');
  const wide = page.viewportSize().width >= 900;
  // phone: the ball is in (about 5.9 s) and the result shows under the wheel, until it slides away 1.3 s later;
  // wide: a moment later, with the dolly down and the winners lit
  await wait(wide ? 6900 : 6450);
}

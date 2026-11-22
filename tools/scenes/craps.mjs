// Craps' pictures: the point is 6, with a pass line bet and odds behind it, a come bet with odds on the 9, a don't
// come on the 4, place bets on the 5 and 8 and a hard 8. The dice come down 4 and 4, a hard eight: the place 8 and
// the hard 8 both pay, and the stickman calls it.

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function go(page, base) {
  await page.goto(`${base}craps/?seen`);
  await page.evaluate(async () => {
    // the cage is kept one section per device (shared/ledger.js): this one's, from its totals
    localStorage.setItem('house-money.device', 'd-shots');
    localStorage.setItem('house-money.cage', JSON.stringify((await import('/shared/ledger.js')).cageFrom({ chips: 1720, wagered: 5400, high: 2100, stakes: 1 }, 'd-shots')));
    const bets = { pass: 25, passOdds: 100, come9: 25, comeOdds9: 50, dcome4: 10, place5: 25, place8: 30, hard8: 5 };
    localStorage.setItem('house-money.craps', JSON.stringify({
      point: 6, bets, felt: Object.values(bets).reduce((a, v) => a + v, 0), pending: 0, handRolls: 4,
      history: [{ d: [4, 5], t: 9 }, { d: [3, 3], t: 6 }, { d: [5, 6], t: 11 }, { d: [3, 4], t: 7 }, { d: [2, 2], t: 4 }, { d: [6, 4], t: 10 }],
    }));
  });
  await page.reload();
  await wait(300);
  // the dice: the next two draws come up 4 and 4, and the throw's path comes from a fixed sequence
  await page.evaluate(() => {
    const faces = [4, 4];
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = a => { if (faces.length && a instanceof Uint32Array && a.length === 1) { a[0] = faces.shift() - 1; return a; } return real(a); };
    let seed = 7;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  });
  await page.click('#roll');
  // after the winnings have risen off the layout, with the call still up
  await wait(3300);
}

// the floor's picture: on a screen 760 across, the numbers stand six in a row under the dice pit
export const tile = { w: 760, y: 60 };

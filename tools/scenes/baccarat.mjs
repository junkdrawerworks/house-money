// Baccarat's pictures: a shoe well under way on the scoreboard, a Banker and a Banker pair bet down, and the last of the
// first four cards half squeezed up from its corner (a 5 of hearts under a Player 7 and a Banker king).
const wait = ms => new Promise(r => setTimeout(r, ms));
const C = (r, s) => ({ r, s });

export const tile = { w: 480, y: 60, vh: 900 };

export async function go(page, base) {
  await page.goto(`${base}baccarat/?seen`);
  // dealt in order: Player, Banker, Player, Banker, then the Banker's third (the Player stands on 7, the Banker draws on 5)
  const cards = [C(4, 'c'), C(13, 's'), C(3, 'd'), C(5, 'h'), C(3, 's')];
  const road = 'BBPBTPPPBBBBPBPPBTBBPPPBPBBBPTBP'.split('').map((w, i) => ({ w, pp: i === 6, bp: i === 19, p: 0, b: 0 }));
  await page.evaluate(async ([cards, road]) => {
    // the cage is kept one section per device (shared/ledger.js): this one's, from its totals
    localStorage.setItem('house-money.device', 'd-shots');
    localStorage.setItem('house-money.cage', JSON.stringify((await import('/shared/ledger.js')).cageFrom({ chips: 2275, wagered: 18400, high: 3100, stakes: 1 }, 'd-shots')));
    localStorage.setItem('house-money.baccarat.squeeze', 'on');
    localStorage.setItem('house-money.baccarat', JSON.stringify({
      shoe: Array(260).fill({ r: 10, s: 'c' }).concat(cards.reverse()),
      phase: 'bet', bets: { player: 0, banker: 100, tie: 0, pp: 0, bp: 25 }, last: null, coup: null, stage: 0, turned: [],
      road, carry: 0, shuffled: false, felt: 125,
    }));
  }, [cards, road]);
  await page.reload();
  await wait(300);
  await page.click('#deal');
  await page.waitForFunction(() => document.querySelectorAll('.cards .card.live').length === 4, null, { timeout: 8000 });
  // the face-down cards bob gently to say "squeeze me"; still them for the picture
  await page.addStyleTag({ content: '.cards .card.down.live { animation: none; }' });
  for (const sel of ['#pCards .card:nth-child(1)', '#pCards .card:nth-child(2)', '#bCards .card:nth-child(1)']) {
    await page.click(sel, { force: true });
    await wait(450);
  }
  // peel the Banker's second card up from its bottom right corner, and hold it there
  const box = await page.locator('#bCards .card:nth-child(2)').boundingBox();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .68, box.y + box.height * .7, { steps: 10 });
  await wait(200);
}

// Records: the whole floor's totals, then each table's rounds, chips bet, net and biggest win.

import * as cage from '../shared/cage.js';
import * as records from '../shared/records.js';
import { TABLES } from '../shared/tables.js';

const fmt = cage.fmt;
const $ = id => document.getElementById(id);
const day = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

// Words for a table's own counters, where it keeps any.
const EXTRA = {
  blackjack: { blackjacks: 'Blackjacks', won: 'Rounds won' },
  roulette: { straightHits: 'Straight-up hits', zeros: 'Zeros' },
  craps: { pointsMade: 'Points made', longestHand: 'Longest hand (rolls)' },
  baccarat: { player: 'Player wins', banker: 'Banker wins', tie: 'Ties', naturals: 'Naturals' },
  'video-poker': { royal: 'Royal flushes', 'straight-flush': 'Straight flushes', four: 'Four of a kind', 'full-house': 'Full houses' },
  'cherry-bell': { jackpots: 'Jackpots' },
  'odds-and-ends': { jackpots: 'Jackpots' },
  motherlode: { features: 'Free-spin features' },
};

function draw() {
  const r = records.read();
  const c = cage.read();
  $('since').textContent = `Counting since ${day(r.since)}.`;
  let rounds = 0, wagered = 0, net = 0;
  for (const t of TABLES) { const x = records.table(t.id); rounds += x.rounds; wagered += x.wagered; net += x.net; }
  const t = cage.tier(c.wagered);
  $('totals').innerHTML = `
    <div><b>${fmt(c.chips)}</b><span>chips now</span></div>
    <div><b>${fmt(c.high)}</b><span>the most you’ve held</span></div>
    <div><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${signed(net)}</b><span>up or down, all tables</span></div>
    <div><b>${fmt(wagered)}</b><span>chips bet in ${fmt(rounds)} ${rounds === 1 ? 'round' : 'rounds'}</span></div>
    <div><b>${t.name}</b><span>player’s card</span></div>
    <div><b>${fmt(Math.max(0, c.stakes - 1))}</b><span>${c.stakes - 1 === 1 ? 'stake' : 'stakes'} from the cage</span></div>`;
  $('list').innerHTML = TABLES.map(tb => {
    const x = records.table(tb.id);
    const extra = Object.entries(EXTRA[tb.id] || {}).filter(([k]) => x[k] > 0).map(([k, w]) => `<li><span>${w}</span><b>${fmt(x[k])}</b></li>`).join('');
    return `<section class="rec t-${tb.id}">
      <h2><a href="../${tb.id}/">${tb.name}</a></h2>
      ${x.rounds ? `<ul>
        <li><span>Rounds</span><b>${fmt(x.rounds)}</b></li>
        <li><span>Chips bet</span><b>${fmt(x.wagered)}</b></li>
        <li><span>Up or down</span><b class="${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}">${signed(x.net)}</b></li>
        <li><span>Biggest win</span><b>${x.best > 0 ? `${fmt(x.best)} <small>${day(x.bestOn)}</small>` : '—'}</b></li>
        ${extra}
      </ul>` : '<p class="none">Not played yet.</p>'}
    </section>`;
  }).join('');
}

draw();
addEventListener('storage', draw);
addEventListener('house-money:cage', draw);

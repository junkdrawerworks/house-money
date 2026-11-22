// Records: the whole floor's totals, then each table's rounds (in its own word: hands, rolls, spins), chips bet, net
// and biggest win, and its own counters.

import * as cage from '../shared/cage.js';
import * as records from '../shared/records.js';
import { TABLES, units } from '../shared/tables.js';
import { outWords } from '../shared/table.js';

const fmt = cage.fmt;
const $ = id => document.getElementById(id);
const day = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

const { EXTRA } = records;
const cap = w => w[0].toUpperCase() + w.slice(1);

function draw() {
  const r = records.read();
  const c = cage.read();
  $('since').textContent = `Counting since ${day(r.since)}.`;
  let rounds = 0, wagered = 0, net = 0;
  for (const t of TABLES) { const x = records.table(t.id); rounds += x.rounds; wagered += x.wagered; net += x.net; }
  const t = cage.tier(c.wagered);
  const away = cage.out();
  $('totals').innerHTML = `
    <div><b>${fmt(c.chips)}</b><span>chips now</span>${away.length ? `<span class="away">plus ${outWords(away, '../')}</span>` : ''}</div>
    <div><b>${fmt(c.high)}</b><span>the most you’ve held</span></div>
    <div><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${signed(net)}</b><span>up or down, all tables</span></div>
    <div><b>${fmt(wagered)}</b><span>chips bet over ${fmt(rounds)} ${rounds === 1 ? 'play' : 'plays'}</span></div>
    <div><b>${t.name}</b><span>player’s card</span></div>
    <div><b>${fmt(Math.max(0, c.stakes - 1))}</b><span>${c.stakes - 1 === 1 ? 'stake' : 'stakes'} from the cage</span></div>`;
  $('list').innerHTML = TABLES.map(tb => {
    const x = records.table(tb.id);
    const extra = Object.entries(EXTRA[tb.id] || {}).filter(([k]) => x[k] > 0).map(([k, w]) => `<li><span>${w}</span><b>${fmt(x[k])}</b></li>`).join('');
    return `<section class="rec t-${tb.id}">
      <h2><a href="../${tb.id}/">${tb.name}</a></h2>
      ${x.rounds ? `<ul>
        <li><span>${cap(units(tb, 2, { word: true }))}</span><b>${fmt(x.rounds)}</b></li>
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

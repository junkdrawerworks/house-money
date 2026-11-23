// Records: the whole floor's totals, then each table's rounds (in its own word: hands, rolls, spins), chips bet, net
// and biggest win, how this sitting has gone there, and its own counters; then the milestones, and Start over.

import * as cage from '../shared/cage.js';
import * as records from '../shared/records.js';
import { TABLES, units } from '../shared/tables.js';
import { outWords, upDown, outLine, waitLine, elsewhereLine } from '../shared/table.js';
import { drive } from '../shared/sync.js';
import { MILESTONES } from '../shared/milestones.js';

const fmt = cage.fmt;
const $ = id => document.getElementById(id);
const day = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

const { EXTRA } = records;
const cap = w => w[0].toUpperCase() + w.slice(1);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
    ${wagered ? `<div><b>${fmt(wagered)}</b><span>chips bet over ${fmt(rounds)} ${rounds === 1 ? 'play' : 'plays'}</span></div>` : '<div><b>Nothing</b><span>bet yet</span></div>'}
    <div><b>${t.name}</b><span>player’s card</span></div>
    <div><b>${fmt(Math.max(0, c.stakes - 1))}</b><span>${c.stakes - 1 === 1 ? 'stake' : 'stakes'} from the cage</span></div>`;
  $('list').innerHTML = TABLES.map(tb => {
    const x = records.table(tb.id), now = records.sitting(tb.id);
    const extra = Object.entries(EXTRA[tb.id] || {}).filter(([k]) => x[k] > 0).map(([k, w]) => `<li><span>${w}</span><b>${fmt(x[k])}</b></li>`).join('');
    return `<section class="rec t-${tb.id}">
      <h2><a href="../${tb.id}/">${tb.name}</a></h2>
      ${x.rounds ? `<ul>
        <li><span>${cap(units(tb, 2, { word: true }))}</span><b>${fmt(x.rounds)}</b></li>
        <li><span>Chips bet</span><b>${fmt(x.wagered)}</b></li>
        <li><span>Up or down</span><b class="${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}">${signed(x.net)}</b></li>
        <li><span>Biggest win</span><b>${x.best > 0 ? `${fmt(x.best)} <small>${day(x.bestOn)}</small>` : '—'}</b></li>
        ${now.rounds ? `<li><span>This sitting</span><b>${units(tb, now.rounds)}, ${upDown(now.net)}</b></li>` : ''}
        ${extra}
      </ul>` : '<p class="none">Not played yet.</p>'}
    </section>`;
  }).join('');
  // the milestones: greyed until earned, then dated
  const have = records.milestones(), got = MILESTONES.filter(m => have[m.id]).length;
  $('ms').innerHTML = `<h2 id="msH">Milestones <small>${got} of ${MILESTONES.length}</small></h2>
    <ul>${MILESTONES.map(m => `<li class="${have[m.id] ? 'got' : 'not'}"><b>${esc(m.title)}</b><small>${have[m.id] ? day(have[m.id]) : 'Not yet'}</small><span>${esc(m.what)}</span></li>`).join('')}</ul>`;
}

draw();

// Start over, at the foot: the first tap says what goes, and a second starts over. Not while chips are out on a table
// or free spins wait (shared/records.js), and then it says where they are instead.
function overAsk() {
  const ok = records.canStartOver();
  $('overYes').hidden = !ok;
  $('overNo').textContent = ok ? 'Keep everything' : 'Close';
  if (!ok) {
    const away = cage.out(), free = cage.waiting(), there = cage.elsewhere();
    const where = [away.length ? outLine(away, '../', { stake: false }) : '', free.length ? waitLine(free, '../') : '',
      there.length ? elsewhereLine(there, away.length > 0 || free.length > 0) : ''].filter(Boolean).join(' ');
    $('overWhat').innerHTML = `Not while chips are in play. ${where} Play them out or pick them up first.`;
    return;
  }
  const c = cage.read(), card = cage.tier(c.wagered).name, ms = Object.keys(records.milestones()).length;
  $('overWhat').textContent = `Your ${fmt(c.chips)} chip${c.chips === 1 ? '' : 's'}, your ${card} card and every record${ms ? ' and milestone' : ''} go back to the start: ${fmt(cage.START)} chips, a Red card, nothing played.${drive.isOn() ? ' On every device that saves to your Google Drive too.' : ''} Sound, Quick play and the how-to-play sheets stay as they are.`;
}
const asking = on => { $('overAsk').hidden = !on; $('startOver').hidden = on; if (on) { overAsk(); $('overDone').textContent = ''; } };
$('startOver').addEventListener('click', () => { asking(true); ($('overYes').hidden ? $('overNo') : $('overYes')).focus(); });
$('overNo').addEventListener('click', () => { asking(false); $('startOver').focus(); });
$('overYes').addEventListener('click', () => {
  if (!records.startOver()) { overAsk(); return; }
  asking(false);
  $('overDone').textContent = `A fresh start: ${fmt(cage.START)} chips and a Red card.`;
  $('startOver').focus();
});
const again = () => { draw(); if (!$('overAsk').hidden) overAsk(); };

// With Google Drive saving on, Records count every device that saves there, and say where they're kept. Off, at the
// project's own address, a line points to the floor's card that turns it on (nowhere else can it be turned on).
function driveLines() {
  const on = drive.isOn();
  $('every').hidden = !on;
  $('kept').textContent = on ? 'Kept in this browser and in a House Money folder in your Google Drive.' : 'Everything here stays in this browser. Nothing is sent anywhere.';
  $('toDrive').hidden = on || !drive.ready;
}
driveLines();
drive.watch(driveLines);
addEventListener('storage', again);
addEventListener('house-money:cage', again);
addEventListener('house-money:records', again);

// The floor: your chips and player's card, a tile for every table and machine with what you've done there, and the
// way into each. Also registers the offline copy.

import * as cage from '../shared/cage.js';
import * as records from '../shared/records.js';
import * as sound from '../shared/sound.js';
import { TABLES } from '../shared/tables.js';
import { outLine } from '../shared/table.js';

const $ = id => document.getElementById(id);
const fmt = cage.fmt;

function tile(t) {
  const a = document.createElement('a');
  a.className = `tile t-${t.id}`;
  a.href = `${t.id}/`;
  a.id = `at-${t.id}`;
  a.innerHTML = `
    <span class="pic"><img src="floor/${t.id}.jpg" width="600" height="400" alt="" loading="lazy"></span>
    <span class="body">
      <span class="tname">${t.name}</span>
      <span class="what">${t.what}</span>
      <span class="stat" data-stat></span>
      <span class="foot"><span class="lim" data-lim></span><span class="go">Sit down</span></span>
    </span>`;
  return a;
}

for (const t of TABLES) {
  (t.slot || t.id === 'video-poker' ? $('machines') : $('tables')).appendChild(tile(t));
  const hop = document.createElement('a');
  hop.className = 'hop';
  hop.href = `#at-${t.id}`;
  hop.textContent = t.name;
  $('aisle').appendChild(hop);
}
$('aisle').insertAdjacentHTML('beforeend', '<a class="hop alt" href="records/">Records</a>');

function stats() {
  for (const t of TABLES) {
    const r = records.table(t.id);
    const el = document.querySelector(`#at-${t.id} [data-stat]`);
    if (!r.rounds) el.textContent = 'Not played yet';
    else {
      const unit = t.slot || t.id === 'video-poker' ? (r.rounds === 1 ? 'spin' : 'spins') : t.id === 'craps' ? (r.rounds === 1 ? 'roll' : 'rolls') : (r.rounds === 1 ? 'round' : 'rounds');
      const word = t.id === 'video-poker' ? (r.rounds === 1 ? 'hand' : 'hands') : unit;
      el.textContent = `${fmt(r.rounds)} ${word} · ${r.net >= 0 ? 'up' : 'down'} ${fmt(Math.abs(r.net))}${r.best > 0 ? ` · best win ${fmt(r.best)}` : ''}`;
      el.classList.toggle('up', r.net > 0);
    }
    document.querySelector(`#at-${t.id} [data-lim]`).textContent = `Bets ${fmt(t.min)}–${fmt(cage.maxBet(t.max))}`;
  }
}

function wallet(c) {
  $('chips').textContent = fmt(c.chips);
  const t = cage.tier(c.wagered);
  $('tierName').textContent = t.name;
  $('pcard').className = `players-card ${t.id}`;
  const so = c.wagered ? `${fmt(c.wagered)} bet so far.` : 'Nothing bet yet.';
  $('tierLine').textContent = t.next
    ? `${so} ${fmt(t.toNext)} more for ${t.next.name}, with limits ×${t.next.limit}.`
    : `${so} The top card: limits ×${t.limit} at every table.`;
  $('tierBar').style.width = t.next ? `${Math.min(100, ((c.wagered - t.at) / (t.next.at - t.at)) * 100)}%` : '100%';
  $('stake').hidden = !cage.canStake();
  // under 10 with chips still out: no stake yet, and where they are
  const away = c.chips < cage.LOW ? cage.out() : [];
  $('outNote').innerHTML = away.length ? outLine(away, '') : '';
  $('outNote').hidden = !away.length;
  $('tiers').innerHTML = cage.TIERS.map(x => `<li class="${x.id}${x.id === t.id ? ' now' : ''}"><b>${x.name}</b><span>${x.at ? `from ${fmt(x.at)} bet` : 'to start'}</span><span>limits ×${x.limit}</span></li>`).join('');
  $('stakes').textContent = `You started with ${fmt(cage.START)} chips${c.stakes > 1 ? `, and the cage has staked you ${c.stakes - 1 === 1 ? 'once' : `${c.stakes - 1} times`} since` : ''}. The most you’ve held at once: ${fmt(c.high)}.`;
  stats();
}

cage.watch(wallet);
$('stake').addEventListener('click', () => { if (cage.stake()) sound.chips(8); });
$('cardBtn').addEventListener('click', () => { $('card').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('card').focus({ preventScroll: true }); });

const soundBtn = $('sound');
const soundLabel = () => { soundBtn.textContent = `Sound: ${sound.enabled() ? 'on' : 'off'}`; soundBtn.setAttribute('aria-pressed', sound.enabled()); };
soundLabel();
soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled()); soundLabel(); sound.chip(); });
addEventListener('storage', e => {
  if (e.key === sound.KEY) soundLabel();
  if (e.key === records.KEY) stats();
  // a table's felt changed in another tab: the stake and the line under your chips depend on it
  if (TABLES.some(t => e.key === `house-money.${t.id}`)) wallet(cage.read());
});

// A picture that isn't there yet leaves the tile's own colours.
document.querySelectorAll('.tile img').forEach(img => img.addEventListener('error', () => img.remove()));

if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

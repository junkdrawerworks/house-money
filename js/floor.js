// The floor: your chips and player's card, a tile for every table and machine with what you've done there, and the
// way into each. Also registers the offline copy.

import * as cage from '../shared/cage.js';
import * as records from '../shared/records.js';
import * as sound from '../shared/sound.js';
import { TABLES, units } from '../shared/tables.js';
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

// What's waiting at a table: chips on its layout, a hand or a spin not yet paid, or Motherlode's free spins. ''
// when there's nothing. (felt: the chips out there, from cage.out())
function waiting(t, felt) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(`house-money.${t.id}`)); } catch { /* nothing saved */ }
  if (t.id === 'motherlode' && s?.free) return 'Free spins waiting';
  if (!felt) return '';
  if (t.id === 'craps' || t.id === 'roulette') return `${fmt(felt)} on the layout`;
  if (t.slot) return 'A spin not yet paid';
  return s?.phase === 'bet' ? `${fmt(felt)} on the table` : 'A hand in play';
}

function stats() {
  const out = new Map(cage.out().map(x => [x.id, x.felt]));
  for (const t of TABLES) {
    const r = records.table(t.id);
    const el = document.querySelector(`#at-${t.id} [data-stat]`);
    const w = waiting(t, out.get(t.id) || 0);
    const rec = r.rounds ? `${units(t, r.rounds)} · ${r.net >= 0 ? 'up' : 'down'} ${fmt(Math.abs(r.net))}${r.best > 0 ? ` · best win ${fmt(r.best)}` : ''}` : '';
    el.innerHTML = w ? `<b class="waiting">${w}</b>${rec ? ` · ${rec}` : ''}` : rec || 'Not played yet';
    el.classList.toggle('up', !w && r.net > 0);
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
  // chips still out on a table: where they are (and under 10, that the cage holds back its stake till they're in)
  const away = cage.out();
  $('outNote').innerHTML = away.length ? outLine(away, '', { stake: c.chips < cage.LOW }) : '';
  $('outNote').hidden = !away.length;
  $('tiers').innerHTML = cage.TIERS.map(x => `<li class="${x.id}${x.id === t.id ? ' now' : ''}"><b>${x.name}</b><span>${x.at ? `from ${fmt(x.at)} bet` : 'to start'}</span><span>limits ×${x.limit}</span></li>`).join('');
  $('stakes').textContent = `You started with ${fmt(cage.START)} chips${c.stakes > 1 ? `, and the cage has staked you ${c.stakes - 1 === 1 ? 'once' : `${c.stakes - 1} times`} since` : ''}. The most you’ve held at once: ${fmt(c.high)}.`;
  stats();
}

cage.watch(wallet);
$('stake').addEventListener('click', () => { if (cage.stake()) sound.chips(8); });
$('cardBtn').addEventListener('click', () => { $('card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); $('card').focus({ preventScroll: true }); });

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

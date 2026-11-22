// Motherlode on screen: the bet, the spin and auto-spin, winning lines, lanterns lighting free spins, the pickaxes
// sticking through them, and the big-win celebration. The arithmetic is in machine.js; the reels and saving in
// shared/reels.js.

import * as M from './machine.js';
import { ART, icon } from './art.js';
import * as cage from '../../shared/cage.js';
import * as sound from '../../shared/sound.js';
import { mountTable, float, wait, fast, hotkey, overLine, article } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import { ReelSet, loadArt, pickStops, keeper } from '../../shared/reels.js';
import * as seat from '../../shared/seat.js';

const T = byId(M.ID);
const $ = id => document.getElementById(id);
// The bet is spread over twenty lines, so it goes up in twenties.
const BETS = [20, 40, 60, 80, 100, 200, 300, 500, 1000, 2000];
const COLORS = ['#ff5a4a', '#4aa8ff', '#5ad27a', '#ffb02e', '#c070ff', '#ff7ac0', '#2ee0d0', '#f0e040', '#ff8a3a', '#8a9aff',
  '#a0e050', '#ff5080', '#40c0ff', '#e0a0ff', '#ffd080', '#70f0a0', '#ff6040', '#60a0e0', '#d0d040', '#f080f0'];

const keep = keeper(M.ID, { bet: 20, free: null });
const s = keep.state;

const lowNames = ['A', 'K', 'Q', 'J', 'ten'];
const table = mountTable({
  id: M.ID, name: T.name, min: 20, max: T.max, felt: keep.felt, inPlay: () => !!s.free,
  onCage: () => { if (!spinning) paint(); },
  help: `
    <p>Five reels, three rows and twenty lines, all of them always in play, down a gold mine. Your bet is spread across
    the twenty lines, so it goes up in twenties, and each line pays a share of it.</p>
    <h3>What pays</h3>
    <p>Three, four or five of a kind on a line, from the left-hand reel, times a twentieth of your bet:</p>
    <table>
      <tr><th>Symbol</th><th>3 · 4 · 5</th></tr>
      ${['nugget', 'cart', 'dynamite', 'canary', ...lowNames].map(k => `<tr><td>${icon(k, 24)} ${M.NAMES[k]}</td><td>${[3, 4, 5].map(n => cage.fmt(M.PAYS[k][n])).join(' · ')}</td></tr>`).join('')}
    </table>
    <ul>
      <li><b>The pickaxe is wild.</b> It lands on reels 2 to 5 and stands in for anything but the lantern.</li>
      <li><b>Lanterns pay anywhere.</b> Three, four or five lanterns anywhere on the reels pay ${M.SCATTER_PAYS[3]}, ${M.SCATTER_PAYS[4]} or ${M.SCATTER_PAYS[5]} times your whole bet,
      and light up ${M.FREE_SPINS[3]}, ${M.FREE_SPINS[4]} or ${M.FREE_SPINS[5]} free spins.</li>
      <li><b>In the free spins the pickaxes stick.</b> Every pickaxe that lands stays where it is, wild, until the free
      spins are over, so they pile up. The free spins play at the bet that lit them, and they carry on where they left
      off if you leave. When they’re over, a card adds up what they paid.</li>
      <li><b>Auto</b> keeps spinning until you stop it (the button says Stop while it runs), the chips run short, or a big win comes in (free spins that pay 15 times the bet count as one).</li>
    </ul>
    <h3>The long run</h3>
    <p>Motherlode pays back about ${M.RETURN.rtp.toFixed(1)}% of what goes in, more than a quarter of that from the free
    spins. About one spin in ${Math.round(100 / M.RETURN.hit * 2) / 2} wins something, and the lanterns light free spins
    about once every ${M.RETURN.feature} spins.</p>
    <p>The keyboard works too: Space spins.</p>`,
});

let reels, spinning = false, auto = false, shown = { wins: [], at: -1, lit: [] }, cycle = 0, fresh = [];
let hold = [];   // the pickaxes stuck to the glass, drawn over the reels
// Once the free spins are over, the pickaxes that were stuck for the last one, drawn as plain pickaxes (no gold frame)
// over the reels until the next spin: the picture that paid, with nothing still sticking. After a reload too.
let rest = [];
// for the tests (?seen): the pickaxes glowing as new, whether the reels are turning, and the pickaxes stuck and at rest
if (/[?&]seen\b/.test(location.search)) window.__ml = { get fresh() { return fresh; }, get running() { return !!reels?.running; }, get hold() { return hold; }, get rest() { return rest; } };

const lineBet = () => (s.free ? s.free.bet : s.bet) / M.LINE_COUNT;
// The free spin playing now, or the next one between spins: a spin is painted as it starts, before it's taken off
// what's left, and again after.
const freeNo = () => Math.min(s.free.total, s.free.total - s.free.left + 1);
// The line says which free spin it is until something else happens (after a reload, it says how many are left).
let countLine = false;

function paint() {
  const { max } = table.limits();
  const allowed = BETS.filter(b => b <= Math.max(20, max));
  if (!allowed.includes(s.bet)) s.bet = allowed.filter(b => b <= s.bet).pop() || 20;
  const chips = cage.read().chips;
  const i = allowed.indexOf(s.bet);
  const inFree = !!s.free;
  $('bet').textContent = cage.fmt(inFree ? s.free.bet : s.bet);
  $('betDown').disabled = spinning || inFree || i <= 0;
  $('betUp').disabled = spinning || inFree || i >= allowed.length - 1 || allowed[i + 1] > chips;
  $('spin').disabled = spinning || (!inFree && s.bet > chips);
  $('spin').querySelector('span').textContent = inFree ? 'Free' : 'Spin';
  // while Auto runs, the button says what a tap on it does now
  $('auto').textContent = auto ? 'Stop' : 'Auto';
  $('auto').classList.toggle('on', auto);
  table.hold(spinning || inFree ? '' : overLine(s.bet, chips, 20, 'Bet less to keep playing.'));
  $('free').hidden = !inFree;
  document.body.classList.toggle('freeplay', inFree);
  if (inFree) {
    $('freeCount').textContent = `Free spin ${freeNo()} of ${s.free.total}`;
    $('freeWon').textContent = `Won ${cage.fmt(s.free.won)}`;
  }
  table.check();
}

$('betDown').addEventListener('click', () => step(-1));
$('betUp').addEventListener('click', () => step(1));
function step(d) {
  if (spinning || s.free) return;
  const allowed = BETS.filter(b => b <= Math.max(20, table.limits().max));
  const i = Math.max(0, Math.min(allowed.length - 1, allowed.indexOf(s.bet) + d));
  s.bet = allowed[i]; keep.save(); sound.chip(); paint();
}

$('auto').addEventListener('click', () => {
  auto = !auto; sound.tap(); paint();
  if (auto && !spinning) spin();
});

// ---------- the spin ----------

async function spin() {
  if (spinning || seat.guard()) return;   // free spins and Auto stop in a tab that's lost the seat
  const free = !!s.free;
  const bet = free ? s.free.bet : s.bet;
  if (!free && !keep.stake(bet)) { auto = false; table.say('Not enough chips for that bet.'); paint(); return; }
  spinning = true;
  shown = { wins: [], at: -1, lit: [] }; fresh = []; clearInterval(cycle);
  $('paid').innerHTML = '&nbsp;'; $('paid').className = 'paid';
  if (!free) table.say('');
  else if (countLine) table.say(`Free spin ${freeNo()} of ${s.free.total}.`);
  $('reels').setAttribute('aria-label', 'The reels, spinning');
  // which free spin this is, for the line that says how it came out
  const no = free ? [freeNo(), s.free.total] : null;
  paint();

  const sticky = free ? s.free.sticky : [];
  hold = sticky; rest = [];
  const r = M.play(pickStops(M.REELS), sticky);
  const win = r.units * (bet / M.LINE_COUNT);
  // what this spin does to the free spins, decided now and saved with it
  let started = 0, ended = null, picked = [];
  if (free) {
    s.free.left -= 1; s.free.won += win;
    picked = r.picks.filter(([c, rr]) => !sticky.some(p => p[0] === c && p[1] === rr));
    s.free.sticky = r.picks;
    if (s.free.left <= 0) { ended = { ...s.free }; s.free = null; }
  } else if (r.free) {
    started = r.free;
    s.free = { left: r.free, total: r.free, sticky: [], won: 0, bet };
  }
  keep.begin({ stops: r.stops, sticky, win, wagered: free ? 0 : bet, free,
    extra: started ? { features: 1 } : {}, max: { biggest: win, ...(ended ? { feature: ended.won } : {}) } });

  // two lanterns already showing: the reels after them spin on a moment longer
  const tease = [2, 3, 4].filter(c => r.lit.filter(([lc]) => lc < c).length >= 2);
  await reels.spin(r.stops, {
    first: .55, stagger: .22, tease,
    onStop: c => { sound.thunk(); if (r.lit.some(([lc]) => lc === c)) sound.tick(.35); },
  });
  keep.settle();
  spinning = false;
  // the new pickaxes glow once the reels have landed: while they spin, a glow would give away where they'll stop
  if (free) { hold = r.picks; fresh = picked; }
  await show(r, win, bet, { started, ended, free, no });
  paint();
  // free spins play themselves; auto keeps going
  if (s.free || (auto && cage.read().chips >= s.bet)) {
    await wait(s.free ? (started ? 1400 : 700) : 450);
    if (!spinning && (s.free || auto)) spin();
  } else if (auto) { auto = false; paint(); table.say(`Auto stopped: not enough chips for ${article(s.bet)} ${cage.fmt(s.bet)} bet.`); }
}

async function show(r, win, bet, { started, ended, free, no }) {
  shown = { wins: r.wins, at: -1, lit: r.lit.length >= 3 ? r.lit : [] };
  reels.draw();
  describe(r.grid);
  if (fresh.length) sound.chip();
  if (win > 0) {
    $('paid').className = 'paid win';
    $('paid').textContent = `Won ${cage.fmt(win)}`;
    sound.win(win >= bet * 15 ? 3 : win >= bet * 3 ? 2 : 1);
    sound.chips(Math.min(12, 2 + r.wins.length));
    float($('reelBox'), `+${cage.fmt(win)}`);
    if (r.wins.length > 1) {
      cycle = setInterval(() => { shown.at = (shown.at + 1) % shown.wins.length; reels.draw(); }, 1300);
    }
  } else $('paid').innerHTML = '&nbsp;';
  // every spin says how it came out, a losing one too, and in the free spins which spin it was and what stuck
  if (started) table.say(`${r.lit.length} lanterns! ${started} free spins, and the pickaxes stick.`, 'win');
  else if (free) {
    countLine = false;
    const stuck = !fresh.length ? '' : fresh.length === 1 ? ' A pickaxe sticks.' : ` ${fresh.length} pickaxes stick.`;
    const total = ended ? ` The free spins paid ${cage.fmt(ended.won)}.` : '';
    table.say(`Free spin ${no[0]} of ${no[1]}: ${win > 0 ? winWords(r, win) : 'no win'}.${stuck}${total}`, win > 0 || ended?.won ? 'win' : '');
  } else table.say(win > 0 ? `${winWords(r, win, true)}.` : 'No win.', win > 0 ? 'win' : '');
  if (win >= bet * 15) { if (auto && !s.free) auto = false; await celebrate(win, bet); }
  if (ended) {
    // Auto stops for a big feature, as it does for a big win
    if (ended.won >= ended.bet * 15) auto = false;
    // the closing card, after the last spin's own celebration if it had one, then the glass goes back to plain reels
    await celebrate(ended.won, ended.bet, { feature: ended });
    rest = hold; hold = []; fresh = [];
    reels.draw();
  }
}

// What a spin paid, in words: "three mine carts pay 40", "2 lines pay 60", "3 lanterns pay 40" (big: with a capital).
function winWords(r, win, big = false) {
  const lit = r.lit.length >= 3 ? `${r.lit.length} lanterns` : '';
  const lines = r.wins.length === 1 ? lineWord(r.wins[0]).toLowerCase() : r.wins.length ? `${r.wins.length} lines` : '';
  const w = [lines, lit].filter(Boolean).join(' and ');
  return `${big ? w[0].toUpperCase() + w.slice(1) : w} pay ${cage.fmt(win)}`;
}

// The reels' picture, for a screen reader: each row, left to right, with any pickaxes that stick laid over it. "Top
// row: ace, mine cart, pickaxe, 10, lantern. Middle row: …"
const WORDS = { pick: 'pickaxe', lantern: 'lantern', nugget: 'gold nugget', cart: 'mine cart', dynamite: 'dynamite', canary: 'canary', A: 'ace', K: 'king', Q: 'queen', J: 'jack', ten: '10' };
function describe(grid) {
  const rows = ['Top', 'Middle', 'Bottom'].map((n, r) => `${n} row: ${grid.map(col => WORDS[col[r]] || col[r]).join(', ')}.`);
  $('reels').setAttribute('aria-label', rows.join(' '));
}

const plural = { nugget: 'gold nuggets', cart: 'mine carts', dynamite: 'dynamite', canary: 'canaries', A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', ten: 'tens', pick: 'pickaxes' };
const lineWord = w => `${['', '', '', 'Three', 'Four', 'Five'][w.count]} ${plural[w.sym]}`;

// the winning lines and the lanterns, and the sticking pickaxes, drawn over the reels
function decorate(ctx, rs) {
  // sticky pickaxes: the pickaxe in a gold frame, standing over whatever spins under it
  const pick = rs.sprite('pick', false);
  // the free spins over: the last picture's pickaxes as the reels would show them, shaded the same towards the top
  // and bottom of the glass
  if (!rs.running) for (const [c, r] of rest) {
    const b = rs.cellRect(c, r);
    ctx.fillStyle = rs.look.face; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.drawImage(pick, b.x, b.y, b.w, b.h);
    const k = rs.look.shade, g = ctx.createLinearGradient(0, 0, 0, rs.H);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(.18, 'rgba(0,0,0,0)'); g.addColorStop(.82, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`);
    ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
    if (rs.look.lines) { ctx.fillStyle = rs.look.divider; ctx.fillRect(b.x, b.y - .5, b.w, 1); }
  }
  for (const [c, r] of hold) {
    const b = rs.cellRect(c, r);
    ctx.fillStyle = 'rgba(40,20,0,.85)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.drawImage(pick, b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#f2c33a'; ctx.lineWidth = 3; ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  }
  if (rs.running) return;
  for (const [c, r] of fresh) {
    const b = rs.cellRect(c, r);
    ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 3; ctx.shadowColor = '#ffc840'; ctx.shadowBlur = 12;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4); ctx.shadowBlur = 0;
  }
  for (const [c, r] of shown.lit) {
    const b = rs.cellRect(c, r);
    ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 4; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 8); ctx.stroke(); ctx.shadowBlur = 0;
  }
  const list = shown.at < 0 ? shown.wins : [shown.wins[shown.at]];
  for (const w of list) {
    const color = COLORS[w.line % COLORS.length];
    const rows = M.LINES[w.line];
    for (const [c, r] of w.cells) {
      const b = rs.cellRect(c, r);
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, 8); ctx.stroke();
    }
    const pts = rows.map((r, c) => { const b = rs.cellRect(c, r); return [b.x + b.w / 2, b.y + b.h / 2]; });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 7;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 3.5;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  if (shown.at >= 0 && list[0]) {
    const w = list[0];
    ctx.font = '700 13px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center';
    const txt = `Line ${w.line + 1}: ${lineWord(w).toLowerCase()} pay ${cage.fmt(w.pay * lineBet())}`;
    const tw = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.beginPath(); ctx.roundRect(rs.W / 2 - tw / 2, rs.H - 26, tw, 22, 11); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.fillText(txt, rs.W / 2, rs.H - 10);
  }
}

// ---------- the big win ----------

// A big win (15, 40 or 100 times the bet), or the card that closes the free spins (feature: what they came to), with
// "Free spins" over the title when the total is big and as the title when it isn't, and "8 spins · 6 pickaxes" under
// the amount. Coins rain for a big one.
function celebrate(win, bet, { feature = null } = {}) {
  const x = win / bet, big = x >= 15;
  const title = !big ? 'Free spins' : x >= 100 ? 'Motherlode!' : x >= 40 ? 'Huge win' : 'Big win';
  const box = $('bigwin');
  $('bwTitle').textContent = title;
  $('bwKick').hidden = !(feature && big);
  const n = feature?.sticky.length || 0;
  $('bwNote').textContent = feature ? `${feature.total} spins · ${n ? `${n} pickaxe${n === 1 ? '' : 's'}` : 'no pickaxes'}` : '';
  $('bwNote').hidden = !feature;
  box.classList.toggle('small', !big);
  box.hidden = false;
  const dur = fast ? 50 : big ? Math.min(6000, 2200 + x * 30) : 1600;
  const cv = $('coins'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const coins = [];
  const rate = big ? Math.min(14, 3 + x / 10) : 0;
  let done = false, t0 = performance.now(), last = t0;
  if (big) { sound.win(3); sound.chips(12); } else if (win > 0) sound.chips(4);
  return new Promise(resolve => {
    const end = () => { if (done) return; done = true; box.hidden = true; box.removeEventListener('click', end); resolve(); };
    box.addEventListener('click', end);
    const frame = now => {
      if (done) return;
      const t = now - t0, dt = Math.min(50, now - last) / 1000; last = now;
      const k = Math.min(1, t / (dur * .8));
      $('bwAmt').textContent = cage.fmt(Math.round(win * (1 - (1 - k) ** 2)));
      if (t < dur) for (let i = 0; i < rate; i++) if (Math.random() < .5) coins.push({ x: Math.random() * cv.width, y: -20 * dpr, vx: (Math.random() - .5) * 60 * dpr, vy: (80 + Math.random() * 120) * dpr, r: (7 + Math.random() * 7) * dpr, a: Math.random() * 6, va: 4 + Math.random() * 6 });
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const c of coins) {
        c.vy += 600 * dpr * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt;
        const sx = Math.abs(Math.cos(c.a));
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.max(.15, sx), 1);
        const g = ctx.createRadialGradient(-c.r * .3, -c.r * .3, 1, 0, 0, c.r);
        g.addColorStop(0, '#fff6c0'); g.addColorStop(.5, '#f2c33a'); g.addColorStop(1, '#9a6a12');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a5008'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        ctx.restore();
      }
      for (let i = coins.length - 1; i >= 0; i--) if (coins[i].y > cv.height + 40) coins.splice(i, 1);
      if (t > dur + 1200) { end(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (fast) setTimeout(end, 60);
  });
}

$('spin').addEventListener('click', () => spin());
addEventListener('keydown', e => {
  if (e.key === ' ' && hotkey(e)) { e.preventDefault(); if (!$('bigwin').hidden) $('bigwin').click(); else spin(); }
});

// a few lines of the pay table under the reels
$('legend').innerHTML = [
  ['lantern', `<b>3+ anywhere</b> light free spins`],
  ['pick', `<b>Wild</b>, and sticks in free spins`],
  ['nugget', `Five pay <b>${M.PAYS.nugget[5] / M.LINE_COUNT}×</b> the bet`],
  ['cart', `Five pay <b>${M.PAYS.cart[5] / M.LINE_COUNT}×</b>`],
  ['dynamite', `Five pay <b>${M.PAYS.dynamite[5] / M.LINE_COUNT}×</b>`],
  ['canary', `Five pay <b>${(M.PAYS.canary[5] / M.LINE_COUNT).toFixed(1).replace('.0', '')}×</b>`],
].map(([k, t]) => `<li>${icon(k, 30)}<span>${t}</span></li>`).join('');

// ---------- start ----------

(async () => {
  const art = await loadArt(ART);
  reels = new ReelSet($('reels'), {
    reels: M.REELS, rows: M.ROWS, anchor: M.ANCHOR, art, cell: 1.15, gap: 4, pad: .05, speed: 26,
    look: { face: '#1d1814', shade: .45, lines: true, divider: 'rgba(255,220,160,.06)' },
  });
  reels.decorate = decorate;
  const owed = keep.settle();
  if (s.free) hold = s.free.sticky;
  // the free spins ended with the last spin: its pickaxes stay in the picture, plain, until the next spin
  else if (s.last?.free) rest = s.last.sticky || [];
  const stops = s.last?.stops || M.REELS.map(r => r.strip.indexOf('nugget'));
  reels.set(stops);
  describe(M.play(stops, s.last?.sticky || []).grid);
  // said before the first paint, which says instead why Spin is dimmed when the bet is more than the stack
  if (!s.free && !owed) table.say('Set your bet and spin. Three lanterns light up free spins.');
  paint();
  if (owed) { $('paid').className = 'paid win'; $('paid').textContent = `Your last spin paid ${cage.fmt(owed)}`; }
  if (s.free) {
    table.say(`Back down the mine: ${s.free.left} free spin${s.free.left === 1 ? '' : 's'} left.`, 'win');
    countLine = true;
    await wait(1200);
    spin();
  }
})();

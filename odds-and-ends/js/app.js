// Odds & Ends on screen: lines and line bet, the spin, the winning lines drawn across the drawer, and the payout.
// The arithmetic is in machine.js; the reels and saving in shared/reels.js.

import * as M from './machine.js';
import { ART, icon } from './art.js';
import * as cage from '../../shared/cage.js';
import * as sound from '../../shared/sound.js';
import { chipEl } from '../../shared/chips.js';
import { mountTable, float } from '../../shared/table.js';
import { byId } from '../../shared/tables.js';
import { ReelSet, loadArt, pickStops, window as view, evalLines, keeper } from '../../shared/reels.js';

const T = byId(M.ID);
const $ = id => document.getElementById(id);
const COLORS = ['#e8463a', '#2f8fd8', '#3bb26b', '#e9a01c', '#9a4fd0'];
const LINE_BETS = [1, 5, 25, 100, 500];
const LINE_NAMES = ['across the middle', 'across the top', 'across the bottom', 'down from the top left', 'up from the bottom left'];

const keep = keeper(M.ID, { lines: 5, lineBet: 1 });
const s = keep.state;

const plural = { penny: 'lucky pennies', fob: 'key fobs', tape: 'tape measures', key: 'spare keys', battery: 'batteries', menu: 'takeout menus', band: 'rubber bands', clip: 'paper clips' };

const table = mountTable({
  id: M.ID, name: T.name, min: T.min, max: T.max, felt: () => 0,
  help: `
    <p>A slot machine stocked from the kitchen junk drawer: three reels, three rows and five pay lines. Choose how many
    lines to play and what to bet on each, then spin.</p>
    <h3>What pays</h3>
    <p>Three of a kind on a line you're playing, times your bet on that line:</p>
    <table>
      <tr><th>Three</th><th>Pays</th></tr>
      ${M.SYMBOLS.map(k => `<tr><td>${icon(k, 24)} ${M.NAMES[k]}</td><td>${M.PAYS[k][3]}</td></tr>`).join('')}
    </table>
    <ul>
      <li><b>The lucky penny is wild.</b> It stands in for anything, so two keys and a penny pay as three keys. Three
      pennies on a line pay the most.</li>
      <li><b>Five lines:</b> line 1 runs across the middle, 2 across the top, 3 across the bottom, and 4 and 5 are the
      diagonals. The coloured tabs at the sides show which lines you're playing, and a winning line is drawn across the
      drawer.</li>
      <li><b>Every line you play</b> costs your line bet, and every line pays on its own.</li>
    </ul>
    <h3>The long run</h3>
    <p>Odds &amp; Ends pays back about ${M.RETURN.rtp.toFixed(1)}% of what goes in, however many lines you play. On all
    five lines, about one spin in four wins something.</p>
    <p>The keyboard works too: Space spins.</p>`,
});

// ---------- bets ----------

const rackEl = $('rack');
rackEl.className = 'rack';
rackEl.setAttribute('role', 'radiogroup');
rackEl.setAttribute('aria-label', 'Bet per line');
const betBtns = LINE_BETS.map(v => {
  const b = chipEl(v, 'button');
  b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${v} a line`);
  b.addEventListener('click', () => { if (!spinning) { s.lineBet = v; keep.save(); sound.chip(); paint(); } });
  rackEl.appendChild(b);
  return b;
});
$('linesDown').addEventListener('click', () => { if (!spinning && s.lines > 1) { s.lines--; keep.save(); sound.tap(); paint(); } });
$('linesUp').addEventListener('click', () => { if (!spinning && s.lines < 5) { s.lines++; keep.save(); sound.tap(); paint(); } });

const bet = () => s.lines * s.lineBet;
let spinning = false, reels, shown = { wins: [], at: -1 }, cycle = 0;

function paint() {
  const { max } = table.limits();
  const chips = cage.read().chips;
  // the line bet has to fit the table's limit on the lines in play
  const fits = v => v * s.lines <= max;
  if (!fits(s.lineBet)) s.lineBet = LINE_BETS.filter(fits).pop() || 1;
  betBtns.forEach((b, i) => {
    const v = LINE_BETS[i];
    b.hidden = v * 1 > max;
    b.disabled = spinning || !fits(v) || v * s.lines > chips && v !== s.lineBet;
    b.classList.toggle('on', v === s.lineBet);
    b.setAttribute('aria-checked', v === s.lineBet);
  });
  $('lines').textContent = s.lines;
  $('linesDown').disabled = spinning || s.lines <= 1;
  $('linesUp').disabled = spinning || s.lines >= 5 || (s.lines + 1) * s.lineBet > max;
  $('total').innerHTML = `Bet <b>${cage.fmt(bet())}</b>`;
  $('spin').disabled = spinning || bet() > chips;
  tabs();
  table.check();
}

// the coloured tabs beside the reels, one for each line, at the row where it starts (left) and ends (right)
function tabs() {
  if (!reels) return;
  for (const [side, col] of [['tabsL', 0], ['tabsR', 2]]) {
    const el = $(side);
    if (!el.children.length) {
      M.LINES.forEach((l, i) => { const t = document.createElement('span'); t.className = 'tab'; t.textContent = i + 1; t.style.setProperty('--c', COLORS[i]); el.appendChild(t); });
    }
    const atRow = {};
    M.LINES.forEach((l, i) => { (atRow[l[col]] ||= []).push(i); });
    M.LINES.forEach((l, i) => {
      const t = el.children[i];
      const row = l[col], same = atRow[row], k = same.indexOf(i);
      const y = (row + .5) * reels.cellH + (same.length > 1 ? (k - (same.length - 1) / 2) * 24 : 0);
      t.style.top = `${y}px`;
      t.classList.toggle('on', i < s.lines);
      t.classList.toggle('hit', shown.wins.some(w => w.line === i) && (shown.at < 0 || shown.wins[shown.at]?.line === i));
    });
  }
}

// ---------- the spin ----------

async function spin() {
  if (spinning) return;
  const b = bet();
  if (!keep.stake(b)) { table.say('Not enough chips for that bet. Try fewer lines or a smaller chip.'); return; }
  spinning = true;
  shown = { wins: [], at: -1 }; clearInterval(cycle);
  $('paid').innerHTML = '&nbsp;'; $('paid').className = 'paid';
  table.say('');
  paint();
  const stops = pickStops(M.REELS);
  const grid = view(M.REELS, stops, M.ROWS, M.ANCHOR);
  const wins = evalLines(grid, M.LINES.slice(0, s.lines), M.PAYS, { wild: M.WILD });
  const win = wins.reduce((a, w) => a + w.pay, 0) * s.lineBet;
  keep.begin({ stops, lines: s.lines, lineBet: s.lineBet, win, wagered: b, wins: wins.map(w => ({ line: w.line, sym: w.sym, pay: w.pay })),
    extra: wins.some(w => w.sym === M.WILD) ? { pennies: 1 } : {}, max: { biggest: win } });
  await reels.spin(stops, { first: .55, stagger: .28, onStop: () => sound.thunk() });
  keep.settle();
  show(wins, win);
  spinning = false;
  paint();
}

function show(wins, win) {
  shown = { wins, at: -1 };
  reels.draw();
  if (!win) { $('paid').textContent = 'No luck. Try again.'; return; }
  $('paid').className = 'paid win';
  $('paid').textContent = `Won ${cage.fmt(win)}`;
  const big = win >= bet() * 25 ? 3 : win >= bet() * 5 ? 2 : 1;
  sound.win(big); sound.chips(Math.min(12, 3 + wins.length * 2));
  float($('reelBox'), `+${cage.fmt(win)}`);
  table.say(wins.length === 1 ? lineSay(wins[0]) : `${wins.length} lines pay ${cage.fmt(win)}.`, 'win');
  // after a moment, go through the winning lines one at a time
  if (wins.length > 1) {
    cycle = setInterval(() => {
      shown.at = (shown.at + 1) % wins.length;
      table.say(lineSay(wins[shown.at]), 'win');
      reels.draw(); tabs();
    }, 1600);
  }
  tabs();
}

const lineSay = w => `Line ${w.line + 1}, ${LINE_NAMES[w.line]}: three ${plural[w.sym]} pay ${cage.fmt(w.pay * s.lineBet)}.`;

// the winning lines, drawn over the reels
function decorate(ctx, rs) {
  if (!shown.wins.length) return;
  const list = shown.at < 0 ? shown.wins : [shown.wins[shown.at]];
  for (const w of list) {
    const pts = M.LINES[w.line].map((r, c) => { const b = rs.cellRect(c, r); return [b.x + b.w / 2, b.y + b.h / 2]; });
    // the cells that made it
    for (const [c, r] of M.LINES[w.line].map((r, c) => [c, r])) {
      const b = rs.cellRect(c, r);
      ctx.strokeStyle = COLORS[w.line]; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 10); ctx.stroke();
    }
    const ext = [[pts[0][0] - rs.colW / 2, pts[0][1] - (pts[1][1] - pts[0][1]) / 2], ...pts, [pts[2][0] + rs.colW / 2, pts[2][1] + (pts[2][1] - pts[1][1]) / 2]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 9;
    ctx.beginPath(); ext.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = COLORS[w.line]; ctx.lineWidth = 5;
    ctx.beginPath(); ext.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
}

$('spin').addEventListener('click', spin);
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === ' ' && !e.target.closest?.('button, a')) { e.preventDefault(); spin(); }
});
addEventListener('house-money:cage', () => { if (!spinning) paint(); });
addEventListener('resize', () => requestAnimationFrame(tabs));

// the little pay table under the drawer
$('legend').innerHTML = M.SYMBOLS.map(k => `<li${k === M.WILD ? ' class="wild"' : ''}>${icon(k, 26)}<small>×</small>${M.PAYS[k][3]}</li>`).join('');

// ---------- start ----------

(async () => {
  const art = await loadArt(ART);
  reels = new ReelSet($('reels'), {
    reels: M.REELS, rows: M.ROWS, anchor: M.ANCHOR, art, cell: 1, gap: 7, pad: .06, speed: 24,
    look: { face: '#f4ecd9', shade: .12, lines: true, divider: 'rgba(120,80,40,.35)' },
  });
  reels.decorate = decorate;
  const owed = keep.settle();
  if (s.last?.stops) {
    reels.set(s.last.stops);
    if (owed) { $('paid').className = 'paid win'; $('paid').textContent = `Your last spin paid ${cage.fmt(owed)}`; }
  } else reels.set(M.REELS.map(r => (r.strip.indexOf('penny') + r.strip.length - 1) % r.strip.length)); // pennies across the middle
  paint();
  table.say(owed ? '' : 'Pick your lines and your bet, then spin.');
})();

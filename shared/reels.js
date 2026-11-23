// The slot machines' reels: the arithmetic (strips, stops, lines, scatters, what a machine pays back) and a canvas
// that spins them. The arithmetic touches nothing on screen, so the tests can run it in Node.
//
// A machine is a list of reels. A reel is { strip: ['cherry', 'blank', …], weights?: [n, n, …] }: the strip is the
// order the symbols are printed round the reel, and weights (one per stop, default 1) is the "virtual reel": how
// many chances in the draw each stop gets. A spin picks one stop per reel; the window is the rows you can see, read
// down from the stop at `anchor` rows above it (anchor 1 for a three-row window with the pay line in the middle).

import { rand } from './cards.js';
import * as cage from './cage.js';
import * as records from './records.js';
import * as seat from './seat.js';
import * as quick from './quick.js';
import * as sound from './sound.js';

// ---------- the arithmetic ----------

export const weightsOf = reel => reel.weights || reel.strip.map(() => 1);
const totalOf = reel => weightsOf(reel).reduce((a, b) => a + b, 0);

export function pickStop(reel, rng = rand) {
  const w = weightsOf(reel);
  let x = rng() * totalOf(reel);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
}
export const pickStops = (reels, rng = rand) => reels.map(r => pickStop(r, rng));

const mod = (a, n) => ((a % n) + n) % n;

// grid[c][r]: the symbol on reel c, row r (0 at the top).
export function window(reels, stops, rows = 3, anchor = 0) {
  return reels.map((reel, c) => {
    const L = reel.strip.length;
    return Array.from({ length: rows }, (_, r) => reel.strip[mod(stops[c] - anchor + r, L)]);
  });
}

// One line, read left to right: the symbol it pays for, how many in a row, and the pay (times the line bet).
// pays: { sym: { 3: x, 4: y, 5: z } }. wild stands in for anything but the symbols in `not` (the scatter).
// A run of wilds pays as wilds if that's worth more than what they stand in for.
export function evalLine(cells, pays, { wild = null, not = [] } = {}) {
  let sym = null;
  for (const s of cells) { if (s !== wild) { sym = s; break; } }
  let best = { sym: null, count: 0, pay: 0 };
  // as the first real symbol, with wilds standing in
  if (sym && !not.includes(sym) && pays[sym]) {
    let n = 0;
    for (const s of cells) { if (s === sym || (s === wild && wild)) n++; else break; }
    const p = pays[sym][n] || 0;
    if (p > best.pay) best = { sym, count: n, pay: p };
  }
  // as wilds on their own
  if (wild && pays[wild]) {
    let n = 0;
    for (const s of cells) { if (s === wild) n++; else break; }
    const p = pays[wild][n] || 0;
    if (p > best.pay) best = { sym: wild, count: n, pay: p };
  }
  return best;
}

// Every winning line on a grid. lines: [[row on reel 0, row on reel 1, …], …]. Returns [{ line, sym, count, pay, cells }].
export function evalLines(grid, lines, pays, opts) {
  const wins = [];
  lines.forEach((rows, i) => {
    const cells = rows.map((r, c) => grid[c][r]);
    const w = evalLine(cells, pays, opts);
    if (w.pay > 0) wins.push({ line: i, ...w, cells: rows.slice(0, w.count).map((r, c) => [c, r]) });
  });
  return wins;
}

// Where the scatters are on a grid, wherever they landed.
export function scatters(grid, sym) {
  const at = [];
  grid.forEach((col, c) => col.forEach((s, r) => { if (s === sym) at.push([c, r]); }));
  return at;
}

// The chance of each symbol on one reel at any one row (the same for every row: the stop is uniform over the strip
// by weight, and each row is a fixed step from it).
export function symbolOdds(reel) {
  const w = weightsOf(reel), t = totalOf(reel), out = {};
  reel.strip.forEach((s, i) => { out[s] = (out[s] || 0) + w[i] / t; });
  return out;
}

// What one line pays back on average, in line bets, exactly: reels are independent and each cell of a line is one
// row of one reel, so every line, whatever its shape, comes to the same.
export function lineReturn(reels, pays, opts) {
  const odds = reels.map(symbolOdds);
  const syms = odds.map(o => Object.keys(o));
  let ev = 0, hit = 0;
  const cells = [];
  (function walk(c, p) {
    if (c === reels.length) {
      const w = evalLine(cells, pays, opts);
      ev += p * w.pay; if (w.pay > 0) hit += p;
      return;
    }
    for (const s of syms[c]) { cells[c] = s; walk(c + 1, p * odds[c][s]); cells.pop(); }
  })(0, 1);
  return { ev, hit };
}

// The chance of seeing n scatters across the window, exactly (each reel's count from its own strip, then combined).
export function scatterOdds(reels, sym, rows = 3) {
  let dist = [1];
  for (const reel of reels) {
    const L = reel.strip.length, w = weightsOf(reel), t = totalOf(reel);
    const here = [];
    for (let i = 0; i < L; i++) {
      let n = 0;
      for (let r = 0; r < rows; r++) if (reel.strip[mod(i + r, L)] === sym) n++;
      here[n] = (here[n] || 0) + w[i] / t;
    }
    const next = [];
    dist.forEach((p, a) => here.forEach((q, b) => { if (q) next[a + b] = (next[a + b] || 0) + p * q; }));
    dist = next.map(x => x || 0);
  }
  return dist;
}

// A small seeded generator, for tests and screenshots that must come out the same every time.
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the canvas ----------

// Symbol art comes in as SVG text, one per symbol, drawn into a cache at the cell's size on screen (so it's sharp at
// any pixel ratio), along with a smeared copy for when the reel is moving fast.
export async function loadArt(svgs) {
  const out = {};
  await Promise.all(Object.entries(svgs).map(([k, svg]) => new Promise(res => {
    const img = new Image();
    img.onload = () => { out[k] = img; res(); };
    img.onerror = () => res();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  })));
  return out;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const HURRY = .16, HURRY_GAP = .07;   // a hurried reel's landing, and the gap between one and the next (seconds)
const FAST = typeof location !== 'undefined' && /[?&]fast\b/.test(location.search);

// ReelSet: the reels drawn on a canvas that fills its parent.
//   new ReelSet(canvas, { reels, rows, anchor, art, cell: h/w, pad, look })
//   rs.set(stops)                    stands the reels still at those stops
//   await rs.spin(stops, { onStop }) spins them and stops each in turn, left to right
//   rs.hurry()                       lands the reels still spinning at once (a second tap on Spin, or on the reels)
//   rs.decorate = ctx => {}          drawn over the reels every frame (win lines, sticky wilds)
//   rs.cellRect(c, r)                where a cell is, in CSS pixels
export class ReelSet {
  constructor(canvas, { reels, rows = 3, anchor = 0, art, cell = 1, gap = 6, pad = 0.08, look = {}, speed = 22, blank = 'blank' }) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.reels = reels; this.rows = rows; this.anchor = anchor; this.art = art;
    this.cellAspect = cell; this.gap = gap; this.pad = pad; this.speed = speed; this.blank = blank;
    this.look = { face: '#fbf7ec', faceEdge: '#d9cfb8', shade: .55, divider: 'rgba(0,0,0,.25)', ...look };
    this.pos = reels.map(() => 0);
    this.vel = reels.map(() => 0);
    this.decorate = null;
    this.cache = {};
    this.running = false;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    ro?.observe(canvas.parentElement || canvas);
    this.resize();
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const n = this.reels.length;
    const w = Math.max(60, box.width);
    const colW = (w - this.gap * (n - 1)) / n;
    const cellH = colW * this.cellAspect;
    const h = cellH * this.rows;
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    Object.assign(this, { W: w, H: h, colW, cellH, dpr });
    this.cache = {};
    this.draw();
  }

  sprite(sym, blur) {
    const key = `${sym}|${blur ? 1 : 0}`;
    if (this.cache[key]) return this.cache[key];
    const img = this.art[sym];
    const cw = Math.round(this.colW * this.dpr), ch = Math.round(this.cellH * this.dpr);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    if (img) {
      const g = cv.getContext('2d');
      const p = this.pad * Math.min(cw, ch);
      const box = Math.min(cw, ch) - p * 2;
      const x = (cw - box) / 2, y = (ch - box) / 2;
      if (blur) {
        // the symbol smeared up and down the reel, as it looks going by
        const n = 7;
        for (let i = 0; i < n; i++) {
          g.globalAlpha = 0.22;
          g.drawImage(img, x, y + (i - (n - 1) / 2) * ch * 0.07, box, box);
        }
      } else g.drawImage(img, x, y, box, box);
    }
    this.cache[key] = cv;
    return cv;
  }

  set(stops) { this.pos = stops.slice(); this.vel = this.vel.map(() => 0); this.draw(); }

  // A second tap: every reel still in its steady spin lands at once, left to right a moment apart so each still
  // thunks; one already landing finishes its own way. The result was picked before the reels moved, so this changes
  // nothing but the wait. true if it hurried any.
  hurry() {
    if (!this.running || !this.plan) return false;
    const t = (performance.now() - this.t0) / 1000;
    let k = 0;
    for (const pl of this.plan) if (pl && !pl.done && pl.h === undefined && t < pl.t1) pl.h = t + HURRY_GAP * k++;
    if (k) this.onHurry?.();
    return k > 0;
  }

  cellRect(c, r) {
    return { x: c * (this.colW + this.gap), y: r * this.cellH, w: this.colW, h: this.cellH };
  }

  draw() {
    const { ctx, dpr, W, H, colW, cellH } = this;
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.reels.forEach((reel, c) => {
      const x = c * (colW + this.gap);
      const L = reel.strip.length;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, 0, colW, H); ctx.clip();
      // the reel's face
      ctx.fillStyle = this.look.face; ctx.fillRect(x, 0, colW, H);
      // pos: the strip index at the anchor row; the strip comes down from the top
      const p = this.pos[c] - this.anchor;
      const base = Math.floor(p), frac = p - base;
      const blur = Math.abs(this.vel[c]) > 6;
      for (let r = -1; r <= this.rows; r++) {
        const sym = reel.strip[mod(base + r, L)];
        const y = (r - frac) * cellH;
        if (sym !== this.blank) ctx.drawImage(this.sprite(sym, blur), x, y, colW, cellH);
        if (this.look.lines) { ctx.fillStyle = this.look.divider; ctx.fillRect(x, y - .5, colW, 1); }
      }
      // the curve of the reel: darker towards the top and bottom
      if (this.look.shade) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const k = this.look.shade;
        g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(.18, 'rgba(0,0,0,0)');
        g.addColorStop(.82, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`);
        ctx.fillStyle = g; ctx.fillRect(x, 0, colW, H);
        const s = ctx.createLinearGradient(x, 0, x + colW, 0);
        s.addColorStop(0, 'rgba(0,0,0,.18)'); s.addColorStop(.15, 'rgba(255,255,255,.05)');
        s.addColorStop(.85, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(0,0,0,.2)');
        ctx.fillStyle = s; ctx.fillRect(x, 0, colW, H);
      }
      ctx.restore();
    });
    if (this.decorate) { ctx.save(); this.decorate(ctx, this); ctx.restore(); }
  }

  // Spins every reel to its stop. A reel listed in `hold` stays put. onStop(c) as each one lands. `full` keeps the
  // first spin its whole length under Quick play (Motherlode's free spins).
  spin(stops, { onStop = () => {}, first = 0.75, stagger = 0.32, hold = [], tease = [], full = false } = {}) {
    const n = this.reels.length;
    if (FAST || reduced()) {
      this.set(stops);
      for (let c = 0; c < n; c++) if (!hold.includes(c)) onStop(c);
      return Promise.resolve();
    }
    // Quick play: the reels stop half as far apart, and a tease is half as long. The first spin is half as long too
    // (not a free spin's), and then each reel lands just when it's meant to: otherwise it would spin on to its stop's
    // next time round, up to a whole turn of the reel later, which is most of the wait. The difference is made up in
    // one jump once the reel is a blur.
    const q = quick.enabled() ? .5 : 1;
    const exact = q < 1 && !full;
    if (exact) first *= q;
    const V = this.speed, ACC = 0.12, LAND = 0.3;
    const DB = V * LAND / 4.7;           // the landing's length, so its first speed matches the spin's
    const plan = this.reels.map((reel, c) => {
      if (hold.includes(c)) return null;
      const L = reel.strip.length;
      const start = this.pos[c];
      const extra = tease.filter(t => t <= c).length * 1.1 * q;   // a reel that might make a big win spins on a moment longer (and the ones after it wait)
      const want = first + c * stagger * q + extra;
      // the landing starts DB cells short of the stop; the steady spin before it lasts at least `want` (exactly
      // `want` under Quick play, with the reel jumped on by `jump` cells as it comes up to speed)
      if (exact) {
        const jump = mod(start - stops[c] - DB - V * (want - ACC / 2), L);
        return { start, target: stops[c], d: V * (want - ACC / 2) + jump, t1: want, jump, L, done: false };
      }
      let d = mod(start - stops[c] - DB, L);
      while ((d + V * ACC / 2) / V < want) d += L;
      const t1 = (d + V * ACC / 2) / V;
      return { start, target: stops[c], d, t1, jump: 0, L, done: false };
    });
    this.running = true;
    this.plan = plan;
    // the reels' soft whir while they turn, and a rising tone while a teased reel spins on
    const left = () => plan.filter(pl => pl && !pl.done).length;
    const whir = sound.whir(left());
    this.onHurry = whir.calm;
    const land = (c, t) => {
      whir.reels(left());
      const next = plan.findIndex((pl, k) => k > c && pl && !pl.done);
      if (next >= 0 && tease.includes(next) && plan[next].h === undefined) whir.rise(plan[next].t1 + LAND - t);
    };
    return new Promise(resolve => {
      const t0 = this.t0 = performance.now();
      const frame = now => {
        const t = (now - t0) / 1000;
        let busy = false;
        plan.forEach((pl, c) => {
          if (!pl || pl.done) return;
          let pos, vel;
          if (pl.h !== undefined && t >= pl.h) {
            // hurried: straight onto its stop, settling down onto it
            const u = Math.min(1, (t - pl.h) / HURRY);
            pos = pl.target + .35 * (1 - u) ** 2; vel = 0;
            if (u >= 1) { pl.done = true; this.pos[c] = pl.target; this.vel[c] = 0; onStop(c); land(c, t); return; }
          } else if (t < ACC) { pos = pl.start - V * t * t / (2 * ACC); vel = V * t / ACC; }
          else if (t < pl.t1) { pos = pl.start - V * (t - ACC / 2) - pl.jump; vel = V; }
          else {
            const u = Math.min(1, (t - pl.t1) / LAND);
            const c1 = 1.70158, c3 = c1 + 1;
            const e = 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2;
            pos = pl.start - pl.d - DB * e;
            vel = V * (1 - u);
            if (u >= 1) { pos = pl.target; vel = 0; pl.done = true; this.pos[c] = mod(pos, pl.L); this.vel[c] = 0; onStop(c); land(c, t); return; }
          }
          this.pos[c] = mod(pos, pl.L); this.vel[c] = vel;
          busy = true;
        });
        this.draw();
        if (busy) requestAnimationFrame(frame);
        else { this.running = false; this.plan = null; this.onHurry = null; whir.stop(); resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }
}

// A strip from symbol counts, laid out in a fixed shuffled order (the same every time: seeded), with chosen symbols
// kept at least `apart` stops from their own kind round the reel (so a scatter can't show twice in one window).
export function spread(counts, seed = 1, apart = {}) {
  const base = [];
  for (const [s, n] of Object.entries(counts)) for (let i = 0; i < n; i++) base.push(s);
  for (let tries = 0; tries < 5000; tries++) {
    const rng = seeded(seed * 7919 + tries);
    const a = base.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const L = a.length;
    let ok = true;
    for (let i = 0; i < L && ok; i++) {
      // no symbol twice in a row, and the spaced ones further apart
      const gap = apart[a[i]] || 2;
      for (let k = 1; k < gap; k++) if (a[(i + k) % L] === a[i]) { ok = false; break; }
    }
    if (ok) return a;
  }
  throw new Error('spread: no layout fits');
}

// ---------- a machine's saved state and its payouts ----------


// The state a machine keeps under house-money.<id>: its own settings, plus `last`, the spin most recently played.
// A spin is worked out and saved (unpaid) before the reels move, and paid when they stop; a spin still unpaid when
// the page opens (it closed mid-spin) is paid then. So a reload never pays twice and never loses a win.
// `felt` is the bet in a spin not yet paid: it's still out on the machine, so the cage won't stake you over it, and
// the floor and other tabs read it from here. felt() is the same, live, counting a bet from the moment it's taken.
export function keeper(id, defaults = {}) {
  const KEY = `house-money.${id}`;
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* first visit */ }
  if (typeof s !== 'object' || Array.isArray(s)) s = {};
  const state = { ...defaults, ...s };
  let holding = 0;   // a bet taken for a spin that hasn't begun yet (the few lines between stake and begin)
  const felt = () => holding + (state.last && !state.last.paid ? state.last.wagered || 0 : 0);
  const save = () => { state.felt = felt(); seat.write(KEY, state); };
  // pays the last spin if it hasn't been (and no other tab has played this machine since); returns what it paid
  const settle = () => {
    const l = state.last;
    if (!l || l.paid || seat.guard()) return 0;
    l.paid = true;
    save();
    if (l.win > 0) cage.pay(l.win);
    records.note(id, { wagered: l.wagered || 0, back: l.win || 0, extra: l.extra || {}, max: l.max || {}, marks: l.marks || [] });
    return l.win || 0;
  };
  // the bet off the stack for a new spin (free spins pass 0); false if there aren't enough chips
  const stake = n => {
    if (seat.guard()) return false;
    if (!(n > 0)) return true;
    holding = n;          // counted as out before the cage tells anyone the chips have gone
    if (cage.take(n)) return true;
    holding = 0;
    return false;
  };
  // records a spin before the reels move
  const begin = spin => { holding = 0; state.last = { ...spin, paid: false }; save(); };
  return { state, save, settle, stake, begin, felt };
}

// The wheel, drawn on a canvas: a wooden bowl, the ball track with its eight diamonds, 37 pockets in single-zero
// order, and the turret in the middle. spin() turns the wheel one way and sends the ball round the other, slows it,
// drops it off the track, bounces it over the frets and settles it in the pocket already chosen.
//
// Angles: 0 is straight up, clockwise is positive. A pocket's angle is the wheel's angle plus its place in ORDER.

import { ORDER, color } from './wheel.js';

const TAU = Math.PI * 2;
const STEP = TAU / 37;
const COLORS = { red: '#b8212b', black: '#1a1a1d', green: '#11804a' };
const mod = (a, m = TAU) => ((a % m) + m) % m;
const lerp = (a, b, k) => a + (b - a) * k;

// Geometry, as fractions of the wheel's radius.
const G = { rim: 1, track: .9, trackIn: .78, ball: .036, num: .75, pocketOut: .655, pocketIn: .5, cone: .5, turret: .12 };

export class Wheel {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.angle = 0;             // the wheel
    this.ball = null;           // { a: absolute angle, r: radius fraction } or null
    this.rest = null;           // the pocket index the ball sits in at rest
    this.spinning = false;
    this.coast = null;          // the wheel still turning after a spin: { t0, w0, omega }
    this.onTick = null;
    this.size();
  }

  size() {
    const r = this.c.getBoundingClientRect();
    const d = Math.min(devicePixelRatio || 1, 2);
    const px = Math.max(10, Math.round(Math.min(r.width, r.height || r.width) * d));
    if (this.c.width !== px) { this.c.width = px; this.c.height = px; this.face = null; }
    this.draw();
  }

  // The parts that turn with the wheel, drawn once to their own canvas and rotated.
  paintFace() {
    const S = this.c.width, R = S / 2;
    const f = document.createElement('canvas');
    f.width = f.height = S;
    const x = f.getContext('2d');
    x.translate(R, R);
    // pockets: a coloured ring with the numbers, and the darker pockets inside
    for (let i = 0; i < 37; i++) {
      const n = ORDER[i];
      const a0 = i * STEP - STEP / 2 - Math.PI / 2, a1 = a0 + STEP;
      x.beginPath();
      x.arc(0, 0, R * G.num, a0, a1);
      x.arc(0, 0, R * G.pocketIn, a1, a0, true);
      x.closePath();
      x.fillStyle = COLORS[color(n)];
      x.fill();
      // the pocket floor, a little darker and inset
      x.beginPath();
      x.arc(0, 0, R * G.pocketOut, a0, a1);
      x.arc(0, 0, R * G.pocketIn, a1, a0, true);
      x.closePath();
      x.fillStyle = 'rgba(0,0,0,.28)';
      x.fill();
      // the number, standing upright from the middle
      x.save();
      x.rotate(i * STEP);
      x.fillStyle = '#f6f0de';
      x.font = `700 ${Math.round(R * .085)}px Figtree, system-ui, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(n), 0, -R * ((G.num + G.pocketOut) / 2) - R * .004);
      x.restore();
    }
    // frets: thin silver lines between the pockets
    x.strokeStyle = '#d9d6cf';
    x.lineWidth = Math.max(1, R * .008);
    for (let i = 0; i < 37; i++) {
      const a = i * STEP - STEP / 2 - Math.PI / 2;
      x.beginPath();
      x.moveTo(Math.cos(a) * R * G.pocketIn, Math.sin(a) * R * G.pocketIn);
      x.lineTo(Math.cos(a) * R * G.num, Math.sin(a) * R * G.num);
      x.stroke();
    }
    x.beginPath(); x.arc(0, 0, R * G.num, 0, TAU); x.lineWidth = R * .012; x.strokeStyle = '#c9a24c'; x.stroke();
    x.beginPath(); x.arc(0, 0, R * G.pocketOut, 0, TAU); x.lineWidth = Math.max(1, R * .006); x.strokeStyle = '#d9d6cf'; x.stroke();
    // the cone: polished wood down to the turret
    const cone = x.createRadialGradient(-R * .12, -R * .14, R * .02, 0, 0, R * G.cone);
    cone.addColorStop(0, '#b77a45'); cone.addColorStop(.55, '#7a4523'); cone.addColorStop(1, '#3f200f');
    x.beginPath(); x.arc(0, 0, R * G.cone, 0, TAU); x.fillStyle = cone; x.fill();
    x.beginPath(); x.arc(0, 0, R * G.cone, 0, TAU); x.lineWidth = R * .014; x.strokeStyle = '#c9a24c'; x.stroke();
    // four gold spokes and the turret
    x.strokeStyle = '#d8b25a'; x.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      x.save(); x.rotate(k * TAU / 4 + STEP / 2);
      x.lineWidth = R * .03;
      x.beginPath(); x.moveTo(0, -R * G.turret * .6); x.lineTo(0, -R * .4); x.stroke();
      x.beginPath(); x.arc(0, -R * .4, R * .035, 0, TAU); x.fillStyle = '#e8c870'; x.fill();
      x.restore();
    }
    const tur = x.createRadialGradient(-R * .03, -R * .04, 0, 0, 0, R * G.turret);
    tur.addColorStop(0, '#fff3c4'); tur.addColorStop(.5, '#d9b45a'); tur.addColorStop(1, '#7d5a1a');
    x.beginPath(); x.arc(0, 0, R * G.turret, 0, TAU); x.fillStyle = tur; x.fill();
    this.face = f;
  }

  draw() {
    const x = this.x, S = this.c.width, R = S / 2;
    if (!this.face) this.paintFace();
    x.clearRect(0, 0, S, S);
    x.save();
    x.translate(R, R);
    // the bowl: wooden rim and the ball track
    const rim = x.createRadialGradient(0, 0, R * G.track, 0, 0, R);
    rim.addColorStop(0, '#2b140a'); rim.addColorStop(.35, '#6b3a1d'); rim.addColorStop(.7, '#8d5128'); rim.addColorStop(1, '#3a1b0c');
    x.beginPath(); x.arc(0, 0, R * .995, 0, TAU); x.fillStyle = rim; x.fill();
    const track = x.createRadialGradient(0, 0, R * G.trackIn, 0, 0, R * G.track);
    track.addColorStop(0, '#2a1a12'); track.addColorStop(.6, '#4a2d1c'); track.addColorStop(1, '#1d0f08');
    x.beginPath(); x.arc(0, 0, R * G.track, 0, TAU); x.fillStyle = track; x.fill();
    x.beginPath(); x.arc(0, 0, R * G.track, 0, TAU); x.lineWidth = R * .01; x.strokeStyle = '#c9a24c'; x.stroke();
    // the eight diamonds on the track
    for (let k = 0; k < 8; k++) {
      x.save(); x.rotate(k * TAU / 8 + TAU / 16);
      x.beginPath();
      const rr = R * (G.track + G.trackIn) / 2;
      x.moveTo(0, -rr - R * .035); x.lineTo(R * .018, -rr); x.lineTo(0, -rr + R * .035); x.lineTo(-R * .018, -rr); x.closePath();
      x.fillStyle = '#e9e4d6'; x.fill();
      x.restore();
    }
    // the part that turns
    x.beginPath(); x.arc(0, 0, R * G.trackIn, 0, TAU); x.fillStyle = '#120806'; x.fill();
    x.save();
    x.rotate(this.angle);
    x.drawImage(this.face, -R, -R);
    x.restore();
    // the ball
    let ball = this.ball;
    if (!ball && this.rest !== null) ball = { a: this.angle + this.rest * STEP, r: (G.pocketOut + G.pocketIn) / 2 + .01 };
    if (ball) {
      const bx = Math.sin(ball.a) * R * ball.r, by = -Math.cos(ball.a) * R * ball.r;
      x.beginPath(); x.arc(bx + R * .008, by + R * .012, R * G.ball, 0, TAU); x.fillStyle = 'rgba(0,0,0,.35)'; x.fill();
      const g = x.createRadialGradient(bx - R * .012, by - R * .014, R * .004, bx, by, R * G.ball);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#e8e6e0'); g.addColorStop(1, '#a9a59a');
      x.beginPath(); x.arc(bx, by, R * G.ball, 0, TAU); x.fillStyle = g; x.fill();
    }
    x.restore();
  }

  // The wheel's angle at time t (ms) while it coasts after a push.
  coastAngle(t) {
    const c = this.coast;
    if (!c) return this.angle;
    const s = (t - c.t0) / 1000;
    return c.w0 + c.omega * c.tau * (1 - Math.exp(-s / c.tau));
  }

  // Spins to the pocket for n over `ms` milliseconds. Resolves when the ball has settled.
  spin(n, ms = 6500) {
    const idx = ORDER.indexOf(n);
    const now = performance.now();
    // give the wheel a fresh push, from wherever it is
    const w0 = this.coastAngle(now);
    this.coast = { t0: now, w0, omega: TAU * .42, tau: 7 };
    const land = .86;                         // share of the spin before the ball is in its pocket
    const tLand = now + ms * land;
    const end = idx * STEP;                   // the ball's angle on the wheel once it's in
    // where the ball starts: on the track, wherever it was
    const startAbs = this.ball ? this.ball.a : (this.rest !== null ? w0 + this.rest * STEP : w0 + Math.PI);
    const rel0 = startAbs - w0;
    const D = mod(rel0 - end) + TAU * 7;      // how far it travels round the wheel, against the turn
    this.rest = null;
    this.spinning = true;
    let lastPocket = null;
    return new Promise(resolve => {
      const frame = t => {
        const wa = this.coastAngle(t);
        this.angle = wa;
        const v = Math.min(1, (t - now) / (tLand - now));
        // the ball's place on the wheel: fast at first, slowing to a stop in its pocket
        const e = 1 - (1 - v) ** 2.4;
        let rel = end + D * (1 - e);
        let r;
        if (v < .62) {
          r = G.track - G.ball - .012;                       // riding the track's wall
        } else {
          const k = (v - .62) / .38;                         // falling, then bouncing over the frets
          const base = lerp(G.track - G.ball - .012, (G.pocketOut + G.pocketIn) / 2 + .01, Math.min(1, k * 1.6));
          const hop = Math.abs(Math.sin(k * 15)) * .06 * (1 - k) ** 1.5;
          r = base + (k > .35 ? hop : 0);
          rel += Math.sin(k * 23) * .22 * (1 - k) ** 2 * (k > .35 ? 1 : 0);
          // a click each time it crosses a fret down among the pockets
          const pocket = Math.floor(mod(rel + STEP / 2) / STEP);
          if (k > .3 && pocket !== lastPocket && lastPocket !== null) this.onTick?.(.3 * (1 - k) + .05);
          lastPocket = pocket;
        }
        this.ball = { a: wa + rel, r };
        this.draw();
        if (v < 1) requestAnimationFrame(frame);
        else {
          this.ball = null; this.rest = idx; this.spinning = false;
          this.draw();
          this.coasting();
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  // Lets the wheel turn on slowly after the ball is in, with the ball riding along, until it's nearly still.
  coasting() {
    if (this.coastRaf) return;
    const go = t => {
      if (this.spinning) { this.coastRaf = 0; return; }
      this.angle = this.coastAngle(t);
      this.draw();
      const s = (t - this.coast.t0) / 1000;
      if (s < 30 && this.c.isConnected) this.coastRaf = requestAnimationFrame(go);
      else this.coastRaf = 0;
    };
    this.coastRaf = requestAnimationFrame(go);
  }

  // Puts the ball in a pocket with no animation (a reload, or ?fast).
  place(n) {
    this.rest = n === null || n === undefined ? null : ORDER.indexOf(n);
    this.ball = null;
    this.draw();
  }
}

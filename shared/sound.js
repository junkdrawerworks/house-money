// Every sound on the floor, made on the spot with Web Audio (no files to load). One switch for the whole casino,
// kept under KEY, and every open tab follows it.

export const KEY = 'house-money.sound';

let ctx = null;
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
addEventListener('storage', e => { if (e.key === KEY) on = e.newValue !== 'off'; });

export const enabled = () => on;
export function setEnabled(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* off */ }
  dispatchEvent(new CustomEvent('house-money:sound', { detail: on }));
}

function ac() {
  if (!on) return null;
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c, dur) {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; return s;
}

function burst({ dur = .05, freq = 3000, q = 1, gain = .3, type = 'bandpass', at = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const s = noise(c, dur), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur + .02);
}

function tone({ freq = 440, dur = .15, type = 'sine', gain = .15, at = 0, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
}

// A chip set down on the felt (clay on clay: two quick clicks).
export const chip = () => { burst({ dur: .035, freq: 4200, q: 3, gain: .35 }); burst({ dur: .03, freq: 3100, q: 4, gain: .2, at: .035 }); };
// A stack of chips pushed across.
export const chips = (n = 4) => { for (let i = 0; i < n; i++) burst({ dur: .03, freq: 3200 + Math.random() * 1600, q: 3, gain: .22, at: i * .045 + Math.random() * .01 }); };
// A card sliding off the shoe (`at`: seconds from now, for a card dealt after others).
export const card = ({ at = 0 } = {}) => burst({ dur: .09, freq: 1800, q: .7, gain: .25, type: 'highpass', at });
// A card turned over.
export const flip = () => burst({ dur: .05, freq: 2600, q: 1.2, gain: .25 });
// Dice hitting the back wall and tumbling.
export const dice = () => { for (let i = 0; i < 7; i++) burst({ dur: .03, freq: 1400 + Math.random() * 900, q: 5, gain: .3 * (1 - i / 9), at: i * .07 + Math.random() * .03 }); };
// The roulette ball ticking over the frets (slowing): call it with how far into the spin you are.
export const tick = (vol = .2) => burst({ dur: .02, freq: 5200, q: 6, gain: vol });
// A slot reel stopping.
export const thunk = () => { tone({ freq: 140, dur: .12, type: 'triangle', gain: .25, slide: .6 }); burst({ dur: .04, freq: 900, q: 2, gain: .2 }); };
// Winning: a little rising figure, bigger for bigger wins (1 to 3).
export function win(size = 1) {
  const notes = [523, 659, 784, 1047, 1319];
  const n = size >= 3 ? 5 : size >= 2 ? 4 : 3;
  for (let i = 0; i < n; i++) tone({ freq: notes[i], dur: .22, type: 'triangle', gain: .12, at: i * .09 });
}
// Losing: one soft low note.
export const lose = () => tone({ freq: 196, dur: .3, type: 'sine', gain: .1, slide: .8 });
// Push / a bet back.
export const push = () => tone({ freq: 440, dur: .12, type: 'sine', gain: .08 });
// A button.
export const tap = () => burst({ dur: .015, freq: 2000, q: 2, gain: .12 });

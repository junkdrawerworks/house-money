// Quick play: one switch for the whole floor that shortens the waits that are only animation (the roulette wheel, the
// slot reels' stagger, the craps throw, the pauses in the dealing). Every result is settled and saved before its
// animation starts, so it changes only the drawing. Off to start with; kept under KEY, and every open tab follows it.

export const KEY = 'house-money.quick';

let on = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();
if (typeof addEventListener === 'function') addEventListener('storage', e => { if (e.key === KEY) { on = e.newValue === 'on'; dispatchEvent(new CustomEvent('house-money:quick', { detail: on })); } });

export const enabled = () => on;
export function setEnabled(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* off */ }
  dispatchEvent(new CustomEvent('house-money:quick', { detail: on }));
}
// Runs fn now and whenever the switch changes, in this tab or another.
export function watch(fn) {
  addEventListener('house-money:quick', () => fn(on));
  fn(on);
}

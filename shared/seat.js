// One live tab per table. Each table keeps its round in memory and saves the whole of it over house-money.<id>, so two
// tabs at the same table would each play from their own copy: a bet put down in one vanished when the other saved, and
// a hand dealt once could be drawn and paid in both. So the tab that opens a table last takes the seat, and any other
// tab at that table goes idle under a note ("Blackjack is open in another tab.") with a Play here button, which
// reloads it: the table is read afresh from what was saved, and the seat comes back to it.
//
// Belt and braces, for a message that comes late or not at all: every save goes through write(), which stamps the
// state with a rev of this tab's own, and before anything moves chips the table asks guard(). If another tab has saved
// the table since this one last read or wrote it, guard() says no, and reloads the page to pick up what was saved
// (or, when this tab is idle, leaves it to Play here). An idle tab never saves.
//
//   sit({ id, name })          from mountTable: claims the seat for this tab
//   write(key, s)              saves s under key with a fresh rev; false (nothing saved) while idle
//   guard()                    true when this tab mustn't act: idle, or another tab has saved the table since
//
// The claim goes out on a BroadcastChannel, or, where there isn't one (Safari before 15.4), as a write to PING, which
// other tabs hear as a storage event. A tab never hears its own claim, so a tab on its own never idles.

const CHANNEL = 'house-money';
export const PING = 'house-money.seat';
const TAB = Math.random().toString(36).slice(2, 10);

let table = null;         // { id, name } once seated
let idle = false;
let known;                // the rev this tab last read or wrote for its table
let broken = false;       // the last save didn't go in (storage full or off): nothing to compare against
let n = 0;

const keyOf = id => `house-money.${id}`;
function stored() {
  try { return JSON.parse(localStorage.getItem(keyOf(table.id))); } catch { return undefined; }
}

export function sit({ id, name }) {
  table = { id, name };
  known = stored()?.rev;
  const at = Date.now();
  const claim = { table: id, tab: TAB, at };
  // another tab at this table that opened later (or at the same moment, by a coin toss on the tab ids) has the seat
  const heard = m => {
    if (!m || m.table !== id || m.tab === TAB) return;
    if (m.at > at || (m.at === at && m.tab > TAB)) leave();
  };
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = e => heard(e.data);
    channel.postMessage(claim);
  } catch { channel = null; }
  if (!channel) {
    addEventListener('storage', e => {
      if (e.key !== PING || !e.newValue) return;
      try { heard(JSON.parse(e.newValue)); } catch { /* not a claim */ }
    });
    try { localStorage.setItem(PING, JSON.stringify(claim)); } catch { /* storage off: nothing to share a seat over */ }
  }
  // Back to a page kept whole in the browser's history: read the table afresh, and take the seat again.
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  // Every tap, press and key on the table asks first (the bar and the menu stay usable).
  for (const type of ['pointerdown', 'click', 'keydown']) {
    addEventListener(type, e => {
      if (e.target instanceof Element && e.target.closest('header.bar, dialog')) return;
      if (guard()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }
}

export function write(key, s) {
  if (idle) return false;
  s.rev = `${TAB}.${++n}`;
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { broken = true; return false; }
  broken = false;
  if (table && key === keyOf(table.id)) known = s.rev;
  return true;
}

// Has another tab saved this table since this one last read or wrote it?
function moved() {
  if (!table || broken) return false;
  const st = stored();
  return st !== undefined && (st?.rev) !== known;
}

export function guard() {
  if (idle) return true;
  if (!moved()) return false;
  location.reload();
  return true;
}

function leave() {
  if (idle) return;
  idle = true;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const box = document.createElement('dialog');
  box.className = 'seat-idle';
  box.setAttribute('aria-labelledby', 'seatIdle');
  box.innerHTML = `
    <p id="seatIdle"><b>${table.name.replace(/&/g, '&amp;')} is open in another tab.</b></p>
    <p>One tab plays a table at a time. Play here to pick it up in this one.</p>
    <div class="seat-btns">
      <button type="button" class="btn gold">Play here</button>
      <a class="btn ghost" href="../">The floor</a>
    </div>`;
  box.addEventListener('cancel', e => e.preventDefault());   // Escape doesn't put it away: only Play here does
  box.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(box);
  box.showModal();
}

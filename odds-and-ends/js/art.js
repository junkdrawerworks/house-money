// Odds & Ends' symbols: what's in the kitchen junk drawer, drawn as SVG (100 × 100) in a flat sticker style with a
// soft shadow, so they read on the drawer's paper liner.

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><filter id="d" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#3b2a1a" flood-opacity=".35"/></filter></defs>
  <g filter="url(#d)">${body}</g></svg>`;
const INK = '#3b2a1a';

export const ART = {
  // wild: a copper penny with a four-leaf clover stamped on it
  penny: svg(`
    <circle cx="50" cy="50" r="38" fill="#c8733a" stroke="#7a3f17" stroke-width="3"/>
    <circle cx="50" cy="50" r="31" fill="none" stroke="#e7a06a" stroke-width="2" stroke-dasharray="2 3"/>
    <g fill="#9a5222" transform="translate(50 47)">
      <circle cx="-8" cy="-8" r="8.5"/><circle cx="8" cy="-8" r="8.5"/><circle cx="-8" cy="8" r="8.5"/><circle cx="8" cy="8" r="8.5"/>
      <path d="M2 10 C6 18 8 22 14 26" fill="none" stroke="#9a5222" stroke-width="3.5" stroke-linecap="round"/>
    </g>
    <path d="M24 32 C32 20 46 15 58 17" fill="none" stroke="#f4c49a" stroke-width="5" stroke-linecap="round" opacity=".8"/>
    <text x="50" y="82" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="11" letter-spacing="2" fill="#f7d7b6">LUCKY</text>`),
  // a car key fob: black rubber, three buttons, a ring
  fob: svg(`
    <circle cx="50" cy="16" r="10" fill="none" stroke="#9aa2ab" stroke-width="4"/>
    <rect x="44" y="22" width="12" height="10" rx="3" fill="#6b737c"/>
    <path d="M30 34 C30 28 70 28 70 34 L72 82 C72 92 28 92 28 82 Z" fill="#26282c" stroke="#101114" stroke-width="2.5"/>
    <path d="M34 36 C40 33 60 33 66 36" fill="none" stroke="#4a4e55" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="48" r="7" fill="#3b3f46" stroke="#5c626b" stroke-width="1.5"/>
    <path d="M47 49 V46 a3 3 0 0 1 6 0 V49 M46 49 h8 v5 h-8z" fill="none" stroke="#cfd5dc" stroke-width="1.6"/>
    <circle cx="50" cy="65" r="7" fill="#3b3f46" stroke="#5c626b" stroke-width="1.5"/>
    <path d="M47 65 V62 a3 3 0 0 1 6 0 M46 65 h8 v5 h-8z" fill="none" stroke="#cfd5dc" stroke-width="1.6"/>
    <rect x="43" y="76" width="14" height="6" rx="3" fill="#c0262d"/>`),
  // a yellow tape measure with a bit of tape pulled out
  tape: svg(`
    <path d="M58 64 H92 V76 H58 Z" fill="#f4e7a6" stroke="${INK}" stroke-width="2"/>
    <g stroke="${INK}" stroke-width="1.6"><path d="M64 64 v5 M70 64 v3 M76 64 v5 M82 64 v3 M88 64 v5"/></g>
    <rect x="89" y="62" width="5" height="16" rx="1" fill="#8e949c" stroke="${INK}" stroke-width="1.5"/>
    <rect x="10" y="24" width="56" height="56" rx="14" fill="#f6c21c" stroke="${INK}" stroke-width="3"/>
    <circle cx="38" cy="52" r="15" fill="#2b2b2e"/>
    <circle cx="38" cy="52" r="6" fill="#8e949c"/>
    <rect x="18" y="74" width="40" height="8" rx="3" fill="#2b2b2e"/>
    <path d="M18 34 C22 28 30 27 40 27" fill="none" stroke="#fff1a8" stroke-width="4" stroke-linecap="round"/>`),
  // a brass spare key
  key: svg(`
    <circle cx="30" cy="50" r="20" fill="#e2b444" stroke="#7a5a12" stroke-width="3"/>
    <circle cx="25" cy="50" r="6" fill="#f6efd8" stroke="#7a5a12" stroke-width="2"/>
    <path d="M48 44 H90 V52 H86 L84 60 L80 54 L76 60 L72 54 L68 62 L64 54 L60 58 L56 52 H48 Z" fill="#e2b444" stroke="#7a5a12" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 47 H88" stroke="#b88c22" stroke-width="1.5"/>
    <path d="M17 38 C22 33 30 31 36 32" fill="none" stroke="#fbe7a6" stroke-width="3.5" stroke-linecap="round"/>`),
  // an AA battery, lying at a tilt
  battery: svg(`
    <g transform="rotate(-30 50 50)">
      <rect x="14" y="36" width="66" height="28" rx="5" fill="#1f2a36" stroke="#0d1218" stroke-width="2.5"/>
      <rect x="54" y="36" width="26" height="28" fill="#e98a24"/>
      <rect x="54" y="36" width="26" height="28" rx="0" fill="none" stroke="#0d1218" stroke-width="2.5"/>
      <rect x="80" y="43" width="8" height="14" rx="2" fill="#b8bec6" stroke="#0d1218" stroke-width="2"/>
      <rect x="10" y="40" width="5" height="20" rx="1.5" fill="#b8bec6" stroke="#0d1218" stroke-width="1.5"/>
      <path d="M64 46 v8 M60 50 h8" stroke="#1f2a36" stroke-width="2.5" stroke-linecap="round"/>
      <text x="35" y="55" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-weight="900" font-size="13" fill="#e8edf2">AA</text>
      <path d="M18 40 H76" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/>
    </g>`),
  // a folded takeout menu with a noodle bowl on the front
  menu: svg(`
    <path d="M14 22 L40 16 L40 84 L14 90 Z" fill="#c9302c" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M40 16 L64 22 L64 90 L40 84 Z" fill="#f2ead8" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M64 22 L88 16 L88 84 L64 90 Z" fill="#e5dcc6" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <g stroke="#9a8f7a" stroke-width="2.2" stroke-linecap="round"><path d="M45 32 h14 M45 40 h12 M45 48 h14 M45 56 h10 M45 64 h14 M45 72 h11"/><path d="M69 30 h14 M69 38 h10 M69 46 h14 M69 54 h12 M69 62 h14"/></g>
    <path d="M18 54 H37 C37 64 32 68 27.5 68 C23 68 18 64 18 54 Z" fill="#f2ead8"/>
    <path d="M21 52 C24 48 28 48 30 52 M26 52 C28 47 33 47 34 51" fill="none" stroke="#f6d36b" stroke-width="2"/>
    <path d="M30 34 L36 48 M33 33 L38 46" stroke="#f2ead8" stroke-width="2" stroke-linecap="round"/>`),
  // a rubber band, twisted once
  band: svg(`
    <path d="M22 44 C14 26 40 18 52 30 C60 38 64 44 76 40 C90 36 92 58 80 66 C66 74 56 62 48 58 C38 54 30 74 18 66 C8 58 26 54 22 44 Z" fill="none" stroke="#c8462b" stroke-width="7" stroke-linejoin="round"/>
    <path d="M22 44 C14 26 40 18 52 30 C60 38 64 44 76 40" fill="none" stroke="#f08a6a" stroke-width="2" stroke-linecap="round"/>`),
  // a silver paper clip
  clip: svg(`
    <g transform="rotate(-38 50 50)">
      <path d="M36 70 V30 a10 10 0 0 1 20 0 V66 a6 6 0 0 1 -12 0 V36" fill="none" stroke="#5f6b78" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M36 70 V30 a10 10 0 0 1 20 0 V66 a6 6 0 0 1 -12 0 V36" fill="none" stroke="#c9d2dc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M36 70 V30 a10 10 0 0 1 20 0 V66 a6 6 0 0 1 -12 0 V36" fill="none" stroke="#f4f7fa" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1 -1)"/>
    </g>`),
};

export const icon = (sym, size = 28) => ART[sym].replace('<svg ', `<svg width="${size}" height="${size}" aria-hidden="true" `);

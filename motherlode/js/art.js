// Motherlode's symbols, drawn as SVG (100 × 100): a gold mine by lamplight. The high symbols are drawn objects; the
// card ranks are stamped into little iron plates nailed to timber.

const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".45" stop-color="#f2c33a"/><stop offset="1" stop-color="#a8701a"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef2"/><stop offset=".5" stop-color="#9aa4ae"/><stop offset="1" stop-color="#5a646e"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4a22"/><stop offset=".5" stop-color="#b47a3e"/><stop offset="1" stop-color="#6a3c18"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/><stop offset=".4" stop-color="#ffc840" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a00" stop-opacity="0"/></radialGradient>
  ${defs}</defs>${body}</svg>`;
const INK = '#1e130b';

// a rank plate: iron, riveted, with the rank stamped in its colour
const plate = (txt, color, size = 50) => svg(`
  <rect x="14" y="16" width="72" height="70" rx="10" fill="#3a3e44" stroke="${INK}" stroke-width="3"/>
  <rect x="18" y="20" width="64" height="62" rx="7" fill="url(#plateg)"/>
  <g fill="#8a9098" stroke="${INK}" stroke-width="1"><circle cx="23" cy="25" r="2.6"/><circle cx="77" cy="25" r="2.6"/><circle cx="23" cy="77" r="2.6"/><circle cx="77" cy="77" r="2.6"/></g>
  <text x="50" y="${50 + size * .35}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}" fill="${INK}" opacity=".55" transform="translate(1.5 2)">${txt}</text>
  <text x="50" y="${50 + size * .35}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}" fill="${color}" stroke="${INK}" stroke-width="1.5" paint-order="stroke">${txt}</text>`,
  '<linearGradient id="plateg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b7179"/><stop offset="1" stop-color="#43484f"/></linearGradient>');

export const ART = {
  // wild: a pickaxe with a gold-edged head, glowing
  pick: svg(`
    <circle cx="50" cy="50" r="46" fill="url(#glow)" opacity=".55"/>
    <path d="M28 90 L66 30" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
    <path d="M28 90 L66 30" stroke="url(#wood)" stroke-width="7" stroke-linecap="round"/>
    <path d="M12 38 C30 14 64 6 90 20 C76 18 62 22 54 30 L50 26 C40 28 24 32 12 38 Z" fill="url(#steel)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M90 20 C80 30 74 40 72 54 C70 44 66 38 60 34 Z" fill="url(#steel)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="55" y="24" width="14" height="14" rx="2" transform="rotate(32 62 31)" fill="url(#gold)" stroke="${INK}" stroke-width="2.5"/>
    <path d="M16 36 C30 22 52 14 74 15" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
    <text x="50" y="96" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="13" letter-spacing="3" fill="#ffe27a" stroke="${INK}" stroke-width="3" paint-order="stroke">WILD</text>`),
  // scatter: a miner's lantern, lit
  lantern: svg(`
    <circle cx="50" cy="56" r="44" fill="url(#glow)"/>
    <path d="M38 14 C38 4 62 4 62 14" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M38 14 C38 4 62 4 62 14" fill="none" stroke="#c9a24a" stroke-width="2"/>
    <rect x="32" y="14" width="36" height="10" rx="3" fill="#2f3439" stroke="${INK}" stroke-width="2.5"/>
    <path d="M34 24 H66 L70 70 H30 Z" fill="#ffe7a0" fill-opacity=".85" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 34 C58 44 58 54 50 60 C42 54 42 44 50 34 Z" fill="#ff9a1a"/>
    <path d="M50 42 C54 48 54 53 50 57 C46 53 46 48 50 42 Z" fill="#fff6c0"/>
    <g stroke="#2f3439" stroke-width="3"><path d="M40 24 L37 70 M60 24 L63 70"/></g>
    <rect x="26" y="70" width="48" height="12" rx="3" fill="#2f3439" stroke="${INK}" stroke-width="2.5"/>
    <rect x="30" y="73" width="40" height="3" fill="#c9a24a"/>`),
  // a heap of gold nuggets
  nugget: svg(`
    <circle cx="50" cy="56" r="40" fill="url(#glow)" opacity=".45"/>
    <path d="M14 74 C10 62 20 52 30 54 C30 44 44 38 52 44 C58 34 76 36 80 48 C92 50 94 66 86 74 C70 82 30 82 14 74 Z" fill="url(#gold)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30 54 C34 62 44 66 52 62 M52 44 C54 52 62 58 72 56 M80 48 C80 56 84 62 88 64" fill="none" stroke="#a8701a" stroke-width="2.5"/>
    <g fill="#fffbe0"><path d="M38 50 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2z"/><path d="M68 42 l1.5 -4.5 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5z"/></g>
    <path d="M22 64 C24 60 28 58 32 59" fill="none" stroke="#fff6c8" stroke-width="3" stroke-linecap="round"/>`),
  // a mine cart full of ore on rails
  cart: svg(`
    <path d="M6 88 H94" stroke="#6b7178" stroke-width="4"/>
    <path d="M14 92 v-4 M30 92 v-4 M46 92 v-4 M62 92 v-4 M78 92 v-4" stroke="#5a3a1c" stroke-width="5"/>
    <path d="M22 44 C26 30 40 26 50 32 C60 24 76 30 78 44 Z" fill="url(#gold)" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="38" cy="38" r="5" fill="#fff2a8" opacity=".7"/>
    <path d="M14 42 H86 L78 76 H22 Z" fill="#8a4a2a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M18 50 H82 M20 62 H80" stroke="#5a2e18" stroke-width="2.5"/>
    <g fill="#c9cdd2" stroke="${INK}" stroke-width="1"><circle cx="20" cy="46" r="2.2"/><circle cx="80" cy="46" r="2.2"/><circle cx="26" cy="72" r="2.2"/><circle cx="74" cy="72" r="2.2"/></g>
    <circle cx="32" cy="80" r="8" fill="#3a3e44" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="80" r="2.5" fill="#9aa4ae"/>
    <circle cx="68" cy="80" r="8" fill="#3a3e44" stroke="${INK}" stroke-width="3"/><circle cx="68" cy="80" r="2.5" fill="#9aa4ae"/>`),
  // three sticks of dynamite, the fuse lit
  dynamite: svg(`
    <g stroke="${INK}" stroke-width="2.5">
      <rect x="22" y="36" width="18" height="54" rx="4" fill="#c8242c"/>
      <rect x="41" y="32" width="18" height="58" rx="4" fill="#d8323a"/>
      <rect x="60" y="36" width="18" height="54" rx="4" fill="#c8242c"/>
    </g>
    <path d="M25 40 V84 M44 36 V84 M63 40 V84" stroke="#ff8a8a" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
    <rect x="18" y="56" width="64" height="9" rx="2" fill="#d9c08a" stroke="${INK}" stroke-width="2"/>
    <path d="M50 32 C50 22 58 18 64 14" fill="none" stroke="#3a2a1a" stroke-width="3" stroke-linecap="round"/>
    <circle cx="66" cy="12" r="9" fill="url(#glow)"/>
    <g stroke="#fff3b0" stroke-width="2" stroke-linecap="round"><path d="M66 4 v-2 M74 12 h2 M66 20 v2 M58 12 h-2 M72 6 l1.5 -1.5 M60 6 l-1.5 -1.5"/></g>
    <circle cx="66" cy="12" r="3.5" fill="#fff"/>`),
  // a canary on its perch
  canary: svg(`
    <path d="M14 78 H86" stroke="url(#wood)" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 60 C26 42 40 26 56 28 C68 30 74 40 72 52 C82 54 90 60 92 66 C80 66 72 66 66 68 C58 76 40 78 30 60 Z" fill="#f8d22a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 56 C46 48 56 48 62 56 C56 62 46 64 40 56 Z" fill="#e5b414" stroke="${INK}" stroke-width="2"/>
    <path d="M30 40 L18 42 L28 48 Z" fill="#f29a1c" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="40" cy="38" r="4.5" fill="${INK}"/><circle cx="41.5" cy="36.5" r="1.4" fill="#fff"/>
    <path d="M48 70 L46 78 M56 70 L56 78" stroke="#f29a1c" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 32 C48 30 54 30 58 32" fill="none" stroke="#fff3a0" stroke-width="3" stroke-linecap="round"/>`),
  A: plate('A', '#e24a3a'),
  K: plate('K', '#3a8ee0'),
  Q: plate('Q', '#3fb46a'),
  J: plate('J', '#c06ae0'),
  ten: plate('10', '#f0a028', 42),
};

export const icon = (sym, size = 28) => ART[sym].replace('<svg ', `<svg width="${size}" height="${size}" aria-hidden="true" `);

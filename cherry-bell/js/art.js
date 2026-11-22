// Cherry Bell's reel symbols, drawn as SVG (100 × 100), in the flat, bold printing of an old reel strip.

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const INK = '#2b1a12';

export const ART = {
  cherry: svg(`
    <path d="M52 14 C48 30 36 44 30 58 M52 14 C58 32 64 44 70 60" fill="none" stroke="#3d6b1f" stroke-width="5" stroke-linecap="round"/>
    <path d="M52 15 C62 6 78 8 84 16 C74 24 60 24 52 15 Z" fill="#5c9a2c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M56 15 C66 14 74 15 80 16" fill="none" stroke="#3d6b1f" stroke-width="2"/>
    <circle cx="30" cy="68" r="19" fill="#d01f2c" stroke="${INK}" stroke-width="3.5"/>
    <circle cx="70" cy="70" r="19" fill="#d01f2c" stroke="${INK}" stroke-width="3.5"/>
    <ellipse cx="23" cy="61" rx="6" ry="4" fill="#ff9a9a" transform="rotate(-35 23 61)"/>
    <ellipse cx="63" cy="63" rx="6" ry="4" fill="#ff9a9a" transform="rotate(-35 63 63)"/>`),
  lemon: svg(`
    <path d="M10 52 C14 30 34 20 52 20 C72 20 88 32 92 50 C88 70 70 82 50 82 C30 82 14 72 10 52 Z" fill="#f6d529" stroke="${INK}" stroke-width="3.5"/>
    <path d="M10 52 L4 50 M92 50 L97 47" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 38 C36 30 48 28 58 30" fill="none" stroke="#fff6b8" stroke-width="5" stroke-linecap="round"/>
    <g fill="#d9b10e"><circle cx="40" cy="58" r="1.6"/><circle cx="56" cy="66" r="1.6"/><circle cx="68" cy="52" r="1.6"/><circle cx="48" cy="46" r="1.6"/><circle cx="74" cy="64" r="1.6"/></g>`),
  orange: svg(`
    <circle cx="50" cy="55" r="34" fill="#f48a1c" stroke="${INK}" stroke-width="3.5"/>
    <path d="M50 22 C52 14 58 10 64 10 C64 18 58 22 50 22 Z" fill="#5c9a2c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="23" r="3" fill="#6b4a1f"/>
    <path d="M30 40 C36 32 44 29 52 29" fill="none" stroke="#ffd29a" stroke-width="5" stroke-linecap="round"/>
    <g fill="#d86f08"><circle cx="38" cy="60" r="1.6"/><circle cx="56" cy="70" r="1.6"/><circle cx="66" cy="52" r="1.6"/><circle cx="46" cy="48" r="1.6"/><circle cx="62" cy="64" r="1.6"/><circle cx="44" cy="72" r="1.6"/></g>`),
  plum: svg(`
    <path d="M50 20 C70 18 84 34 84 54 C84 74 68 88 50 88 C32 88 16 74 16 54 C16 34 30 20 50 20 Z" fill="#6a2a8c" stroke="${INK}" stroke-width="3.5"/>
    <path d="M50 22 C46 38 46 66 52 86" fill="none" stroke="#4a1766" stroke-width="3"/>
    <path d="M50 21 C50 14 54 8 58 6" fill="none" stroke="#6b4a1f" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 44 C30 34 36 28 42 26" fill="none" stroke="#c79be0" stroke-width="5" stroke-linecap="round"/>`),
  bell: svg(`
    <path d="M50 10 C54 10 56 13 56 16 C72 20 76 36 76 52 C76 64 80 70 88 76 L12 76 C20 70 24 64 24 52 C24 36 28 20 44 16 C44 13 46 10 50 10 Z" fill="#f2b51c" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="10" y="74" width="80" height="8" rx="4" fill="#d89708" stroke="${INK}" stroke-width="3"/>
    <circle cx="50" cy="88" r="7" fill="#d89708" stroke="${INK}" stroke-width="3"/>
    <path d="M36 30 C32 38 31 50 32 62" fill="none" stroke="#fff0b0" stroke-width="5" stroke-linecap="round"/>`),
  bar: svg(`
    <rect x="6" y="28" width="88" height="44" rx="7" fill="#1d1b20" stroke="${INK}" stroke-width="3"/>
    <rect x="11" y="33" width="78" height="34" rx="4" fill="none" stroke="#e9e2cf" stroke-width="2"/>
    <text x="50" y="62" text-anchor="middle" font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="29" letter-spacing="1" fill="#f7f1e2">BAR</text>`),
  seven: svg(`
    <path d="M18 14 H84 V30 C68 46 58 64 54 88 H32 C36 64 46 46 60 32 H18 Z" fill="#d01f2c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M24 20 H78" stroke="#ff8f8f" stroke-width="4" stroke-linecap="round"/>`),
};

// A small inline copy for the pay table on the glass.
export const icon = (sym, size = 20) => ART[sym].replace('<svg ', `<svg width="${size}" height="${size}" aria-hidden="true" `);

// The link preview, og.png (1200 x 630):  node tools/og.mjs
// The sign and one line on the left, four of the floor's table pictures on the right, in the floor's own fonts.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b64 = async f => (await readFile(join(root, f))).toString('base64');
const font = async f => `data:font/woff2;base64,${await b64(`fonts/${f}`)}`;
const pic = async id => `data:image/jpeg;base64,${await b64(`floor/${id}.jpg`)}`;

const html = `<!doctype html><html><head><style>
@font-face { font-family: L; src: url(${await font('limelight.woff2')}); }
@font-face { font-family: F; src: url(${await font('figtree.woff2')}); font-weight: 400 800; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { display: grid; grid-template-columns: 500px 1fr; gap: 28px; padding: 40px; box-sizing: border-box; font-family: F;
  background: radial-gradient(circle at 50% 50%, rgba(217,180,90,.14) 0 5px, transparent 6px) 0 0 / 48px 48px,
    radial-gradient(ellipse at 20% 30%, #3a1420, #1a0b0f 70%); color: #f7f0e1; }
.left { display: flex; flex-direction: column; justify-content: center; gap: 26px; }
.sign { padding: 26px 30px 22px; border: 4px solid #8e6a22; border-radius: 22px; background: linear-gradient(#1e0f0b, #120806);
  box-shadow: 0 0 0 8px #1e0f0b, 0 0 0 11px rgba(217,180,90,.5); text-align: center; position: relative; }
.sign::before { content: ''; position: absolute; inset: 7px; border-radius: 16px;
  background: radial-gradient(circle, #fff6cf 0 3px, rgba(255,210,110,.7) 4px, transparent 6.5px) 0 0 / 22px 22px repeat-x,
    radial-gradient(circle, #fff6cf 0 3px, rgba(255,210,110,.7) 4px, transparent 6.5px) 11px 100% / 22px 22px repeat-x; }
h1 { margin: 0; font: 400 104px/1 L; color: #f5dc93; text-shadow: 0 0 8px rgba(255,220,140,.8), 0 0 30px rgba(255,190,80,.5), 0 4px 0 #6b4a12; }
h1 span { display: block; font-size: 62px; letter-spacing: .32em; padding-left: .32em; color: #ffe9b0; margin-top: 8px; }
p { margin: 0; font-size: 31px; line-height: 1.3; color: #e6dcc2; text-align: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-content: center; }
.grid img { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 14px; border: 2px solid rgba(217,180,90,.55);
  box-shadow: 0 10px 24px rgba(0,0,0,.5); display: block; }
</style></head><body>
<div class="left"><div class="sign"><h1>House<span>Money</span></h1></div>
<p>A casino on your phone, played with chips that cost nothing.</p></div>
<div class="grid"><img src="${await pic('blackjack')}"><img src="${await pic('roulette')}"><img src="${await pic('craps')}"><img src="${await pic('motherlode')}"></div>
</body></html>`;

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'og.png') });
await browser.close();
// A 256-colour palette keeps it near 150 KB rather than 600 (Pillow, if it's there).
try { execSync(`python3 -c "from PIL import Image; Image.open('og.png').convert('RGB').quantize(256).save('og.png', optimize=True)"`, { cwd: root }); } catch { /* full size it is */ }
console.log('og.png written');

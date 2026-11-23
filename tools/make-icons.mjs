// Renders the PNG app icons from the SVGs, and the long-press shortcuts' icons:  node tools/make-icons.mjs [shortcuts]
// (shortcuts: only the shortcuts' icons)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const rounded = await readFile(join(root, 'icon.svg'), 'utf8');
const square = await readFile(join(root, 'tools/icon-full-bleed.svg'), 'utf8');
// Android keeps only the middle circle, 80% across, of a maskable icon. Art that reaches further gets its own
// smaller copy in tools/icon-maskable.svg; without one, the full-bleed SVG is used.
const maskable = await readFile(join(root, 'tools/icon-maskable.svg'), 'utf8').catch(() => square);
const out = [
  ['icon-192.png', 192, rounded, true],
  ['icon-512.png', 512, rounded, true],
  ['icon-512-maskable.png', 512, maskable, false],
  ['icon-180.png', 180, square, false], // iOS rounds the corners itself
];

// The long press on the installed icon lists the tables (manifest.webmanifest's shortcuts), each with a 96 px icon cut
// from its picture on the floor (floor/<id>.jpg, 900x600, from tools/screenshots.mjs): [left, top, side] of the square
// cut, in the picture's pixels, on what reads at that size. Records has the app's own icon.
const CUTS = {
  blackjack: [355, 360, 185],        // the ace and the 7
  roulette: [12, 22, 386],           // the wheel
  craps: [268, 12, 126],             // the dice
  baccarat: [552, 380, 220],         // the Banker's king and the card peeled up
  'video-poker': [108, 352, 236],    // the kings held
  'cherry-bell': [290, 122, 250],    // a bell on the pay line
  'odds-and-ends': [382, 270, 146],  // the lucky penny
  motherlode: [252, 142, 136],       // a pickaxe
};
const SHORT = 96;

const browser = await pw.chromium.launch();
const page = await browser.newPage();
if (process.argv[2] !== 'shortcuts') {
  for (const [name, size, svg, clear] of out) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: join(root, name), omitBackground: clear });
  }
}
await mkdir(join(root, 'shortcuts'), { recursive: true });
await page.setViewportSize({ width: SHORT, height: SHORT });
for (const [id, [x, y, side]] of Object.entries(CUTS)) {
  const k = SHORT / side, img = (await readFile(join(root, 'floor', `${id}.jpg`))).toString('base64');
  await page.setContent(`<style>html,body{margin:0;overflow:hidden}img{display:block;transform-origin:0 0;transform:scale(${k}) translate(${-x}px,${-y}px)}</style><img src="data:image/jpeg;base64,${img}">`);
  await page.waitForFunction(() => document.querySelector('img').complete);
  await page.screenshot({ path: join(root, 'shortcuts', `${id}.png`) });
}
await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${SHORT}px;height:${SHORT}px}</style>${rounded}`);
await page.screenshot({ path: join(root, 'shortcuts', 'records.png'), omitBackground: true });
await browser.close();
console.log('icons written');

// Rewrites SHELL and FILES in sw.js from what's in the repo:  node tools/sw-files.mjs
// Every page, script, style sheet, font, icon and floor picture goes in the offline copy; the tools, tests, docs and
// the README don't. Bumps CACHE when the list itself changes. test/e2e.mjs checks FILES the same way.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['tools', 'test', 'docs', 'node_modules', '.git', 'dist']);
const KEEP = new Set(['.html', '.js', '.css', '.woff2', '.svg', '.png', '.jpg', '.webmanifest']);
const NOT = new Set(['og.png', 'icon-512.png', 'icon-512-maskable.png', 'sw.js']);

async function walk(dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...await walk(p));
    else if (KEEP.has(extname(name)) && !NOT.has(relative(root, p))) out.push(relative(root, p));
  }
  return out;
}

const files = await walk(root);
// the pages by their addresses too ('blackjack/' as well as 'blackjack/index.html'), so either opens offline
const pages = files.filter(f => f.endsWith('/index.html')).map(f => f.slice(0, -'index.html'.length));
const shell = ['./', ...pages, ...files];
const lines = [];
let line = ' ';
for (const f of shell) {
  const item = ` '${f}',`;
  if (line.length + item.length > 116) { lines.push(line); line = ' '; }
  line += item;
}
lines.push(line);

const all = createHash('sha1');
for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
const fp = all.digest('hex').slice(0, 8);

let sw = await readFile(join(root, 'sw.js'), 'utf8');
const old = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
const listChanged = old.replace(/\s+/g, '') !== lines.join('\n').replace(/\s+/g, '');
sw = sw.replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = [\n${lines.join('\n')}\n];`);
sw = sw.replace(/const FILES = '[0-9a-f]*'/, `const FILES = '${fp}'`);
if (listChanged) sw = sw.replace(/const CACHE = 'house-money-v(\d+)'/, (m, n) => `const CACHE = 'house-money-v${+n + 1}'`);
await writeFile(join(root, 'sw.js'), sw);
console.log(`sw.js: ${shell.length} files, FILES ${fp}${listChanged ? ', CACHE bumped' : ''}`);

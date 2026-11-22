// The playable copy for the Artifact viewer:  node tools/artifact.mjs  →  dist/artifact/ (and dist/artifact-files.json)
// The same files as the site, with three changes the viewer needs:
//   - the floor's page loses its document wrapper (the viewer adds its own), keeping its head and its body's class;
//   - links to a folder ('blackjack/', '../') name its index.html, since the viewer serves files, not folders;
//   - no offline copy (the viewer has no service workers; the pages already shrug off the refusal).
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/artifact');
const SKIP = new Set(['tools', 'test', 'docs', 'node_modules', '.git', 'dist']);
const KEEP = new Set(['.html', '.js', '.css', '.woff2', '.svg', '.png', '.jpg', '.webmanifest']);
const NOT = new Set(['og.png', 'icon-512.png', 'icon-512-maskable.png', 'sw.js', '404.html']);

async function walk(dir) {
  const list = [];
  for (const name of (await readdir(dir)).sort()) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) list.push(...await walk(p));
    else if (KEEP.has(extname(name)) && !NOT.has(relative(root, p))) list.push(relative(root, p));
  }
  return list;
}

const folderLinks = s => s
  .replace(/href="\.\.\/"/g, 'href="../index.html"')
  .replace(/href="\.\.\/records\/"/g, 'href="../records/index.html"')
  .replace(/href="records\/"/g, 'href="records/index.html"')
  .replace(/href="\.\.\/\$\{tb\.id\}\/"/g, 'href="../${tb.id}/index.html"')
  .replace(/a\.href = `\$\{t\.id\}\/`;/g, 'a.href = `${t.id}/index.html`;')
  .replace(/href="\$\{up\}\$\{t\.id\}\/"/g, 'href="${up}${t.id}/index.html"');

await rm(out, { recursive: true, force: true });
const files = await walk(root);
const map = {};
for (const f of files) {
  const to = join(out, f);
  await mkdir(dirname(to), { recursive: true });
  if (/\.(html|js)$/.test(f)) {
    let s = folderLinks(await readFile(join(root, f), 'utf8'));
    if (f === 'index.html') {
      const head = s.match(/<head>([\s\S]*?)<\/head>/)[1];
      const body = s.match(/<body class="([^"]*)">([\s\S]*?)<\/body>/);
      s = `${head.trim()}\n<script>document.body.className = '${body[1]}';</script>\n${body[2].trim()}\n`;
    }
    await writeFile(to, s);
  } else await copyFile(join(root, f), to);
  if (f !== 'index.html') map[f] = relative(root, to);
}
await writeFile(join(root, 'dist/artifact-files.json'), JSON.stringify(map, null, 1));
console.log(`dist/artifact: ${files.length} files`);

// Writes dist/sw.js after the site is built (v2 Phase 1.6: installable, works offline).
// The service worker's version is a hash of the build's file names, so every deploy gets a
// fresh cache and the previous edition's caches are removed when it takes over.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dist = path.resolve('dist');
const astro = readdirSync(path.join(dist, '_astro'));
// The "shell": styles, scripts and the main text fonts (Latin + Cyrillic), plus the start and
// offline pages. Figures and pages are cached as readers open them.
const fontRe = /^(source-serif-4|inter)-(latin|cyrillic)-(opsz|wght)-(normal|italic)\./;
const shell = [
  '/', '/bg/', '/offline/', '/bg/offline/', '/manifest.webmanifest', '/bg/manifest.webmanifest',
  '/favicon.svg', '/icons/icon-192.png',
  ...astro.filter((f) => /\.(css|js)$/.test(f) || fontRe.test(f)).map((f) => `/_astro/${f}`),
];
const bytes = shell.reduce((n, u) => {
  try { return n + statSync(path.join(dist, u.endsWith('/') ? `${u}index.html` : u)).size; } catch { return n; }
}, 0);
const book = JSON.parse(readFileSync('src/data/book.json', 'utf8'));
const version = `e${book.edition}-${createHash('sha256').update(astro.sort().join('|')).digest('hex').slice(0, 10)}`;

const sw = readFileSync('src/sw/sw.js', 'utf8')
  .replace('__VERSION__', version)
  .replace('[/*__SHELL__*/]', JSON.stringify(shell));
writeFileSync(path.join(dist, 'sw.js'), sw);
console.log(`sw.js: version ${version}, ${shell.length} shell files (${Math.round(bytes / 1024)} KB).`);

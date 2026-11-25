// After `astro build`: on pages whose text opens with a figure, load that one image at once
// instead of lazily, because it is what the reader sees first (faster Largest Contentful Paint).
// Astro's image pipeline marks every Markdown image lazy, so this adjusts the built HTML.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
let changed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (!['_astro', 'pagefind', 'og', 'cards', 'previews'].includes(name)) walk(p); continue; }
    if (name !== 'index.html') continue;
    const html = readFileSync(p, 'utf8');
    const start = html.indexOf('<div class="prose">');
    if (start < 0) continue;
    // Does the text open with a figure?
    const first = html.slice(start + '<div class="prose">'.length).trimStart();
    if (!first.startsWith('<figure')) continue;
    const img = html.indexOf('<img', start);
    if (img < 0) continue;
    const end = html.indexOf('>', img);
    const tag = html.slice(img, end);
    if (!tag.includes('loading="lazy"')) continue;
    writeFileSync(p, html.slice(0, img) + tag.replace('loading="lazy"', 'loading="eager" fetchpriority="high"') + html.slice(end));
    changed++;
  }
};
walk(dist);
console.log(`eager-first-figure: ${changed} pages open with a figure that now loads at once.`);

// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { site } from './src/site.config.ts';

// Renamed pages (content-meta/slug-overrides.json → src/data/redirects.json).
// GitHub Pages has no server-side redirects, so Astro writes a small page at each
// old address that forwards to the new one. The Bulgarian mirror is redirected too.
/** @type {Record<string, string>} */
const redirects = {};
for (const { from, to } of JSON.parse(readFileSync('./src/data/redirects.json', 'utf8'))) {
  if (!from || !to) continue;
  redirects[from] = to;
  if (!from.startsWith('/bg/')) redirects[`/bg${from}`] = `/bg${to}`;
}

export default defineConfig({
  site: site.url,
  redirects,
  trailingSlash: 'always',
  build: { format: 'directory' },
  image: {
    // Markdown figures get responsive srcsets, WebP output and lazy loading.
    layout: 'constrained',
    responsiveStyles: true,
    breakpoints: [480, 760, 1140, 1520],
  },
  devToolbar: { enabled: false },
});

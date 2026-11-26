// Adds a Content Security Policy to every built page (runs after `astro build`, before the service
// worker is built). GitHub Pages can't send security headers, so the policy goes in a <meta> tag.
//
// What it allows: the site's own files, plus the exact inline scripts each page was built with
// (by SHA-256 hash, so a script injected later would not run), WebAssembly for the search, and
// the GoatCounter address that counts visits. Everything else (other sites' scripts, plugins,
// <base> tricks, forms posting elsewhere) is refused by the browser.
//
//   node scripts/csp.mjs           (part of `npm run build`)
//   node scripts/csp.mjs --check   (only report pages without a policy; exits 1 if any)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const check = process.argv.includes('--check');

const pages = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(p);
  }
})(dist);

// Scripts the browser would run: no src, and a JavaScript type (or none). JSON data blocks are not run.
const RUNNABLE = /^(|text\/javascript|module|application\/javascript)$/i;
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

function policy(html) {
  const hashes = new Set();
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = (m[1].match(/\btype\s*=\s*"([^"]*)"/i) ?? [])[1] ?? '';
    if (RUNNABLE.test(type)) hashes.add(sha(m[2]));
  }
  // Where visits are counted (from the page itself, so the policy follows site.config.ts).
  const gc = html.match(/data-goatcounter="(https:\/\/[a-z0-9-]+\.goatcounter\.com)\//)?.[1];
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${gc ? ` ${gc}` : ''}`,
    `connect-src 'self'${gc ? ` ${gc}` : ''}`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

let added = 0, missing = 0;
for (const p of pages) {
  const html = readFileSync(p, 'utf8');
  if (check) { if (!html.includes('http-equiv="Content-Security-Policy"')) { missing++; console.log('no policy:', path.relative(dist, p)); } continue; }
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(html)}"><meta name="referrer" content="strict-origin-when-cross-origin">`;
  // As early in <head> as possible: right after the charset, before any script or style.
  const at = html.match(/<meta charset="[^"]*"\s*\/?>/i);
  // (Redirect pages for moved sections have no <head>: the policy goes right after the doctype.)
  const out = at ? html.replace(at[0], at[0] + meta) : /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + meta) : html.replace(/^<!doctype html>/i, (d) => d + meta);
  if (out === html) { console.log('csp: could not place the policy in', path.relative(dist, p)); continue; }
  writeFileSync(p, out);
  added++;
}
if (check) { console.log(`csp: ${pages.length - missing} of ${pages.length} pages have a policy.`); process.exit(missing ? 1 : 0); }
console.log(`csp: policy added to ${added} pages.`);

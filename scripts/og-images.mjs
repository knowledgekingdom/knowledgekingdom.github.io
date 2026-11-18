// Generates the link-preview ("Open Graph") images in public/og/ — one for the
// homepage and one per chapter, in English and Bulgarian — by rendering a small
// HTML card with the site's own fonts in a local Chrome/Edge and saving a JPEG.
//
//   npm run og          (also run by `npm run update`)
//
// Only cards whose text changed are re-rendered. If no Chrome/Edge is found the
// script skips quietly and the existing images are kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const out = path.join(root, 'public', 'og');
const manifestPath = path.join(out, 'manifest.json');
const fonts = (f) => 'file:///' + path.join(root, 'node_modules', '@fontsource-variable', f).replace(/\\/g, '/');

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = browsers.find((b) => existsSync(b));
if (!browser) {
  console.log('og-images: no Chrome/Edge found — keeping existing images.');
  process.exit(0);
}

const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const book = { en: read('src/data/book.json'), bg: existsSync(path.join(root, 'src/data/bg/book.json')) ? read('src/data/bg/book.json') : null };
const ACCENT = ['#13707a', '#a0472a', '#7a5c10', '#3b4e91', '#3d6a37', '#7b3a69'];
const L = {
  en: { chapter: 'Chapter', part: 'Part', edition: 'Working Edition' },
  bg: { chapter: 'Глава', part: 'Част', edition: 'Работно издание' },
};

function chapters(lang) {
  const dir = path.join(root, lang === 'en' ? 'src/content/chapters' : 'src/content/bg/chapters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const fm = readFileSync(path.join(dir, f), 'utf8').split('---')[1];
    const get = (k) => JSON.parse(fm.match(new RegExp(`^${k}: (.*)$`, 'm'))[1]);
    return { label: get('label'), title: get('title'), part: get('part'), partTitle: get('partTitle') };
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function card({ lang, kicker, big, title, accent, foot }) {
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
  @font-face { font-family: 'KK Serif'; src: url('${fonts('source-serif-4/files/source-serif-4-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 200 900; }
  @font-face { font-family: 'KK Serif'; src: url('${fonts('source-serif-4/files/source-serif-4-cyrillic-opsz-normal.woff2')}') format('woff2'); font-weight: 200 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: 'KK Sans'; src: url('${fonts('inter/files/inter-latin-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'KK Sans'; src: url('${fonts('inter/files/inter-cyrillic-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: #f7f3ea; color: #1f2329; font-family: 'KK Serif'; position: relative; overflow: hidden; }
  .bar { position: absolute; inset: 0 0 auto; height: 12px; background: ${accent}; }
  .wrap { position: absolute; inset: 70px 80px 64px; display: flex; flex-direction: column; }
  .kicker { font-family: 'KK Sans'; font-weight: 600; font-size: 24px; letter-spacing: .16em; text-transform: uppercase; color: ${accent}; }
  .big { font-size: 190px; line-height: .8; font-weight: 250; color: ${accent}; letter-spacing: -.03em; margin: 34px 0 30px -6px; font-variation-settings: 'opsz' 60; }
  .title { font-size: 74px; line-height: 1.04; font-weight: 620; letter-spacing: -.015em; font-variation-settings: 'opsz' 60; max-width: 1000px; }
  .home .title { font-size: 128px; line-height: .92; margin-top: 40px; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; font-family: 'KK Sans'; font-size: 24px; color: #5f6369; }
  .brand { font-family: 'KK Serif'; font-weight: 650; font-size: 30px; color: #1f2329; }
  </style><body class="${big ? '' : 'home'}"><div class="bar"></div><div class="wrap">
  <div class="kicker">${esc(kicker)}</div>${big ? `<div class="big">${esc(big)}</div>` : ''}
  <div class="title">${esc(title)}</div>
  <div class="foot"><span class="brand">${esc(book.en.title)}</span><span>${esc(foot)}</span></div></div></body></html>`;
}

const jobs = [];
for (const lang of ['en', 'bg']) {
  const b = lang === 'en' ? book.en : book.bg;
  if (!b) continue;
  const foot = `${L[lang].edition} ${b.edition} · ${b.editionDate}`;
  jobs.push({ file: `home-${lang}.jpg`, html: card({ lang, kicker: b.subtitle, title: b.titleDisplay.split(/\s+/).map((w) => w[0] + w.slice(1).toLowerCase()).join(' '), accent: ACCENT[0], foot }) });
  for (const c of chapters(lang)) {
    const roman = b.parts.find((p) => p.number === c.part)?.roman ?? '';
    jobs.push({
      file: `${c.label}-${lang}.jpg`,
      html: card({ lang, kicker: `${L[lang].part} ${roman} · ${c.partTitle ?? ''}`, big: c.label, title: c.title, accent: ACCENT[(c.part - 1) % ACCENT.length], foot }),
    });
  }
}

mkdirSync(out, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const next = {};
const tmp = path.join(tmpdir(), `kk-og-${process.pid}`);
mkdirSync(tmp, { recursive: true });
const todo = [];
for (const job of jobs) {
  const hash = createHash('sha256').update(job.html).digest('hex').slice(0, 16);
  next[job.file] = hash;
  if (!(manifest[job.file] === hash && existsSync(path.join(out, job.file)))) todo.push(job);
}

let rendered = 0;
if (todo.length) {
  // One browser for all cards, driven over the DevTools protocol (reliable and fast).
  const port = 9400 + (process.pid % 500);
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--force-device-scale-factor=1', '--window-size=1200,630', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let wsUrl;
    for (let i = 0; i < 80 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; }
      catch { await sleep(250); }
    }
    if (!wsUrl) throw new Error('browser did not start');
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const waiting = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); waiting.delete(d.id); };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    for (const job of todo) {
      const htmlFile = path.join(tmp, 'card.html');
      writeFileSync(htmlFile, job.html);
      await send('Page.navigate', { url: 'file:///' + htmlFile.split(path.sep).join('/') + `?${rendered}` });
      await sleep(300);
      await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
      if (!shot.result?.data) { console.warn(`og-images: could not render ${job.file}`); delete next[job.file]; continue; }
      await sharp(Buffer.from(shot.result.data, 'base64')).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, job.file));
      rendered++;
    }
    ws.close();
  } catch (e) {
    console.warn(`og-images: ${e.message} — keeping existing images.`);
    for (const job of todo) if (!existsSync(path.join(out, job.file))) delete next[job.file];
  } finally {
    proc.kill();
  }
}
for (const f of Object.keys(manifest)) if (!next[f] && existsSync(path.join(out, f))) rmSync(path.join(out, f));
writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n');
await new Promise((r) => setTimeout(r, 300));
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* the browser may still hold files */ }
console.log(`og-images: ${rendered} rendered, ${jobs.length - todo.length} unchanged.`);

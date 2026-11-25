// Link-preview ("Open Graph") images for every section, in English and Bulgarian:
// public/og/s/{lang}/{chapter}/{section-slug}.jpg (about 2,000 cards, ~40 KB each).
//
// Too many to keep in git, so they are made by the GitHub build (which has Chrome) and kept in
// its cache between builds; only cards whose text changed are redrawn. Locally:
//   npm run og:sections     (optional; pages fall back to the chapter's card if a file is missing)
//
// Fast path: the browser loads one card template and only the text is swapped per card.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const out = path.join(root, 'public', 'og', 's');
const manifestPath = path.join(out, 'manifest.json');
const font = (f) => 'file:///' + path.join(root, 'node_modules', '@fontsource-variable', f).replace(/\\/g, '/');
const browser = [process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean).find((b) => existsSync(b));
if (!browser) { console.log('og-sections: no Chrome/Edge found — skipping (pages use the chapter cards).'); process.exit(0); }

const ACCENT = ['#13707a', '#a0472a', '#7a5c10', '#3b4e91', '#3d6a37', '#7b3a69'];
const L = { en: { chapter: 'Chapter', section: 'Section', part: 'Part' }, bg: { chapter: 'Глава', section: 'Раздел', part: 'Част' } };
const book = (lang) => JSON.parse(readFileSync(path.join(root, lang === 'en' ? 'src/data/book.json' : 'src/data/bg/book.json'), 'utf8'));

function sections(lang) {
  const dir = path.join(root, lang === 'en' ? 'src/content/sections' : 'src/content/bg/sections');
  if (!existsSync(dir)) return [];
  const b = book(lang);
  const list = [];
  for (const ch of readdirSync(dir)) {
    for (const f of readdirSync(path.join(dir, ch)).filter((x) => x.endsWith('.md'))) {
      const fm = readFileSync(path.join(dir, ch, f), 'utf8').split('---')[1];
      const get = (k) => { const m = fm.match(new RegExp(`^${k}: (.*)$`, 'm')); return m ? JSON.parse(m[1]) : null; };
      const type = get('type');
      if (type !== 'section' && type !== 'summary') continue;
      const part = get('part');
      list.push({
        file: `${lang}/${get('chapterLabel')}/${get('slug')}.jpg`,
        data: {
          lang, accent: ACCENT[((part ?? 1) - 1) % ACCENT.length], brand: b.title,
          kicker: `${L[lang].chapter} ${get('chapterLabel')} · ${get('chapterTitle')}`,
          title: get('title'),
          foot: [get('number') != null && type === 'section' ? `${L[lang].section} ${get('number')}` : '',
            `${L[lang].part} ${b.parts.find((p) => p.number === part)?.roman ?? ''}`].filter(Boolean).join(' · '),
        },
      });
    }
  }
  return list;
}

const template = `<!doctype html><html><meta charset="utf-8"><style>
@font-face { font-family: 'KK Serif'; src: url('${font('source-serif-4/files/source-serif-4-latin-opsz-normal.woff2')}') format('woff2'); font-weight: 200 900; }
@font-face { font-family: 'KK Serif'; src: url('${font('source-serif-4/files/source-serif-4-cyrillic-opsz-normal.woff2')}') format('woff2'); font-weight: 200 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'KK Sans'; src: url('${font('inter/files/inter-latin-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'KK Sans'; src: url('${font('inter/files/inter-cyrillic-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
html, body { margin: 0; width: 1200px; height: 630px; }
body { --a: #13707a; background: #f7f3ea; color: #1f2329; font-family: 'KK Serif'; position: relative; overflow: hidden; }
.bar { position: absolute; inset: 0 0 auto; height: 12px; background: var(--a); }
.side { position: absolute; left: 80px; top: 150px; bottom: 150px; width: 6px; border-radius: 3px; background: var(--a); opacity: .35; }
.wrap { position: absolute; inset: 70px 80px 64px 120px; display: flex; flex-direction: column; }
.kicker { font-family: 'KK Sans'; font-weight: 600; font-size: 25px; letter-spacing: .06em; color: var(--a);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { margin: auto 0; font-size: 72px; line-height: 1.06; font-weight: 620; letter-spacing: -.015em; font-variation-settings: 'opsz' 60;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.title.long { font-size: 60px; } .title.xlong { font-size: 50px; }
.foot { display: flex; justify-content: space-between; align-items: baseline; font-family: 'KK Sans'; font-size: 24px; color: #5f6369; }
.brand { font-family: 'KK Serif'; font-weight: 650; font-size: 30px; color: #1f2329; }
</style><body><div class="bar"></div><div class="side"></div><div class="wrap">
<div class="kicker" id="k"></div><div class="title" id="t"></div>
<div class="foot"><span class="brand" id="b"></span><span id="f"></span></div></div>
<script>
window.render = (d) => {
  document.documentElement.lang = d.lang;
  document.body.style.setProperty('--a', d.accent);
  for (const [id, v] of [['k', d.kicker], ['t', d.title], ['b', d.brand], ['f', d.foot]]) document.getElementById(id).textContent = v;
  const t = document.getElementById('t');
  t.className = 'title' + (d.title.length > 110 ? ' xlong' : d.title.length > 70 ? ' long' : '');
  return document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
};
</script></body></html>`;

const jobs = [...sections('en'), ...(existsSync(path.join(root, 'src/data/bg/book.json')) ? sections('bg') : [])];
mkdirSync(out, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const next = {};
const tplHash = createHash('sha256').update(template.replace(/file:\/\/\/[^')]+/g, '')).digest('hex').slice(0, 8);
const todo = [];
for (const job of jobs) {
  const hash = createHash('sha256').update(tplHash + JSON.stringify(job.data)).digest('hex').slice(0, 16);
  next[job.file] = hash;
  if (!(manifest[job.file] === hash && existsSync(path.join(out, job.file)))) todo.push(job);
}

const tmp = path.join(tmpdir(), `kk-ogs-${process.pid}`);
mkdirSync(tmp, { recursive: true });
let rendered = 0;
if (todo.length) {
  const port = 9900 + (process.pid % 90);
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-sandbox',
    '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
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
    const file = path.join(tmp, 'card.html');
    writeFileSync(file, template);
    await send('Page.navigate', { url: 'file:///' + file.split(path.sep).join('/') });
    await sleep(800);
    const started = Date.now();
    for (const job of todo) {
      await send('Runtime.evaluate', { expression: `render(${JSON.stringify(job.data)})`, awaitPromise: true });
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
      if (!shot.result?.data) { delete next[job.file]; continue; }
      mkdirSync(path.dirname(path.join(out, job.file)), { recursive: true });
      await sharp(Buffer.from(shot.result.data, 'base64')).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(out, job.file));
      if (++rendered % 200 === 0) console.log(`og-sections: ${rendered}/${todo.length} (${Math.round((Date.now() - started) / rendered)} ms each)`);
    }
    ws.close();
  } catch (e) {
    console.warn(`og-sections: ${e.message} — pages without a card use the chapter's.`);
    for (const job of todo) if (!existsSync(path.join(out, job.file))) delete next[job.file];
  } finally {
    proc.kill();
  }
}
for (const f of Object.keys(manifest)) if (!next[f] && existsSync(path.join(out, f))) rmSync(path.join(out, f));
writeFileSync(manifestPath, JSON.stringify(next) + '\n');
await new Promise((r) => setTimeout(r, 300));
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* the browser may still hold files */ }
console.log(`og-sections: ${rendered} drawn, ${jobs.length - todo.length} unchanged.`);

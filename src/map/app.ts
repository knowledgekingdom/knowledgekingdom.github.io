// The Kingdom Map on the homepage (v2 Phase 5): draws the map for this reader, then lets them
// explore it — drag, pinch, wheel (Ctrl + wheel until the map has focus), keys, "fly to", a
// mini-map, and a panel for each town. The plane is tilted towards the viewer and follows the
// mouse a little; clouds drift above it. Loaded by src/scripts/kingdom-map.ts after first paint.
import mapJson from '../data/map.json';
import { renderMap, renderTop, townStates, partsDone, fogHoles, smooth, type MapData, type Progress, type Town, type TownState } from './render.ts';
import { paintSea, createFog } from './textures.ts';
import { store } from '../scripts/reader';
import { track } from '../lib/analytics';

const data = mapJson as unknown as MapData;
const W = data.width, H = data.height;
type Strings = Record<string, string>;
type CardInfo = { href: string; title: string; standfirst: string };
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };

/** Sections read per chapter label, from the reader's read marks ("/001-slug/section/"). */
function progressOf(read: Record<string, number>): Progress {
  const out: Progress = {};
  for (const p of Object.keys(read)) {
    const m = p.match(/^\/(\d{3})-[^/]+\/[^/]+\//);
    if (m) out[m[1]] = (out[m[1]] ?? 0) + 1;
  }
  return out;
}

// 3 × 3 matrix inverse (for the tilted plane's homography).
function inv3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-9;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

export async function mount(root: HTMLElement) {
  performance.mark('km-start');
  const S: Strings = JSON.parse(root.dataset.strings ?? '{}');
  const lang = (root.dataset.lang === 'bg' ? 'bg' : 'en') as 'en' | 'bg';
  const prefix = lang === 'bg' ? '/bg' : '';
  const frame = root.querySelector<HTMLElement>('.km-frame')!;
  const rs = { map: S.map, part: S.part, chapter: S.chapter, comingSoon: S.comingSoon, chapters: S.chapters, sectionsRead: S.sectionsRead, league: S.league, planned: S.planned };

  // Titles, standfirsts and links come from the chapter cards already on the page.
  const cards: Record<string, CardInfo> = {};
  document.querySelectorAll<HTMLAnchorElement>('a.chapter-card').forEach((a) => {
    const label = a.querySelector('.num')?.textContent?.trim();
    const h = a.querySelector('h2, h3');
    if (!label || !h) return;
    const title = [...h.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('visually-hidden'))).map((n) => n.textContent).join('').trim();
    cards[label] = { href: a.getAttribute('href') ?? '', title, standfirst: a.querySelector('p')?.textContent?.trim() ?? '' };
  });
  const townBy = Object.fromEntries(data.towns.map((t) => [t.label, t]));
  const townName = (t: Town) => (lang === 'bg' ? t.nameBg ?? t.name : t.name);
  const townTitle = (t: Town) => cards[t.label]?.title ?? (lang === 'bg' ? t.titleBg ?? t.title : t.title);
  const regionTitle = (n: number) => { const r = data.regions.find((q) => q.number === n)!; return lang === 'bg' ? r.titleBg ?? r.title : r.title; };
  const roman = (n: number) => data.regions.find((q) => q.number === n)?.roman ?? String(n);

  // ---------- build the frame ----------
  frame.innerHTML = `
    <div class="km-tilt"><div class="km-pan">
      <canvas class="km-sea-c" aria-hidden="true"></canvas><div class="km-base"></div><canvas class="km-fog-c" aria-hidden="true"></canvas><div class="km-topl"></div>
    </div></div>
    <div class="km-clouds" aria-hidden="true"><div class="km-clouds-in"></div></div>
    <div class="km-ui">
      <label class="km-fly"><span>${esc(S.flyTo)}</span> <select data-fly aria-label="${esc(S.flyTo)}"></select></label>
      <div class="km-zoom" role="group" aria-label="${esc(S.zoom)}">
        <button type="button" data-zoom="in" aria-label="${esc(S.zoomIn)}" title="${esc(S.zoomIn)}">+</button>
        <button type="button" data-zoom="out" aria-label="${esc(S.zoomOut)}" title="${esc(S.zoomOut)}">−</button>
        <button type="button" data-zoom="home" aria-label="${esc(S.whereIAm)}" title="${esc(S.whereIAm)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="7.5"/></svg></button>
        <button type="button" data-full aria-pressed="false" aria-label="${esc(S.full)}" title="${esc(S.full)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
    </div>
    <div class="km-mini" aria-hidden="true"></div>
    <div class="km-hint" aria-hidden="true"></div>
    <div class="km-toast" role="status" aria-live="polite"></div>
    <aside class="km-panel" hidden aria-labelledby="km-p-title">
      <button type="button" class="km-p-close" data-close aria-label="${esc(S.close)}">×</button>
      <p class="km-p-kicker"></p><h3 id="km-p-title" tabindex="-1"></h3><p class="km-p-stand"></p>
      <div class="km-p-progress"><div class="km-p-bar"><span></span></div><p class="km-p-meta"></p></div>
      <p class="km-p-links"></p><div class="km-p-bridges"></div>
    </aside>`;
  const tilt = frame.querySelector<HTMLElement>('.km-tilt')!;
  const pan = frame.querySelector<HTMLElement>('.km-pan')!;
  const base = frame.querySelector<HTMLElement>('.km-base')!;
  const topl = frame.querySelector<HTMLElement>('.km-topl')!;
  const seaC = frame.querySelector<HTMLCanvasElement>('.km-sea-c')!;
  const fogC = frame.querySelector<HTMLCanvasElement>('.km-fog-c')!;
  const clouds = frame.querySelector<HTMLElement>('.km-clouds-in')!;
  const panel = frame.querySelector<HTMLElement>('.km-panel')!;
  const toastEl = frame.querySelector<HTMLElement>('.km-toast')!;
  const hint = frame.querySelector<HTMLElement>('.km-hint')!;
  const mini = frame.querySelector<HTMLElement>('.km-mini')!;
  const fly = frame.querySelector<HTMLSelectElement>('[data-fly]')!;
  pan.style.width = `${W}px`; pan.style.height = `${H}px`;
  const fog = createFog(fogC, W, H);

  // ---------- drawing ----------
  let progress: Progress = {};
  let states: Record<string, TownState> = {};
  let current: string | null = null;
  let signature = '';
  let selected: string | null = null;
  let holes: ReturnType<typeof fogHoles> = [];

  function paintTextures() { paintSeaTexture(); paintFogTexture(); }
  function paintSeaTexture() {
    paintSea(seaC, W, H, getComputedStyle(root).getPropertyValue('--km-sea').trim() || '#d9e4dd', isDark());
  }
  function paintFogTexture() {
    const cs = getComputedStyle(root);
    const rgb = (cs.getPropertyValue('--km-fog-rgb').trim() || '244 239 227').split(/[\s,]+/).map(Number) as [number, number, number];
    fog.colour(rgb, Number(cs.getPropertyValue('--km-fog-a')) || 0.5);
    if (holes.length) fog.paint(holes);
  }

  function draw(first = false) { drawBase(); drawRest(first); }
  function drawBase(html?: string) {
    base.innerHTML = html ?? baseHtml();
  }
  function baseHtml() {
    progress = progressOf(store.state.read);
    signature = JSON.stringify(progress);
    const ts = townStates(data.towns, progress);
    states = ts.states; current = ts.current;
    // "Where I am" follows the section opened last, if its chapter isn't finished.
    const lastCh = store.state.last?.path.match(/^\/(\d{3})-/)?.[1];
    if (lastCh && (states[lastCh] === 'started' || states[lastCh] === 'next')) current = lastCh;
    return renderMap(data, { lang, progress, strings: rs, relief: true, motion: !calm() });
  }
  function drawRest(first: boolean) {
    if (first) topl.innerHTML = renderTop(data, { lang, strings: rs });
    const svg = base.querySelector('svg');
    if (svg && calm()) (svg as SVGSVGElement).pauseAnimations?.();
    if (selected) base.querySelector(`.km-town[data-ch="${selected}"]`)?.classList.add('is-selected');
    celebrate(first);
    drawMini();
  }

  // ---------- banners, crests and the fog clearing ----------
  let toastTimer = 0;
  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-on'), 5200);
  }
  function celebrate(first: boolean) {
    const ex = store.state.explored ?? {};
    holes = fogHoles(data, states);
    const fresh = new Set(holes.filter((h) => !ex[`map:seen-${h.label}`]).map((h) => h.label));
    fog.paint(holes, fresh, !calm());
    const doneTowns = data.towns.filter((t) => states[t.label] === 'done');
    const newBanners = doneTowns.filter((t) => !ex[`map:ch-${t.label}`]);
    const parts = partsDone(data, states);
    const newCrests = parts.filter((n) => !ex[`map:part-${n}`]);
    const anyBefore = Object.keys(ex).some((k) => k.startsWith('map:'));
    for (const t of newBanners) base.querySelector(`.km-town[data-ch="${t.label}"]`)?.classList.add('is-raising');
    for (const n of newCrests) base.querySelector(`.km-crest[data-part="${n}"]`)?.classList.add('is-new');
    if (newCrests.length) {
      const n = newCrests[newCrests.length - 1];
      toast(fill(S.crestToast, { part: roman(n), title: regionTitle(n) }));
    } else if (newBanners.length === 1 || (newBanners.length && anyBefore)) {
      const t = newBanners[newBanners.length - 1];
      toast(fill(S.bannerToast, { n: t.number, name: townName(t) }));
    } else if (newBanners.length > 1) {
      toast(fill(S.bannersToast, { n: newBanners.length }));
    } else if (first && !anyBefore && !doneTowns.length) {
      toast(S.welcomeToast);
    }
    const keys = [...[...fresh].map((l) => `map:seen-${l}`), ...newBanners.map((t) => `map:ch-${t.label}`), ...newCrests.map((n) => `map:part-${n}`)];
    if (keys.length) {
      const now = Math.round(Date.now() / 1000);
      store.update((s) => { s.explored ??= {}; for (const k of keys) s.explored[k] ??= now; });
    }
  }

  // ---------- the view: centre (cx, cy) in map units, scale s, and the tilt ----------
  let fw = frame.clientWidth || 800, fh = frame.clientHeight || 600;
  let cx = W / 2, cy = H / 2, s = 0.5;
  const fine = matchMedia('(pointer: fine)').matches;
  let baseTilt = fw < 700 ? 9 : 14;
  let tx = baseTilt, ty = 0, wantX = baseTilt, wantY = 0;
  let Hinv = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const sMin = () => Math.min(fw / W, fh / H) * 0.92;
  const sMax = () => (fw < 700 ? 2.6 : 2.2);

  function applyTilt() {
    const persp = new DOMMatrix(); persp.m34 = -1 / 1700;
    const m = new DOMMatrix().translate(fw / 2, fh / 2).multiply(persp).rotate(tx, ty, 0).scale(1.07).translate(-fw / 2, -fh / 2);
    tilt.style.transform = m.toString();
    Hinv = inv3([m.m11, m.m21, m.m41, m.m12, m.m22, m.m42, m.m14, m.m24, m.m44]);
  }
  /** Screen point → point on the flat (untilted) plane, in frame pixels. */
  function toFlat(clientX: number, clientY: number): [number, number] {
    const r = frame.getBoundingClientRect();
    const X = clientX - r.left, Y = clientY - r.top, h = Hinv;
    const u = h[0] * X + h[1] * Y + h[2], v = h[3] * X + h[4] * Y + h[5], w = h[6] * X + h[7] * Y + h[8];
    return [u / w, v / w];
  }
  const flatToMap = ([fx, fy]: [number, number]): [number, number] => [cx + (fx - fw / 2) / s, cy + (fy - fh / 2) / s];
  const toMap = (clientX: number, clientY: number) => flatToMap(toFlat(clientX, clientY));

  function clampView() {
    s = clamp(s, sMin(), sMax());
    const hw = fw / 2 / s, hh = fh / 2 / s;
    cx = hw * 2 >= W ? W / 2 : clamp(cx, hw, W - hw);
    cy = hh * 2 >= H ? H / 2 : clamp(cy, hh * 0.7, H - hh);
  }
  let settleTimer = 0;
  function applyView(moving = true) {
    clampView();
    const px = fw / 2 - cx * s, py = fh / 2 - cy * s;
    pan.style.transform = `translate(${px}px, ${py}px) scale(${s})`;
    clouds.style.setProperty('--cx', `${(px * 1.3) % 1400}px`);
    clouds.style.setProperty('--cy', `${(py * 1.3) % 900}px`);
    if (moving) { pan.style.willChange = 'transform'; frame.classList.add('is-moving'); }
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, moving ? 260 : 0);
  }
  function settle() {
    pan.style.willChange = '';
    frame.classList.remove('is-moving');
    // Names stay readable however far out: they grow as the map shrinks, then hide.
    root.style.setProperty('--km-ls', clamp(12 / (25 * s), 1, 3.2).toFixed(2));
    root.style.setProperty('--km-rs', clamp(15 / (30 * s), 1, 4.5).toFixed(2));
    frame.classList.toggle('is-far', s < 0.14);
    drawMiniView();
  }

  // ---------- flying ----------
  let anim = 0;
  function flyTo(tcx: number, tcy: number, ts: number, dur = 900) {
    cancelAnimationFrame(anim);
    ts = clamp(ts, sMin(), sMax());
    if (calm() || dur === 0) { cx = tcx; cy = tcy; s = ts; applyView(false); return; }
    const c0 = [cx, cy], s0 = s, start = performance.now();
    const dist = Math.hypot(tcx - cx, tcy - cy) * Math.min(s0, ts) / fw;
    const dip = clamp(dist * 0.35, 0, 0.45);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      cx = c0[0] + (tcx - c0[0]) * e; cy = c0[1] + (tcy - c0[1]) * e;
      s = Math.exp(Math.log(s0) + (Math.log(ts) - Math.log(s0)) * e) * (1 - dip * Math.sin(Math.PI * t));
      applyView();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function regionBox(n: number) {
    const r = data.regions.find((q) => q.number === n)!;
    const xs = r.outline.map((p) => p[0]), ys = r.outline.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - 90, y1: Math.max(...ys) };
  }
  function fitBox(b: { x0: number; x1: number; y0: number; y1: number }, focus?: [number, number]): [number, number, number] {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    let fs = Math.min(fw / (bw * 1.06), fh / (bh * 1.1));
    let c: [number, number] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    // Phones: zoom in closer than the whole Part, keeping the reader's town in view.
    if (fw < 700 && focus) { fs = Math.max(fs, Math.min(fh / (bh * 1.05), fs * 1.9)); c = [clamp(focus[0], b.x0 + fw / 2 / fs, b.x1 - fw / 2 / fs), c[1]]; }
    return [c[0], c[1], fs];
  }
  function homeView(): [number, number, number] {
    const t = current ? townBy[current] : data.towns[0];
    return fitBox(regionBox(t?.part ?? 1), t ? [t.x, t.y] : undefined);
  }
  function flyToTown(label: string, open = false) {
    const t = townBy[label];
    if (!t) return;
    const ts = Math.max(s, fw < 700 ? 0.55 : 0.6);
    // On phones the panel covers the bottom of the map: aim a little lower so the town sits above it.
    flyTo(t.x, t.y + (fw < 700 && open ? 120 / ts : 0), ts);
    if (open) openTown(label);
  }

  // ---------- the town panel ----------
  function openTown(label: string) {
    const t = townBy[label];
    if (!t) return;
    selected = label;
    base.querySelectorAll('.km-town.is-selected').forEach((el) => el.classList.remove('is-selected'));
    base.querySelector(`.km-town[data-ch="${label}"]`)?.classList.add('is-selected');
    const card = cards[label];
    const read = Math.min(progress[label] ?? 0, t.sections);
    const st = states[label];
    const chapterHref = card?.href ?? prefix + t.url;
    panel.dataset.part = String(t.part);
    panel.querySelector('.km-p-kicker')!.textContent = `${fill(S.partN, { n: roman(t.part) })} · ${fill(S.chapterN, { n: t.label })}`;
    panel.querySelector('h3')!.textContent = townTitle(t);
    panel.querySelector('.km-p-stand')!.textContent = t.planned ? S.plannedNote : card?.standfirst ?? '';
    const prog = panel.querySelector<HTMLElement>('.km-p-progress')!;
    prog.hidden = t.planned;
    prog.querySelector<HTMLElement>('.km-p-bar span')!.style.width = `${t.sections ? Math.round((read / t.sections) * 100) : 0}%`;
    prog.querySelector('.km-p-meta')!.textContent = st === 'done' ? S.finished : fill(S.sectionsRead, { n: read, t: t.sections });
    const last = store.state.last;
    const resume = st === 'started' && last && last.path.startsWith(t.url) ? prefix + last.path : chapterHref;
    const primary = t.planned ? S.seeRoadmap : st === 'done' ? S.readAgain : st === 'started' ? S.continue : S.start;
    panel.querySelector('.km-p-links')!.innerHTML = t.planned
      ? `<a class="btn btn-primary" href="${esc(prefix + '/roadmap/')}">${esc(primary)}</a>`
      : `<a class="btn btn-primary" href="${esc(resume)}">${esc(primary)}</a> <a href="${esc(chapterHref)}">${esc(S.contents)}</a> <a href="${esc(chapterHref + 'flashcards/')}">${esc(S.flashcards)}</a>`;
    const links = data.bridges.filter((b) => b.a === label || b.b === label).map((b) => (b.a === label ? b.b : b.a));
    panel.querySelector('.km-p-bridges')!.innerHTML = links.length
      ? `<p>${esc(S.bridges)}</p>${links.map((l) => `<button type="button" class="chip" data-goto="${l}">${townBy[l].number} · ${esc(townName(townBy[l]))}</button>`).join('')}`
      : '';
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-open'));
    panel.querySelector<HTMLElement>('h3')!.focus({ preventScroll: true });
    track('map-open', 'town');
  }
  function closePanel(returnFocus = true) {
    if (panel.hidden) return;
    panel.classList.remove('is-open');
    panel.hidden = true;
    const was = selected;
    selected = null;
    base.querySelectorAll('.km-town.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (returnFocus && was) base.querySelector<SVGAElement>(`.km-town[data-ch="${was}"]`)?.focus({ preventScroll: true });
  }
  panel.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-close]')) closePanel();
    const go = el.closest<HTMLElement>('[data-goto]');
    if (go) flyToTown(go.dataset.goto!, true);
  });

  // ---------- mini-map ----------
  function drawMini() {
    const k = (n: number) => Math.round(n);
    mini.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${data.regions.map((r) => `<path class="${r.known ? 'k' : 'f'}" d="${smooth(r.outline, true)}"/>`).join('')}`
      + data.towns.map((t) => `<circle class="t is-${states[t.label]}" cx="${k(t.x)}" cy="${k(t.y)}" r="34"/>`).join('')
      + `<path class="v" d=""/></svg>`;
    drawMiniView();
  }
  function drawMiniView() {
    const v = mini.querySelector('.v');
    if (!v) return;
    const r = frame.getBoundingClientRect();
    const pts = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]].map(([x, y]) => toMap(x, y).map((n) => Math.round(clamp(n, -50, Math.max(W, H) + 50))));
    v.setAttribute('d', `M${pts.map((p) => p.join(' ')).join('L')}Z`);
  }
  mini.addEventListener('click', (e) => {
    const r = mini.querySelector('svg')!.getBoundingClientRect();
    flyTo(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, s, 600);
  });

  // ---------- fly-to menu ----------
  {
    const parts = data.regions.filter((r) => r.known);
    fly.innerHTML = `<option value="">${esc(S.choose)}</option><option value="here">${esc(S.whereIAm)}</option><option value="all">${esc(S.wholeMap)}</option>`
      + parts.map((r) => `<optgroup label="${esc(fill(S.partN, { n: r.roman ?? r.number }))}"><option value="part-${r.number}">${esc(regionTitle(r.number))}</option>`
        + data.towns.filter((t) => t.part === r.number).map((t) => `<option value="ch-${t.label}">${t.number} · ${esc(townName(t))}</option>`).join('') + `</optgroup>`).join('');
    fly.addEventListener('change', () => {
      const v = fly.value;
      fly.value = '';
      if (v === 'here') { const [a, b, c] = homeView(); flyTo(a, b, c); }
      else if (v === 'all') flyTo(W / 2, H / 2, sMin(), 1100);
      else if (v.startsWith('part-')) { const [a, b, c] = fitBox(regionBox(Number(v.slice(5)))); flyTo(a, b, c, 1000); }
      else if (v.startsWith('ch-')) flyToTown(v.slice(3), true);
      track('map-open', 'fly');
    });
  }

  // ---------- zoom buttons and full screen ----------
  frame.querySelector('.km-zoom')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.zoom === 'in') flyTo(cx, cy, s * 1.6, 350);
    else if (b.dataset.zoom === 'out') flyTo(cx, cy, s / 1.6, 350);
    else if (b.dataset.zoom === 'home') { const [a, c, d] = homeView(); flyTo(a, c, d); }
    else if ('full' in b.dataset) setFull(!root.classList.contains('km-is-full'));
  });
  function setFull(on: boolean) {
    root.classList.toggle('km-is-full', on);
    document.documentElement.classList.toggle('km-lock', on);
    frame.querySelector('[data-full]')!.setAttribute('aria-pressed', String(on));
    if (on) { frame.focus({ preventScroll: true }); track('map-open', 'full'); }
  }

  // ---------- pointer: drag, pinch, tap ----------
  const pointers = new Map<number, [number, number]>();
  let grab: { m: [number, number] } | null = null;
  let pinch: { s0: number; d0: number; m: [number, number] } | null = null;
  let downAt: [number, number] | null = null, dragged = false;
  const onUi = (e: Event) => Boolean((e.target as HTMLElement).closest('.km-ui, .km-panel, .km-mini'));
  frame.addEventListener('pointerdown', (e) => {
    if (onUi(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(anim);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) { downAt = [e.clientX, e.clientY]; dragged = false; grab = { m: toMap(e.clientX, e.clientY) }; pinch = null; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const fa = toFlat(a[0], a[1]), fb = toFlat(b[0], b[1]);
      pinch = { s0: s, d0: Math.hypot(fa[0] - fb[0], fa[1] - fb[1]) || 1, m: flatToMap([(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2]) };
      grab = null; dragged = true;
      try { frame.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    }
  });
  frame.addEventListener('pointermove', (e) => {
    if (fine && e.pointerType === 'mouse' && !pointers.size && !calm()) {
      const r = frame.getBoundingClientRect();
      wantX = baseTilt + ((e.clientY - r.top) / r.height - 0.5) * -3.5;
      wantY = ((e.clientX - r.left) / r.width - 0.5) * 5;
      startTilt();
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const fa = toFlat(a[0], a[1]), fb = toFlat(b[0], b[1]);
      s = clamp(pinch.s0 * (Math.hypot(fa[0] - fb[0], fa[1] - fb[1]) / pinch.d0), sMin(), sMax());
      const mid: [number, number] = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
      cx = pinch.m[0] - (mid[0] - fw / 2) / s; cy = pinch.m[1] - (mid[1] - fh / 2) / s;
      applyView();
      return;
    }
    if (grab && downAt) {
      if (!dragged && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) return;
      if (!dragged) { dragged = true; try { frame.setPointerCapture(e.pointerId); } catch { /* fine without */ } frame.classList.add('is-grabbing'); }
      const f = toFlat(e.clientX, e.clientY);
      cx = grab.m[0] - (f[0] - fw / 2) / s; cy = grab.m[1] - (f[1] - fh / 2) / s;
      applyView();
    }
  });
  const lift = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) { const [p] = [...pointers.values()]; grab = { m: toMap(p[0], p[1]) }; downAt = p; }
    if (!pointers.size) { grab = null; frame.classList.remove('is-grabbing'); }
  };
  frame.addEventListener('pointerup', lift);
  frame.addEventListener('pointercancel', lift);
  frame.addEventListener('pointerleave', () => { if (!pointers.size) { wantX = baseTilt; wantY = 0; startTilt(); } });
  frame.addEventListener('click', (e) => {
    if (onUi(e)) return;
    const a = (e.target as Element).closest<SVGAElement>('a.km-town');
    if (dragged) { e.preventDefault(); dragged = false; return; }
    if (!a) { closePanel(false); return; }
    if (e.ctrlKey || e.metaKey || e.shiftKey) return; // new tab / window: let the link work
    e.preventDefault();
    openTown(a.dataset.ch!);
  });

  // The tilt eases towards where the mouse is.
  let tiltRaf = 0;
  function startTilt() {
    if (tiltRaf) return;
    const step = () => {
      tx += (wantX - tx) * 0.12; ty += (wantY - ty) * 0.12;
      applyTilt();
      if (Math.abs(wantX - tx) + Math.abs(wantY - ty) > 0.01) tiltRaf = requestAnimationFrame(step);
      else { tiltRaf = 0; drawMiniView(); }
    };
    tiltRaf = requestAnimationFrame(step);
  }

  // ---------- wheel and keys ----------
  let hintTimer = 0;
  frame.addEventListener('wheel', (e) => {
    const engaged = root.classList.contains('km-is-full') || frame.contains(document.activeElement);
    if (!engaged && !e.ctrlKey) {
      hint.textContent = S.wheelHint;
      hint.classList.add('is-on');
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => hint.classList.remove('is-on'), 1400);
      return;
    }
    e.preventDefault();
    cancelAnimationFrame(anim);
    const m = toMap(e.clientX, e.clientY), f = toFlat(e.clientX, e.clientY);
    s = clamp(s * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), sMin(), sMax());
    cx = m[0] - (f[0] - fw / 2) / s; cy = m[1] - (f[1] - fh / 2) / s;
    applyView();
  }, { passive: false });
  frame.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.km-panel, select')) { if (e.key === 'Escape') { closePanel(); e.preventDefault(); } return; }
    const step = 140 / s;
    const k = e.key;
    if (k === 'ArrowLeft') flyTo(cx - step, cy, s, 220);
    else if (k === 'ArrowRight') flyTo(cx + step, cy, s, 220);
    else if (k === 'ArrowUp') flyTo(cx, cy - step, s, 220);
    else if (k === 'ArrowDown') flyTo(cx, cy + step, s, 220);
    else if (k === '+' || k === '=') flyTo(cx, cy, s * 1.5, 260);
    else if (k === '-' || k === '_') flyTo(cx, cy, s / 1.5, 260);
    else if (k === '0' || k === 'Home') { const [a, b, c] = homeView(); flyTo(a, b, c); }
    else if (k === 'Escape') { if (!panel.hidden) closePanel(); else if (root.classList.contains('km-is-full')) setFull(false); else return; }
    else return;
    e.preventDefault();
  });
  // Tabbing to a town brings it into view.
  frame.addEventListener('focusin', (e) => {
    const a = (e.target as Element).closest?.('a.km-town') as SVGAElement | null;
    if (!a) return;
    const t = townBy[a.dataset.ch!];
    const r = a.getBoundingClientRect(), fr = frame.getBoundingClientRect();
    if (r.left < fr.left + 40 || r.right > fr.right - 40 || r.top < fr.top + 40 || r.bottom > fr.bottom - 40) flyTo(t.x, t.y, Math.max(s, 0.45), 500);
  });

  // ---------- size, theme, other tabs ----------
  new ResizeObserver(() => {
    const nw = frame.clientWidth, nh = frame.clientHeight;
    if (!nw || !nh || (nw === fw && nh === fh)) return;
    fw = nw; fh = nh; baseTilt = fw < 700 ? 9 : 14; wantX = tx = baseTilt; wantY = ty = 0;
    applyTilt(); applyView(false);
  }).observe(frame);
  const retheme = () => paintTextures();
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  store.subscribe(() => { if (JSON.stringify(progressOf(store.state.read)) !== signature) draw(); });

  // ---------- go: in short steps, so no single task holds up the page ----------
  const pause = () => new Promise<void>((r) => setTimeout(r, 0));
  paintSeaTexture();
  const html = baseHtml();
  await pause();
  drawBase(html);
  applyTilt();
  [cx, cy, s] = homeView();
  applyView(false);
  await pause();
  paintFogTexture();
  await pause();
  drawRest(true);
  root.classList.add('is-ready');
  performance.measure('km-mount', 'km-start');
  // Test hook (used by the browser checks): the view, and a map point → screen point.
  Object.assign(root, {
    kmView: () => ({ cx, cy, s, tilt: [tx, ty], selected, current, states }),
    kmScreen: (x: number, y: number) => {
      const fx = fw / 2 + (x - cx) * s, fy = fh / 2 + (y - cy) * s;
      const m = new DOMMatrix(tilt.style.transform), p = m.transformPoint(new DOMPoint(fx, fy, 0, 1)), r = frame.getBoundingClientRect();
      return [r.left + p.x / p.w, r.top + p.y / p.w];
    },
  });
}

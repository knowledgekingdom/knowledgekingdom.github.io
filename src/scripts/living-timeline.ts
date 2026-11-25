// The Living Timeline (v2 Phase 4): a zoomable canvas with one lane per region of the world.
// - Scale: the site's compressed time scale (src/lib/time-scale.ts); zooming happens in that
//   space, so deep time stays compressed and the scale note says so.
// - Mouse: drag to pan, wheel/trackpad to zoom. Touch: drag, pinch. Keys: arrows pan, + / − zoom,
//   Home shows the whole story. Click an event for its card; click empty space for "Meanwhile…".
// - Clusters events that would overlap; culls what is off screen; draws only when something changed.
// - The list below the canvas is the same data and stays in step (filters, "only what's in view").
import { position, yearAt, formatDate } from '../lib/time-scale';
import { store } from './reader';

type Link = { href: string; title: string; path: string };
type Ev = { id: string; label: string; date: string; start: number; end: number; approx: boolean; region: string;
  chapter: string; part: number | null; links: Link[] };
type Span = { label: string; title: string; part: number | null; start: number; end: number };
type Region = { id: string; name: string };

const root = document.querySelector<HTMLElement>('[data-lt]');
if (root) init(root);

function init(root: HTMLElement) {
  const lang = root.dataset.lang === 'bg' ? 'bg' : 'en';
  let events: Ev[] = JSON.parse(root.dataset.events || '[]');
  // Self-test for performance: /timeline/?stress=3000 adds that many synthetic copies (not saved anywhere).
  const stress = Number(new URLSearchParams(location.search).get('stress')) || 0;
  if (stress > 0 && events.length) {
    const base = events;
    events = [...base, ...Array.from({ length: Math.min(stress, 20000) }, (_, i) => {
      const e = base[i % base.length], jitter = (Math.sin(i * 12.9898) * 0.5) * Math.max(10, (e.end - e.start) + 0.02 * Math.abs(2000 - e.start));
      return { ...e, id: `${e.id}-x${i}`, start: Math.round(e.start + jitter), end: Math.round(e.end + jitter) };
    })];
  }
  const regions: Region[] = JSON.parse(root.dataset.regions || '[]');
  const spans: Span[] = JSON.parse(root.dataset.spans || '[]');
  const S: Record<string, string> = JSON.parse(root.dataset.strings || '{}');
  const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const wrap = $('[data-wrap]');
  const canvas = $<HTMLCanvasElement>('[data-canvas]');
  const card = $('[data-card]');
  const meanwhile = $('[data-meanwhile]');
  const ctx = canvas.getContext('2d')!;

  // ---- state ---------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const MIN_SPAN = 0.15; // narrowest view, in scale units (0–100)
  let u0 = 0, u1 = 100;
  const lanesOn = new Set(regions.map((r) => r.id));
  if (params.get('lanes')) { lanesOn.clear(); for (const l of params.get('lanes')!.split(',')) if (regions.some((r) => r.id === l)) lanesOn.add(l); }
  if (params.has('from') && params.has('to')) {
    const a = position(Number(params.get('from'))), b = position(Number(params.get('to')));
    if (Number.isFinite(a) && Number.isFinite(b) && b - a >= MIN_SPAN) { u0 = a; u1 = b; }
  }
  let reading = false, marker: number | null = null, selected: Ev | null = null;
  const lowFi = (navigator.hardwareConcurrency ?? 8) <= 2 || ((navigator as any).deviceMemory ?? 8) <= 2;
  let slow = lowFi;
  const readPaths = () => new Set(Object.keys(store.state.read));

  // ---- geometry ------------------------------------------------------------------------------
  let W = 0, H = 0, dpr = 1;
  const LANE_H = 46, AXIS_H = 28, BAND_ROW = 12;
  const bandRows: Span[][] = [];
  for (const sp of spans) {
    const a = position(sp.start), b = position(sp.end);
    let row = bandRows.findIndex((r) => r.every((x) => position(x.end) + 0.4 < a || position(x.start) - 0.4 > b));
    if (row === -1) row = bandRows.push([]) - 1;
    bandRows[row].push(sp);
  }
  const bandsH = () => bandRows.length * BAND_ROW + 8;
  const lanes = () => regions.filter((r) => lanesOn.has(r.id));
  const X = (u: number) => ((u - u0) / (u1 - u0)) * W;
  const U = (x: number) => u0 + (x / W) * (u1 - u0);
  const laneTop = (i: number) => bandsH() + AXIS_H + i * LANE_H;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth;
    H = bandsH() + AXIS_H + Math.max(1, lanes().length) * LANE_H + 4;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    wrap.style.height = `${H}px`;
    request();
  };

  // Colours follow the site's theme.
  let C: Record<string, string> = {};
  const readColors = () => {
    const cs = getComputedStyle(root);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    C = { paper: v('--paper', '#f7f3ea'), paper2: v('--paper-2', '#efe9dc'), ink: v('--ink', '#1f2329'), ink2: v('--ink-2', '#444'),
      ink3: v('--ink-3', '#777'), rule: v('--rule', '#ddd'), accent: v('--accent', '#13707a'),
      p1: v('--part-1', '#13707a'), p2: v('--part-2', '#a0472a'), p3: v('--part-3', '#7a5c10') };
  };
  new MutationObserver(() => { readColors(); request(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); request(); });
  const partColor = (p: number | null) => (p === 3 ? C.p3 : p === 1 ? C.p1 : C.p2);

  // A "c." date is drawn as a soft range of ±5% of its age (min 20 years), like the games use.
  const margin = (e: Ev) => (e.approx ? Math.max(20, 0.05 * (2000 - (e.start + e.end) / 2)) : 0);

  // ---- ticks ----------------------------------------------------------------------------------
  const STEPS = [1e6, 5e5, 2e5, 1e5, 5e4, 2e4, 1e4, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  // Round landmarks first (where the scale's stretches begin), then finer steps where there is room.
  const LANDMARKS = [-3_000_000 + 2000, -1_000_000 + 2000, -100_000 + 2000, -10000, -3000, -500, 500, 1000, 1500, 1800];
  const tickLabel = (y: number) => formatDate({ start: Math.round(y), end: Math.round(y) }, lang);
  const ticks = (font: string) => {
    ctx.font = font;
    const y0 = yearAt(u0), y1 = yearAt(u1), out: { y: number; x: number; w: number }[] = [];
    const tryAdd = (y: number) => {
      if (y < y0 || y > y1 || y === 0) return;
      const x = X(position(y)), w = ctx.measureText(tickLabel(y)).width;
      if (out.every((o) => Math.abs(o.x - x) > (o.w + w) / 2 + 14)) out.push({ y, x, w });
    };
    LANDMARKS.forEach(tryAdd);
    for (const step of STEPS) {
      const first = Math.ceil(y0 / step) * step;
      if ((y1 - first) / step > 300) continue;
      for (let y = first; y <= y1; y += step) tryAdd(y);
    }
    return out.map((o) => o.y);
  };

  // ---- drawing ---------------------------------------------------------------------------------
  type Hit = { x0: number; x1: number; y0: number; y1: number; ev?: Ev; cluster?: Ev[]; span?: Span };
  let hits: Hit[] = [];
  (root as any).ltHits = () => hits.map((h) => ({ x: (h.x0 + h.x1) / 2, y: (h.y0 + h.y1) / 2, id: h.ev?.id, cluster: h.cluster?.length, span: h.span?.label }));
  let queued = false;
  function request() { if (!queued) { queued = true; requestAnimationFrame(draw); } }

  function draw() {
    queued = false;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    hits = [];
    const sans = getComputedStyle(document.body).getPropertyValue('--font-sans') || 'system-ui, sans-serif';
    const read = reading ? readPaths() : null;

    // Chapter bands (the book's chapters as eras).
    bandRows.forEach((row, i) => {
      for (const sp of row) {
        const a = X(position(sp.start)), b = Math.max(X(position(sp.end)), a + 4);
        if (b < 0 || a > W) continue;
        const y = 4 + i * BAND_ROW;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = partColor(sp.part);
        ctx.fillRect(a, y, b - a, BAND_ROW - 4);
        ctx.globalAlpha = 1;
        if (b - a > 26) {
          ctx.fillStyle = C.paper; ctx.font = `600 9px ${sans}`;
          ctx.fillText(sp.label, Math.max(a, 0) + 4, y + 7);
        }
        hits.push({ x0: a, x1: b, y0: y, y1: y + BAND_ROW - 4, span: sp });
      }
    });

    // Axis with ticks, and an honest marker where the scale changes.
    const ay = bandsH();
    ctx.fillStyle = C.paper2; ctx.fillRect(0, ay, W, AXIS_H);
    ctx.font = `11px ${sans}`; ctx.fillStyle = C.ink3; ctx.strokeStyle = C.rule;
    for (const y of ticks(`11px ${sans}`)) {
      const x = X(position(y));
      ctx.beginPath(); ctx.moveTo(x, ay + AXIS_H - 6); ctx.lineTo(x, H); ctx.stroke();
      const label = tickLabel(y), w = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(Math.max(2, x - w / 2), W - w - 2), ay + 16);
    }
    const deepX = X(position(-10000));
    if (deepX > 0 && deepX < W) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.ink3;
      ctx.beginPath(); ctx.moveTo(deepX, ay); ctx.lineTo(deepX, H); ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.ink3; ctx.font = `italic 10px ${sans}`;
      const s = S.compressed, w = ctx.measureText(s).width;
      if (deepX - w - 6 > 0) ctx.fillText(s, deepX - w - 6, ay + AXIS_H + 12);
    }

    // Lanes.
    const ls = lanes();
    ls.forEach((r, i) => {
      const top = laneTop(i), mid = top + LANE_H / 2 + 4;
      if (i % 2) { ctx.fillStyle = C.paper2; ctx.globalAlpha = 0.45; ctx.fillRect(0, top, W, LANE_H); ctx.globalAlpha = 1; }
      // Visible events in this lane, left to right, clustered when they would overlap.
      const list = events.filter((e) => e.region === r.id).map((e) => {
        const m = margin(e);
        return { e, a: X(position(e.start - m)), b: X(position(e.end + m)), ca: X(position(e.start)), cb: X(position(e.end)) };
      }).filter((o) => o.b >= -10 && o.a <= W + 10).sort((p, q) => p.ca - q.ca);
      const groups: (typeof list)[] = [];
      for (const o of list) {
        const g = groups.at(-1);
        // Anything closer than a cluster bubble's width joins the group (bubbles never touch).
        if (g && (o.ca + o.cb) / 2 - (g[0].ca + g[0].cb) / 2 < 26 && o.cb - o.ca < 12) g.push(o); else groups.push([o]);
      }
      let labelEnd = -Infinity;
      groups.forEach((g, gi) => {
        if (g.length > 1) {
          const x = (g[0].ca + g[g.length - 1].cb) / 2;
          ctx.fillStyle = C.ink2; ctx.beginPath(); ctx.arc(x, mid - 4, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = C.paper; ctx.font = `700 11px ${sans}`;
          const s = String(g.length), w = ctx.measureText(s).width;
          ctx.fillText(s, x - w / 2, mid);
          hits.push({ x0: x - 13, x1: x + 13, y0: mid - 17, y1: mid + 9, cluster: g.map((o) => o.e) });
          return;
        }
        const { e, a, b, ca, cb } = g[0];
        const color = partColor(e.part);
        const isRead = read ? e.links.some((l) => read.has(l.path)) : true;
        ctx.globalAlpha = read && !isRead ? 0.25 : 1;
        if (e.approx && !slow && b - a > 3) {
          // Soft range: fades out towards the uncertain edges.
          const grad = ctx.createLinearGradient(a, 0, b, 0);
          grad.addColorStop(0, 'transparent'); grad.addColorStop(Math.max(0.01, (ca - a) / (b - a)), color);
          grad.addColorStop(Math.min(0.99, (cb - a) / (b - a)), color); grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.globalAlpha *= 0.35;
          ctx.fillRect(a, mid - 9, b - a, 10);
          ctx.globalAlpha = read && !isRead ? 0.25 : 1;
        }
        ctx.fillStyle = color;
        if (cb - ca >= 6) { ctx.fillRect(ca, mid - 9, cb - ca, 10); }
        else { ctx.beginPath(); ctx.arc((ca + cb) / 2, mid - 4, 5.5, 0, Math.PI * 2); ctx.fill(); }
        if (selected === e) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(Math.min(ca, cb - 6) - 3, mid - 12, Math.max(cb - ca, 6) + 6, 16); ctx.lineWidth = 1; }
        if (read && isRead) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc((ca + cb) / 2, mid - 4, 9, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
        // Label to the right, if it fits before the next item in the lane.
        const next = groups[gi + 1]?.[0]?.ca ?? W;
        const lx = Math.max(cb + 6, 4), room = next - lx - 8;
        if (lx > labelEnd && room > 48 && !(dragging && slow)) {
          ctx.fillStyle = C.ink; ctx.font = `12px ${sans}`;
          let text = e.label;
          while (text.length > 4 && ctx.measureText(text).width > room) text = text.slice(0, -2);
          if (text !== e.label) text = text.replace(/\s*\S*$/, '') + '…';
          ctx.fillText(text, lx, mid + 1);
          labelEnd = lx + ctx.measureText(text).width;
        }
        ctx.globalAlpha = 1;
        hits.push({ x0: Math.min(ca, cb - 6) - 4, x1: Math.max(cb, ca + 6) + 4, y0: mid - 14, y1: mid + 6, ev: e });
      });
      // Lane name on top.
      ctx.font = `600 10.5px ${sans}`;
      const name = r.name.toUpperCase(), w = ctx.measureText(name).width;
      ctx.fillStyle = C.paper; ctx.globalAlpha = 0.9; ctx.fillRect(4, top + 3, w + 8, 14); ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink3; ctx.fillText(name, 8, top + 13);
    });

    // "Meanwhile" marker.
    if (marker !== null) {
      const x = X(position(marker));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, bandsH()); ctx.lineTo(x, H); ctx.stroke(); ctx.lineWidth = 1;
    }
    canvas.setAttribute('aria-label', fill(S.canvasLabel, { from: tickLabel(yearAt(u0)), to: tickLabel(yearAt(u1)) }));
    // Too slow for this device? Switch to the simpler drawing.
    const took = performance.now() - t0;
    root.dataset.frameMs = took.toFixed(1); // read by the browser tests
    if (!slow && took > 24) slowFrames++;
    if (slowFrames > 3) slow = true;
    syncUrl();
    syncList();
  }
  let slowFrames = 0;

  // ---- view changes ----------------------------------------------------------------------------
  const clampView = () => {
    const span = Math.max(MIN_SPAN, Math.min(100, u1 - u0));
    if (u0 < 0) { u0 = 0; u1 = span; }
    if (u1 > 100) { u1 = 100; u0 = 100 - span; }
    u0 = Math.max(0, u0); u1 = Math.min(100, Math.max(u0 + MIN_SPAN, u1));
  };
  const zoomAt = (factor: number, x = W / 2) => {
    const c = U(x), span = Math.max(MIN_SPAN, Math.min(100, (u1 - u0) * factor));
    u0 = c - ((c - u0) / (u1 - u0)) * span; u1 = u0 + span;
    clampView(); request();
  };
  const panBy = (dx: number) => { const du = (dx / W) * (u1 - u0); u0 -= du; u1 -= du; clampView(); request(); };
  const showRange = (a: number, b: number) => {
    const ua = position(a), ub = position(b), pad = Math.max((ub - ua) * 0.15, 0.4);
    u0 = ua - pad; u1 = ub + pad; clampView(); request();
  };

  // ---- pointer input ---------------------------------------------------------------------------
  const pts = new Map<number, { x: number; y: number }>();
  let dragging = false, downAt = { x: 0, y: 0 }, pinch0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    // Capture can fail (e.g. a pointer the browser already let go of); the gesture still works without it.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    downAt = { x: e.offsetX, y: e.offsetY }; dragging = false;
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = Math.abs(p.x - q.x); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const [p, q] = [...pts.values()], d = Math.abs(p.x - q.x);
      if (pinch0 > 20 && d > 20) { zoomAt(pinch0 / d, (p.x + q.x) / 2); pinch0 = d; }
      dragging = true;
      return;
    }
    if (Math.abs(e.offsetX - downAt.x) > 5 || Math.abs(e.offsetY - downAt.y) > 5) dragging = true;
    if (dragging) panBy(e.offsetX - prev.x);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  });
  const up = (e: PointerEvent) => {
    const wasDrag = dragging;
    pts.delete(e.pointerId);
    if (pts.size === 0) { dragging = false; if (!wasDrag) tap(e.offsetX, e.offsetY); else request(); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) panBy(-e.deltaX);
    else zoomAt(Math.exp(e.deltaY * 0.0015), e.offsetX);
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') panBy(W * 0.15); else if (k === 'ArrowRight') panBy(-W * 0.15);
    else if (k === '+' || k === '=') zoomAt(0.7); else if (k === '-' || k === '_') zoomAt(1 / 0.7);
    else if (k === 'Home') { u0 = 0; u1 = 100; request(); }
    else if (k === 'Escape') closeCard();
    else return;
    e.preventDefault();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.zoom === 'in') zoomAt(0.6); else if (b.dataset.zoom === 'out') zoomAt(1 / 0.6); else { u0 = 0; u1 = 100; request(); }
  }));

  // ---- taps: events, clusters, chapter bands, empty space ------------------------------------------
  function tap(x: number, y: number) {
    const h = hits.find((t) => x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1);
    if (h?.ev) { openCard(h.ev, x, y); return; }
    if (h?.cluster) { const s = h.cluster.map((e) => e.start), e2 = h.cluster.map((e) => e.end); showRange(Math.min(...s), Math.max(...e2)); return; }
    if (h?.span) { showRange(h.span.start, h.span.end); return; }
    if (y > bandsH()) { closeCard(); showMeanwhile(yearAt(U(x))); }
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  function openCard(e: Ev, x: number, y: number) {
    selected = e;
    const region = regions.find((r) => r.id === e.region)?.name ?? '';
    card.innerHTML = `<button type="button" class="lt-card-close icon-btn" aria-label="${esc(S.close)}">×</button>
      <p class="lt-card-meta">${esc(region)} · ${esc(e.date)}</p><h3>${esc(e.label)}</h3>
      <ul>${e.links.map((l) => `<li><a href="${esc(l.href)}">${esc(S.read)}: ${esc(l.title)} →</a></li>`).join('')}</ul>
      <button type="button" class="btn btn-quiet" data-mw>${esc(S.meanwhile)}</button>`;
    card.hidden = false;
    const w = card.offsetWidth, hgt = card.offsetHeight;
    card.style.left = `${Math.min(Math.max(8, x - w / 2), W - w - 8)}px`;
    card.style.top = `${y + 18 + hgt < H ? y + 18 : Math.max(8, y - hgt - 18)}px`;
    card.querySelector<HTMLButtonElement>('.lt-card-close')!.onclick = closeCard;
    card.querySelector<HTMLButtonElement>('[data-mw]')!.onclick = () => { showMeanwhile((e.start + e.end) / 2); };
    card.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    request();
  }
  function closeCard() { if (!card.hidden) { card.hidden = true; selected = null; request(); } }

  // ---- "Meanwhile…": what was happening in each region at one moment -------------------------------
  function showMeanwhile(year: number) {
    marker = year;
    const when = tickLabel(year);
    const window = Math.max(50, 0.05 * Math.abs(2000 - year));
    const rows = lanes().map((r) => {
      const inLane = events.filter((e) => e.region === r.id);
      const during = inLane.filter((e) => e.start - margin(e) <= year && year <= e.end + margin(e));
      const near = during.length ? [] : inLane.map((e) => ({ e, d: Math.min(Math.abs(e.start - year), Math.abs(e.end - year)) }))
        .filter((o) => o.d <= window).sort((a, b) => a.d - b.d).slice(0, 1).map((o) => o.e);
      return { r, list: during.length ? during : near, near: !during.length };
    });
    meanwhile.innerHTML = `<h2>${esc(fill(S.meanwhileAt, { date: when }))}</h2><ul>${rows.map(({ r, list, near }) =>
      `<li><strong>${esc(r.name)}</strong> ${list.length ? list.map((e) => `<a href="${esc(e.links[0]?.href ?? '#')}">${esc(e.label)}</a> <span class="meta">(${esc(e.date)}${near ? `, ${esc(S.around)}` : ''})</span>`).join('; ')
        : `<span class="meta">${esc(S.nothing)}</span>`}</li>`).join('')}</ul>`;
    meanwhile.hidden = false;
    request();
  }

  // ---- lanes, reading overlay --------------------------------------------------------------------------
  root.querySelectorAll<HTMLInputElement>('[data-lane]').forEach((c) => {
    c.checked = lanesOn.has(c.value);
    c.addEventListener('change', () => { if (c.checked) lanesOn.add(c.value); else lanesOn.delete(c.value); closeCard(); resize(); });
  });
  const readingBox = $<HTMLInputElement>('[data-reading]');
  readingBox.addEventListener('change', () => {
    reading = readingBox.checked;
    const read = readPaths();
    const n = events.filter((e) => e.links.some((l) => read.has(l.path))).length;
    $('[data-read-count]').textContent = reading ? fill(S.readCount, { n, total: events.length }) : '';
    request();
  });

  // ---- shareable address ----------------------------------------------------------------------------------
  let urlTimer = 0;
  function syncUrl() {
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const p = new URLSearchParams();
      if (u0 > 0.01 || u1 < 99.99) { p.set('from', String(Math.round(yearAt(u0)))); p.set('to', String(Math.round(yearAt(u1)))); }
      if (lanesOn.size < regions.length) p.set('lanes', [...lanesOn].join(','));
      const q = p.toString();
      history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }, 300);
  }

  // ---- the list: same events, same filters ---------------------------------------------------------------
  const items = [...root.querySelectorAll<HTMLElement>('[data-list] .lt-item')];
  const chapterSel = $<HTMLSelectElement>('[data-chapter]');
  const inView = $<HTMLInputElement>('[data-in-view]');
  const status = $('[data-status]');
  let listTimer = 0;
  function syncList() {
    clearTimeout(listTimer);
    listTimer = window.setTimeout(() => {
      const ch = chapterSel.value, y0 = yearAt(u0), y1 = yearAt(u1);
      let n = 0;
      for (const li of items) {
        const s = Number(li.dataset.start), e = Number(li.dataset.end);
        const show = lanesOn.has(li.dataset.region!) && (!ch || li.dataset.chapter === ch) && (!inView.checked || (e >= y0 && s <= y1));
        li.hidden = !show;
        if (show) n++;
      }
      status.textContent = fill(S.showing, { n, total: items.length });
    }, 120);
  }
  chapterSel.addEventListener('change', () => {
    const ch = chapterSel.value;
    if (ch) { const sp = spans.find((s) => s.label === ch); if (sp) showRange(sp.start, sp.end); }
    syncList();
  });
  inView.addEventListener('change', syncList);

  // Chapter pages link here as /timeline/#ch-012.
  const fromHash = () => {
    const m = location.hash.match(/^#ch-(\d{3})$/);
    if (!m) return;
    chapterSel.value = m[1];
    const sp = spans.find((s) => s.label === m[1]);
    if (sp) showRange(sp.start, sp.end);
  };
  addEventListener('hashchange', fromHash);

  readColors();
  new ResizeObserver(resize).observe(wrap);
  resize();
  fromHash();
  syncList();
  store.subscribe(() => reading && request());
}

// The Atlas (v2 Phase 6): a world map with a time slider. Canvas drawing of the Natural Earth base
// map (public/atlas/geo.json) in the Kingdom Map's illustrated style, with the book's places,
// routes, empires (soft, approximate areas) and located events fading in and out as the year
// changes. Drag, pinch, Ctrl + wheel (plain wheel once the map has focus), keys, a play button.
// The list on the page is the accessible way through; the panel shows the same entry's text.
import { position, yearAt, formatDate } from '../lib/time-scale';

type Win = [number, number] | null;
type Place = { id: string; n: string; t: string; r: string; x: number; y: number; w: Win; k: number; ex: [number, number, number | null][] | null; ev: [number, number, string, string][] };
type Route = { id: string; n: string; w: Win; pts: [number, number][] };
type Geo = { width: number; height: number; edge: number[]; graticule: number[][]; land: number[][]; lakes: number[][]; rivers: number[][] };

const root = document.querySelector<HTMLElement>('[data-atlas]');
if (root) start(root);

function start(root: HTMLElement) {
  const S: Record<string, string> = JSON.parse(root.dataset.strings ?? '{}');
  const lang = root.dataset.lang === 'bg' ? 'bg' : 'en';
  const data = JSON.parse(document.getElementById('atlas-data')?.textContent ?? '{}') as { range: [number, number]; places: Place[]; routes: Route[] };
  const frame = root.querySelector<HTMLElement>('[data-frame]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const ctx = canvas.getContext('2d')!;
  const slider = root.querySelector<HTMLInputElement>('[data-slider]')!;
  const yearLabel = root.querySelector<HTMLElement>('[data-year-label]')!;
  const yearCount = root.querySelector<HTMLElement>('[data-year-count]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;
  const panelBody = root.querySelector<HTMLElement>('[data-panel-body]')!;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-play]')!;
  const hint = root.querySelector<HTMLElement>('.at-hint')!;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // ---------- time ----------
  const U0 = position(data.range[0]), U1 = position(data.range[1]);
  let u = U1;                     // where the slider is, on the timeline's compressed scale (0–100)
  let allTimes = false;
  const FADE = 0.7;               // fade in / out over this much of the scale
  const NATURAL = new Set(['region', 'sea', 'river', 'mountain']);
  const fade = (w: Win, type?: string) => {
    if (allTimes) return 1;
    // Undated towns and sites wait for "All times"; rivers, seas and regions are always there.
    if (!w) return type && !NATURAL.has(type) ? 0 : 1;
    const a = position(w[0]), b = position(w[1]);
    const d = u < a ? a - u : u > b ? u - b : 0;
    return clamp(1 - d / FADE, 0, 1);
  };
  /** Century steps (decades after 1500, coarser in deep time). */
  function snap(year: number): number {
    if (year < -10000) return year;
    const step = year < -3000 ? 500 : year < 1500 ? 100 : 10;
    return Math.round(year / step) * step;
  }
  const yearText = (y: number) => formatDate({ start: y, end: y }, lang);
  function setU(nu: number, fromSlider = false) {
    u = clamp(nu, U0, U1);
    const y = Math.round(yearAt(u));
    if (!fromSlider) slider.value = String(Math.round(((u - U0) / (U1 - U0)) * 1000));
    const label = yearText(y);
    yearLabel.textContent = label;
    slider.setAttribute('aria-valuetext', label);
    schedule();
  }
  slider.addEventListener('input', () => {
    const raw = U0 + ((U1 - U0) * Number(slider.value)) / 1000;
    const y = snap(yearAt(raw));
    setU(y < -10000 ? raw : position(y), true);
    stopPlay();
  });

  // ---------- play ----------
  let playing = false, last = 0, playRaf = 0;
  function stopPlay() { if (!playing) return; playing = false; cancelAnimationFrame(playRaf); playBtn.setAttribute('aria-pressed', 'false'); playBtn.querySelector('[data-play-label]')!.textContent = S.play; }
  playBtn.addEventListener('click', () => {
    if (playing) { stopPlay(); return; }
    if (u >= U1 - 0.01) setU(U0);
    playing = true; last = performance.now();
    playBtn.setAttribute('aria-pressed', 'true'); playBtn.querySelector('[data-play-label]')!.textContent = S.pause;
    const step = (now: number) => {
      if (!playing) return;
      // 70 seconds for the whole range; with reduced motion, jump a step at a time.
      const dt = Math.min(0.1, (now - last) / 1000);
      if (calm()) { if (now - last > 700) { last = now; setU(u + (U1 - U0) / 40); } }
      else { last = now; setU(u + ((U1 - U0) / 70) * dt); }
      if (u >= U1) { stopPlay(); return; }
      playRaf = requestAnimationFrame(step);
    };
    playRaf = requestAnimationFrame(step);
  });

  // ---------- layers ----------
  const layers = new Set(['places', 'routes', 'empires', 'events']);
  root.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((c) => c.addEventListener('change', () => { c.checked ? layers.add(c.value) : layers.delete(c.value); schedule(); }));
  root.querySelector<HTMLInputElement>('[data-all-times]')?.addEventListener('change', (e) => { allTimes = (e.target as HTMLInputElement).checked; slider.disabled = allTimes; playBtn.disabled = allTimes; stopPlay(); schedule(); });

  // ---------- view ----------
  let W = 1, H = 1, dpr = 1, s = 0.2, cx = 2740, cy = 1300;
  let geo: Geo | null = null;
  const P2D: Record<string, Path2D> = {};
  const sMin = () => Math.min(W / 5600, H / 2950);
  const sMax = 6;
  function resize() {
    const r = frame.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    s = clamp(s, sMin(), sMax);
    schedule();
  }
  const toScreen = (x: number, y: number): [number, number] => [W / 2 + (x - cx) * s, H / 2 + (y - cy) * s];
  const toMap = (sx: number, sy: number): [number, number] => [cx + (sx - W / 2) / s, cy + (sy - H / 2) / s];
  function clampView() {
    s = clamp(s, sMin(), sMax);
    const hw = W / 2 / s, hh = H / 2 / s;
    cx = hw * 2 >= 5480 ? 2740 : clamp(cx, hw - 80, 5560 - hw);
    cy = hh * 2 >= 2860 ? 1430 : clamp(cy, hh - 80, 2940 - hh);
  }

  // ---------- drawing ----------
  const css = () => getComputedStyle(root);
  let col: Record<string, string> = {};
  let serif = 'Georgia, serif', sans = 'system-ui, sans-serif';
  const readColours = () => { const c = css();
    serif = c.getPropertyValue('--font-serif').trim() || serif; sans = c.getPropertyValue('--font-sans').trim() || sans; col = Object.fromEntries(['sea', 'sea-line', 'land', 'ink', 'coast', 'river', 'grat', 'paper', 'label', 'halo', 'accent', 'route', 'empire', 'event'].map((k) => [k, c.getPropertyValue(`--at-${k}`).trim()])); };
  const decode = (arr: number[], path: Path2D, close: boolean) => {
    let x = 0, y = 0;
    for (let i = 0; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; i ? path.lineTo(x, y) : path.moveTo(x, y); }
    if (close) path.closePath();
  };
  function buildPaths(g: Geo) {
    for (const k of ['land', 'lakes', 'rivers', 'graticule'] as const) {
      const p = new Path2D();
      for (const r of g[k]) decode(r, p, k === 'land' || k === 'lakes');
      P2D[k] = p;
    }
    P2D.edge = new Path2D(); decode(g.edge, P2D.edge, true);
  }

  // Empires: a soft, rounded area around their key cities (never a border).
  const hullCache = new Map<string, Path2D>();
  function empireArea(p: Place): Path2D {
    // Only the cities that belong to it by the slider's year (allTimes: all of them).
    const year = yearAt(u);
    const cities = (p.ex ?? [[p.x, p.y, null]]).filter(([, , from]) => allTimes || from === null || from <= year);
    const key = `${p.id}:${cities.length}`;
    let path = hullCache.get(key);
    if (path) return path;
    const pts: [number, number][] = [];
    const pad = 70;
    for (const [x, y] of cities) for (let i = 0; i < 10; i++) pts.push([x + pad * Math.cos((i / 10) * 6.283), y + pad * Math.sin((i / 10) * 6.283)]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [], upper: [number, number][] = [];
    for (const q of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    path = new Path2D();
    const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(hull[hull.length - 1], hull[0]);
    path.moveTo(m0[0], m0[1]);
    for (let i = 0; i < hull.length; i++) { const a = hull[i], m = mid(a, hull[(i + 1) % hull.length]); path.quadraticCurveTo(a[0], a[1], m[0], m[1]); }
    path.closePath();
    hullCache.set(key, path);
    return path;
  }
  const routePath = new Map<string, Path2D>();
  function routeLine(r: Route): Path2D {
    let p = routePath.get(r.id);
    if (p) return p;
    p = new Path2D();
    r.pts.forEach(([x, y], i) => {
      if (!i) { p!.moveTo(x, y); return; }
      const [px, py] = r.pts[i - 1];
      // Crossing the Pacific: off one edge of the flat map, back on at the other.
      if (Math.abs(x - px) > 2740) {
        const dir = x < px ? 1 : -1, x2 = x + dir * 5480, k = ((dir > 0 ? 5480 : 0) - px) / (x2 - px), ym = py + (y - py) * k;
        p!.lineTo(dir > 0 ? 5480 : 0, ym); p!.moveTo(dir > 0 ? 0 : 5480, ym); p!.lineTo(x, y);
        return;
      }
      const dx = x - px, dy = y - py, len = Math.hypot(dx, dy) || 1, bend = Math.min(160, len * 0.18);
      p!.quadraticCurveTo((px + x) / 2 - (dy / len) * bend, (py + y) / 2 + (dx / len) * bend, x, y);
    });
    routePath.set(r.id, p);
    return p;
  }

  type Hit = { kind: 'place' | 'route'; id: string; x: number; y: number; r: number; alpha: number };
  let hits: Hit[] = [], empireHits: { id: string; path: Path2D }[] = [], routeHits: { id: string; pts: [number, number][] }[] = [];
  let selected: string | null = null;
  let raf = 0, lowFi = false, frameMs = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const ICON: Record<string, number> = { city: 3.6, site: 3.4, 'route-point': 3, mountain: 4.2 };
  const TEXTY = new Set(['region', 'sea', 'river']);

  function draw() {
    raf = 0;
    const t0 = performance.now();
    clampView();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.paper; ctx.fillRect(0, 0, W, H);
    if (!geo) return;
    const k = dpr * s;
    ctx.setTransform(k, 0, 0, k, dpr * (W / 2 - cx * s), dpr * (H / 2 - cy * s));
    ctx.fillStyle = col.sea; ctx.fill(P2D.edge);
    ctx.lineWidth = 0.7 / s; ctx.strokeStyle = col.grat; ctx.stroke(P2D.graticule);
    // Engraved coast: soft rings of sea-ink round the land, then the land, then the ink line.
    if (!lowFi) {
      ctx.lineJoin = 'round'; ctx.strokeStyle = col['sea-line']; ctx.globalAlpha = 0.22; ctx.lineWidth = 11 / s; ctx.stroke(P2D.land);
      ctx.globalAlpha = 0.35; ctx.lineWidth = 5 / s; ctx.stroke(P2D.land); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = col.land; ctx.fill(P2D.land);
    ctx.fillStyle = col.sea; ctx.fill(P2D.lakes);
    if (!lowFi || s > 0.6) { ctx.strokeStyle = col.river; ctx.lineWidth = Math.min(1.6, 0.9 + s * 0.2) / s; ctx.stroke(P2D.rivers); }
    ctx.strokeStyle = col.coast; ctx.lineWidth = 1.1 / s; ctx.stroke(P2D.land); ctx.lineWidth = 0.7 / s; ctx.stroke(P2D.lakes);
    ctx.strokeStyle = col.ink; ctx.lineWidth = 1.4 / s; ctx.stroke(P2D.edge);

    // Empires.
    empireHits = [];
    const labels: { x: number; y: number; text: string; pri: number; font: string; colour: string; alpha: number; kind: string }[] = [];
    if (layers.has('empires')) for (const p of data.places) {
      if (p.t !== 'empire') continue;
      const a = fade(p.w);
      if (a < 0.02) continue;
      const area = empireArea(p);
      ctx.globalAlpha = 0.16 * a; ctx.fillStyle = col.empire; ctx.fill(area);
      if (!lowFi) { ctx.globalAlpha = 0.1 * a; ctx.lineWidth = 22 / s; ctx.strokeStyle = col.empire; ctx.stroke(area); }
      ctx.globalAlpha = 0.55 * a; ctx.setLineDash([6 / s, 6 / s]); ctx.lineWidth = 1.2 / s; ctx.stroke(area); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      empireHits.push({ id: p.id, path: area });
      const [sx, sy] = toScreen(p.x, p.y);
      labels.push({ x: sx, y: sy - 18, text: `${p.n} ≈`, pri: 50 + p.k, font: `italic 600 ${clamp(12 + s * 6, 12, 20)}px ${serif}`, colour: col.empire, alpha: a, kind: 'empire' });
    }
    // Routes.
    routeHits = [];
    if (layers.has('routes')) for (const r of data.routes) {
      const a = fade(r.w);
      if (a < 0.02 || r.pts.length < 2) continue;
      ctx.globalAlpha = a; ctx.strokeStyle = col.route; ctx.lineWidth = 2.4 / s; ctx.setLineDash([9 / s, 6 / s]);
      ctx.stroke(routeLine(r)); ctx.setLineDash([]); ctx.globalAlpha = 1;
      routeHits.push({ id: r.id, pts: r.pts.map(([x, y]) => toScreen(x, y)) });
      if (selected === r.id) { ctx.globalAlpha = 0.35; ctx.lineWidth = 8 / s; ctx.stroke(routeLine(r)); ctx.globalAlpha = 1; }
    }

    // Places, events and labels, in screen space for crisp text.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits = [];
    let shown = 0;
    const now = performance.now();
    if (layers.has('places') || layers.has('events')) for (const p of data.places) {
      if (p.t === 'empire') continue;
      const a = fade(p.w, p.t);
      const [sx, sy] = toScreen(p.x, p.y);
      if (sx < -60 || sy < -40 || sx > W + 60 || sy > H + 40) continue;
      // An event at this place close to the slider's year: a pulse and its label.
      const ev = layers.has('events') && !allTimes ? p.ev.find(([a0, b0]) => Math.abs(position((a0 + b0) / 2) - u) < 0.45) : undefined;
      if (a < 0.02 && !ev) continue;
      const alpha = Math.max(a, ev ? 1 : 0);
      if (layers.has('places') || ev) {
        shown++;
        ctx.globalAlpha = alpha;
        if (TEXTY.has(p.t)) {
          labels.push({ x: sx, y: sy, text: p.n, pri: 5 + p.k, font: `italic ${p.t === 'region' ? 600 : 500} ${clamp(11 + s * 5, 11, 17)}px ${serif}`, colour: p.t === 'region' ? col.label : col.river, alpha, kind: p.t });
        } else {
          const r = (ICON[p.t] ?? 3.4) * (p.id === selected ? 1.5 : 1);
          ctx.beginPath();
          if (p.t === 'site') { ctx.moveTo(sx, sy - r - 1); ctx.lineTo(sx + r + 1, sy); ctx.lineTo(sx, sy + r + 1); ctx.lineTo(sx - r - 1, sy); ctx.closePath(); }
          else if (p.t === 'mountain') { ctx.moveTo(sx - r - 1, sy + r); ctx.lineTo(sx, sy - r - 1); ctx.lineTo(sx + r + 1, sy + r); ctx.closePath(); }
          else ctx.arc(sx, sy, r, 0, 6.283);
          ctx.fillStyle = col.paper; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = col.ink; ctx.stroke();
          if (p.t === 'city') { ctx.beginPath(); ctx.arc(sx, sy, r * 0.45, 0, 6.283); ctx.fillStyle = col.ink; ctx.fill(); }
          labels.push({ x: sx + r + 4, y: sy, text: p.n, pri: 20 + Math.min(40, p.k * 2), font: `500 ${clamp(11 + s * 2.5, 11, 15)}px ${sans}`, colour: col.label, alpha, kind: 'place' });
        }
        hits.push({ kind: 'place', id: p.id, x: sx, y: sy, r: 14, alpha });
      }
      if (ev) {
        const pulse = calm() ? 0.5 : (now / 1400) % 1;
        ctx.globalAlpha = 1 - pulse; ctx.strokeStyle = col.event; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 6 + pulse * 16, 0, 6.283); ctx.stroke();
        labels.push({ x: sx + 8, y: sy + 15, text: `${ev[3]}: ${ev[2]}`, pri: 200, font: `600 12px ${sans}`, colour: col.event, alpha: 1, kind: 'event' });
      }
      if (p.id === selected) { ctx.globalAlpha = 1; ctx.strokeStyle = col.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 6.283); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // Labels: most important first; skip any that would overlap one already placed.
    labels.sort((a, b) => b.pri - a.pri);
    const placed: [number, number, number, number][] = [];
    ctx.textBaseline = 'middle';
    for (const l of labels) {
      ctx.font = l.font;
      const w = ctx.measureText(l.text).width, h = 15;
      const centre = l.kind !== 'place' && l.kind !== 'event';
      const x0 = centre ? l.x - w / 2 : l.x;
      const box: [number, number, number, number] = [x0 - 2, l.y - h / 2, x0 + w + 2, l.y + h / 2];
      if (placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
      placed.push(box);
      ctx.globalAlpha = l.alpha;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = col.halo;
      ctx.strokeText(l.text, x0, l.y); ctx.fillStyle = l.colour; ctx.fillText(l.text, x0, l.y);
    }
    ctx.globalAlpha = 1;
    yearCount.textContent = allTimes ? '' : ` · ${fill(S.showing, { n: shown })}`;
    frameMs = performance.now() - t0;
    root.dataset.frameMs = frameMs.toFixed(1);
    // Keep pulsing while an event is shown.
    if (!calm() && labels.some((l) => l.kind === 'event')) setTimeout(schedule, 60);
  }

  // ---------- picking and the panel ----------
  function pick(sx: number, sy: number): string | null {
    let best: Hit | null = null, bd = Infinity;
    for (const h of hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d < h.r && d < bd && h.alpha > 0.15) { bd = d; best = h; } }
    if (best) return best.id;
    for (const r of routeHits) for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const tt = clamp(((sx - ax) * dx + (sy - ay) * dy) / L2, 0, 1);
      if (Math.hypot(ax + tt * dx - sx, ay + tt * dy - sy) < 9) return r.id;
    }
    const [mx, my] = toMap(sx, sy);
    for (const e of empireHits) if (inArea(e.path, mx, my)) return e.id;
    return null;
  }
  // Hit test in map units (isPointInPath applies the current transform, so clear it first).
  function inArea(path: Path2D, x: number, y: number) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const r = ctx.isPointInPath(path, x, y); ctx.restore(); return r; }

  function open(id: string, focus = true) {
    const item = document.getElementById(`at-${id}`);
    if (!item) return;
    selected = id;
    panelBody.innerHTML = item.querySelector('.at-body')!.innerHTML;
    const h = panelBody.querySelector('.at-name');
    if (h) { h.id = 'at-panel-title'; h.setAttribute('tabindex', '-1'); }
    panelBody.querySelectorAll('[data-show]').forEach((b) => b.remove());
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-open'));
    if (focus) (h as HTMLElement | null)?.focus({ preventScroll: true });
    const url = new URL(location.href);
    url.searchParams.set('place', id); url.searchParams.set('year', String(Math.round(yearAt(u))));
    history.replaceState(null, '', url);
    schedule();
  }
  function close() {
    panel.classList.remove('is-open'); panel.hidden = true; selected = null; schedule();
    const url = new URL(location.href); url.searchParams.delete('place'); history.replaceState(null, '', url);
  }
  panel.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-close]')) { close(); frame.focus({ preventScroll: true }); }
    const a = el.closest<HTMLAnchorElement>('a[href^="#at-"]');
    if (a) { e.preventDefault(); show(a.getAttribute('href')!.slice(4)); }
  });

  /** Fly to a place or route, and move the slider into its time if it isn't shown now. */
  function show(id: string, year?: number) {
    const p = data.places.find((q) => q.id === id), r = data.routes.find((q) => q.id === id);
    const w = p?.w ?? r?.w ?? null;
    if (year !== undefined) setU(position(year));
    else if (w && fade(w) < 0.5) setU(position((w[0] + w[1]) / 2));
    const pts: number[][] = p ? (p.ex ? p.ex.map(([x, y]) => [x, y]) : [[p.x, p.y]]) : r ? r.pts : [];
    if (pts.length) {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const bw = Math.max(...xs) - Math.min(...xs) + 400, bh = Math.max(...ys) - Math.min(...ys) + 300;
      const ts = clamp(Math.min(W / bw, H / bh), sMin(), p && !p.ex ? Math.max(1.2, s) : 2.5);
      flyTo((Math.max(...xs) + Math.min(...xs)) / 2 + (W > 900 ? 170 / ts : 0), (Math.max(...ys) + Math.min(...ys)) / 2 + (W <= 900 ? 120 / ts : 0), ts);
    }
    open(id, false);
  }
  let anim = 0;
  function flyTo(tx: number, ty: number, ts: number, dur = 800) {
    cancelAnimationFrame(anim);
    if (calm()) { cx = tx; cy = ty; s = ts; schedule(); return; }
    const c0 = [cx, cy], s0 = s, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      cx = c0[0] + (tx - c0[0]) * e; cy = c0[1] + (ty - c0[1]) * e; s = Math.exp(Math.log(s0) + (Math.log(ts) - Math.log(s0)) * e);
      lowFi = t < 1 && frameMs > 18; schedule();
      if (t < 1) anim = requestAnimationFrame(step); else { lowFi = false; schedule(); }
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- pointer, wheel, keys ----------
  const pointers = new Map<number, [number, number]>();
  let grab: [number, number] | null = null, pinch: { d0: number; s0: number; m: [number, number] } | null = null, down: [number, number] | null = null, dragged = false;
  const local = (e: { clientX: number; clientY: number }): [number, number] => { const r = frame.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onUi = (e: Event) => Boolean((e.target as HTMLElement).closest('.at-ui, .at-panel'));
  frame.addEventListener('pointerdown', (e) => {
    if (onUi(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(anim);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) { down = local(e); dragged = false; grab = toMap(...down); }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s0: s, m: toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
      grab = null; dragged = true;
    }
  });
  frame.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      s = clamp(pinch.s0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d0, sMin(), sMax);
      cx = pinch.m[0] - ((a[0] + b[0]) / 2 - W / 2) / s; cy = pinch.m[1] - ((a[1] + b[1]) / 2 - H / 2) / s;
      lowFi = frameMs > 18; schedule(); return;
    }
    if (grab && down) {
      const p = local(e);
      if (!dragged && Math.hypot(p[0] - down[0], p[1] - down[1]) < 6) return;
      if (!dragged) { dragged = true; try { frame.setPointerCapture(e.pointerId); } catch { /* fine */ } frame.classList.add('is-grabbing'); }
      cx = grab[0] - (p[0] - W / 2) / s; cy = grab[1] - (p[1] - H / 2) / s;
      lowFi = frameMs > 18; schedule();
    }
  });
  const lift = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) { const [p] = [...pointers.values()]; grab = toMap(...p); down = p; }
    if (!pointers.size) { grab = null; frame.classList.remove('is-grabbing'); if (lowFi) { lowFi = false; schedule(); } }
  };
  frame.addEventListener('pointerup', lift);
  frame.addEventListener('pointercancel', lift);
  frame.addEventListener('click', (e) => {
    if (onUi(e)) return;
    if (dragged) { dragged = false; return; }
    const id = pick(...local(e));
    id ? open(id) : close();
  });
  frame.addEventListener('mousemove', (e) => { if (!pointers.size) frame.style.cursor = pick(...local(e)) ? 'pointer' : ''; });
  let hintTimer = 0;
  frame.addEventListener('wheel', (e) => {
    const engaged = root.classList.contains('at-is-full') || frame.contains(document.activeElement);
    if (!engaged && !e.ctrlKey) {
      hint.textContent = S.wheelHint; hint.classList.add('is-on');
      clearTimeout(hintTimer); hintTimer = window.setTimeout(() => hint.classList.remove('is-on'), 1400);
      return;
    }
    e.preventDefault();
    const p = local(e), m = toMap(...p);
    s = clamp(s * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), sMin(), sMax);
    cx = m[0] - (p[0] - W / 2) / s; cy = m[1] - (p[1] - H / 2) / s;
    schedule();
  }, { passive: false });
  frame.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.at-panel')) { if (e.key === 'Escape') { close(); frame.focus(); } return; }
    const step = 120 / s, k = e.key;
    if (k === 'ArrowLeft') flyTo(cx - step, cy, s, 200);
    else if (k === 'ArrowRight') flyTo(cx + step, cy, s, 200);
    else if (k === 'ArrowUp') flyTo(cx, cy - step, s, 200);
    else if (k === 'ArrowDown') flyTo(cx, cy + step, s, 200);
    else if (k === '+' || k === '=') flyTo(cx, cy, s * 1.5, 250);
    else if (k === '-' || k === '_') flyTo(cx, cy, s / 1.5, 250);
    else if (k === ',' || k === '.') { const y = yearAt(u), st = y < -3000 ? 1000 : y < 1500 ? 100 : 10; setU(position(snap(y + (k === '.' ? st : -st)))); }
    else if (k === 'Escape') { if (!panel.hidden) close(); else if (root.classList.contains('at-is-full')) setFull(false); else return; }
    else return;
    e.preventDefault();
  });
  // Escape also closes an open panel when nothing in particular has focus (e.g. opened from a link).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && (document.activeElement === document.body || !document.activeElement)) close();
  });
  root.querySelector('.at-zoom')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.zoom === 'in') flyTo(cx, cy, s * 1.6, 300);
    else if (b.dataset.zoom === 'out') flyTo(cx, cy, s / 1.6, 300);
    else if (b.dataset.zoom === 'all') flyTo(2740, 1380, sMin());
    else if ('full' in b.dataset) setFull(!root.classList.contains('at-is-full'));
  });
  function setFull(on: boolean) {
    root.classList.toggle('at-is-full', on);
    document.documentElement.classList.toggle('km-lock', on);
    root.querySelector('[data-full]')!.setAttribute('aria-pressed', String(on));
    if (on) frame.focus({ preventScroll: true });
  }

  // ---------- the list: search, "show on map" ----------
  const items = [...root.querySelectorAll<HTMLElement>('.at-item')];
  const status = root.querySelector<HTMLElement>('[data-at-status]')!;
  root.querySelector<HTMLInputElement>('[data-at-search]')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    let n = 0;
    for (const it of items) { const ok = !q || it.dataset.name!.includes(q); it.hidden = !ok; if (ok) n++; }
    root.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => { g.hidden = ![...g.querySelectorAll<HTMLElement>('.at-item')].some((i) => !i.hidden); });
    status.textContent = q ? (n ? fill(S.showing, { n }) : S.nothing) : '';
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-show]');
    if (!b) return;
    frame.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
    show(b.dataset.show!);
  });

  // ---------- go ----------
  readColours();
  new ResizeObserver(resize).observe(frame);
  new MutationObserver(() => { readColours(); schedule(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColours(); schedule(); });
  resize();
  // Start on the whole world (wide screens) or on Afro-Eurasia, where most of the book happens (phones).
  if (W < 700) { s = clamp(H / 2300, sMin(), sMax); cx = 3150; cy = 1180; } else { s = Math.max(sMin(), Math.min(W / 5000, H / 2500)); cx = 2800; cy = 1300; }
  const params = new URLSearchParams(location.search);
  const y0 = params.get('year');
  setU(y0 !== null && !Number.isNaN(Number(y0)) ? position(Number(y0)) : position(1450));
  fetch('/atlas/geo.json').then((r) => r.json()).then((g: Geo) => {
    geo = g; buildPaths(g);
    root.classList.add('is-ready');
    const place = params.get('place');
    if (place && document.getElementById(`at-${place}`)) show(place, y0 !== null ? Number(y0) : undefined);
    schedule();
  }).catch(() => root.classList.add('is-failed'));
  // Test hook for the browser checks.
  Object.assign(root, { atView: () => ({ cx, cy, s, u, year: Math.round(yearAt(u)), selected, frameMs, shown: hits.length }), atScreen: (x: number, y: number) => { const r = frame.getBoundingClientRect(); const [a, b] = toScreen(x, y); return [r.left + a, r.top + b]; } });
}

// Chapter Trailers (Motion & Story, M1): a short film for each chapter, generated from its data.
// Title card (the emblem draws itself, the title is set letter by letter) → the timeline zooms to
// the chapter's time → the camera flies over the Atlas's world → places appear, routes draw
// themselves with ships sailing them, empires bloom, events pulse with captions while a date
// counter runs → key terms → the end card (the chapter's size, "Start reading").
// Every frame is computed from the clock alone, so the film can be paused and scrubbed freely.
// A narrator (the UK English Male voice, content-meta/trailer-scripts.json) reads a short script
// over the film; a scene lasts long enough for its line, and the picture waits for the voice.
// Reduced motion opens the storyboard (the same story as text) instead.
import { EMBLEMS } from '../map/emblems';
import { position } from '../lib/time-scale';
import { formatDate } from '../lib/time-scale';
import { narrator } from '../scripts/listen-engine';

type XY = [number, number];
type Data = {
  label: string; title: string; standfirst: string; part: number; emblem: string; url: string; first: string | null;
  span: [number, number] | null; spanText: string | null; spans: [string, number, number][];
  sections: string[]; minutes: number;
  places: { n: string; t: string; xy: XY; k: number }[];
  events: { y: number; d: string; l: string; xy: XY | null }[];
  routes: { n: string; from: number | null; to: number | null; pts: XY[] }[];
  empires: { n: string; from: number | null; to: number | null; pts: [number, number, number | null][] }[];
  terms: { t: string; d: string }[];
  narration: [string, string][];
};
type Geo = { edge: number[]; graticule: number[][]; land: number[][]; lakes: number[][]; rivers: number[][] };
type Beat = { y: number; date: string; label: string; xy: XY | null; t: number };
type Strings = Record<string, string>;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (x: number) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); }; // smootherstep
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const back = (x: number) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const win = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) => clamp(Math.min((t - a) / fi, (b - t) / fo)); // fade in/out window
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

// The night-atlas palette: trailers are always "lantern-lit", like a film in a dark room.
const C = { bg: '#070c13', sea: '#0d1824', seaLine: '#2c4a63', land: '#26231d', coast: '#d9c38f', river: '#3a6a88', grat: 'rgba(120,150,190,.12)',
  gold: '#ffc65a', ink: '#efe4c8', dim: 'rgba(239,228,200,.55)', route: '#d7a6ff', empire: '#ffb15a', event: '#ff8a6b' };

function emblemPaths(svg: string) {
  const out: { p: Path2D; fill: boolean }[] = [];
  const attr = (s: string, n: string) => Number(s.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? 0);
  for (const m of svg.matchAll(/<(path|circle|rect|ellipse)([^>]*)\/?>/g)) {
    const [, tag, a] = m; const p = new Path2D();
    if (tag === 'path') p.addPath(new Path2D(a.match(/\bd="([^"]*)"/)?.[1] ?? ''));
    else if (tag === 'circle') p.arc(attr(a, 'cx'), attr(a, 'cy'), attr(a, 'r'), 0, Math.PI * 2);
    else if (tag === 'ellipse') p.ellipse(attr(a, 'cx'), attr(a, 'cy'), attr(a, 'rx'), attr(a, 'ry'), 0, 0, Math.PI * 2);
    else { const x = attr(a, 'x'), y = attr(a, 'y'), w = attr(a, 'width'), h = attr(a, 'height'), r = attr(a, 'rx'); if (p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h); }
    out.push({ p, fill: /class="f"/.test(a) });
  }
  return out;
}

export async function openTrailer(opts: { label: string; lang: 'en' | 'bg'; strings: Strings }) {
  const { label, lang, strings: S } = opts;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const dlg = document.createElement('dialog');
  dlg.className = 'tr';
  dlg.setAttribute('aria-label', S.title);
  dlg.innerHTML = `
    <canvas class="tr-canvas" aria-hidden="true"></canvas>
    <p class="tr-cap" aria-hidden="true"><span class="tr-cap-date"></span><span class="tr-cap-text"></span></p>
    <div class="tr-end" hidden>
      <a class="btn btn-primary" data-tr-start>${esc(S.start)} →</a>
      <a class="btn" data-tr-contents>${esc(S.contents)}</a>
      <button type="button" class="btn btn-quiet" data-tr-again>${esc(S.again)}</button>
    </div>
    <section class="tr-board" hidden aria-labelledby="tr-board-h"><div class="tr-board-in"></div></section>
    <div class="tr-bar">
      <button type="button" class="tr-btn" data-tr-play aria-label="${esc(S.pause)}"><span class="tr-i-pause" aria-hidden="true"></span></button>
      <input type="range" class="tr-scrub" min="0" max="1000" value="0" step="1" aria-label="${esc(S.position)}" data-tr-scrub />
      <span class="tr-time" data-tr-time>0:00</span>
      <button type="button" class="tr-btn tr-btn-text" data-tr-voice aria-pressed="true" hidden>${esc(S.narration ?? 'Narration')}</button>
      <button type="button" class="tr-btn tr-btn-text" data-tr-board aria-pressed="false">${esc(S.storyboard)}</button>
      <button type="button" class="tr-btn" data-tr-close aria-label="${esc(S.close)}">×</button>
    </div>`;
  document.body.appendChild(dlg);
  document.documentElement.classList.add('km-lock');
  dlg.showModal();
  const canvas = dlg.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const cap = dlg.querySelector<HTMLElement>('.tr-cap')!;
  const capDate = dlg.querySelector<HTMLElement>('.tr-cap-date')!, capText = dlg.querySelector<HTMLElement>('.tr-cap-text')!;
  const endEl = dlg.querySelector<HTMLElement>('.tr-end')!;
  const board = dlg.querySelector<HTMLElement>('.tr-board')!;
  const playBtn = dlg.querySelector<HTMLButtonElement>('[data-tr-play]')!;
  const scrub = dlg.querySelector<HTMLInputElement>('[data-tr-scrub]')!;
  const timeEl = dlg.querySelector<HTMLElement>('[data-tr-time]')!;
  const boardBtn = dlg.querySelector<HTMLButtonElement>('[data-tr-board]')!;
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue('--font-serif').trim() || 'Georgia, serif';
  const sans = css.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';

  let W = 1, H = 1, dpr = 1;
  const resize = () => { W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; frame(); };
  addEventListener('resize', resize);

  const prefix = lang === 'bg' ? '/bg' : '';
  const [data, geo, voice] = await Promise.all([
    fetch(`${prefix === '/bg' ? '/trailers/bg' : '/trailers/en'}/${label}.json`).then((r) => r.json() as Promise<Data>),
    fetch('/atlas/geo.json').then((r) => r.json() as Promise<Geo>).catch(() => null),
    narrator(lang).catch(() => undefined),
  ]);
  (dlg.querySelector('[data-tr-start]') as HTMLAnchorElement).href = data.first ?? data.url;
  (dlg.querySelector('[data-tr-contents]') as HTMLAnchorElement).href = data.url;

  // ---------- the base map, as paths in atlas units ----------
  const P: Record<string, Path2D> = {};
  if (geo) {
    const decode = (arr: number[], path: Path2D, close: boolean) => { let x = 0, y = 0; for (let i = 0; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; i ? path.lineTo(x, y) : path.moveTo(x, y); } if (close) path.closePath(); };
    for (const k of ['land', 'lakes', 'rivers', 'graticule'] as const) { const p = new Path2D(); for (const r of geo[k]) decode(r, p, k === 'land' || k === 'lakes'); P[k] = p; }
    P.edge = new Path2D(); decode(geo.edge, P.edge, true);
  }
  const emblem = emblemPaths(EMBLEMS[data.emblem] ?? EMBLEMS.banner);

  // ---------- the script: when each scene happens ----------
  const hasSpan = Boolean(data.span);
  const pts: XY[] = [...data.places.map((p) => p.xy), ...data.events.filter((e) => e.xy).map((e) => e.xy!), ...data.routes.flatMap((r) => r.pts)];
  // A map scene needs somewhere to go: three places, or an event that happened somewhere.
  const hasMap = Boolean(geo) && (data.places.length >= 3 || data.events.some((e) => e.xy));
  // Story beats: events, the start of each route and each empire, in date order.
  let beats: Beat[] = [];
  if (hasSpan) {
    const [a, b] = data.span!;
    const eventBeats = data.events.map((e) => ({ y: e.y, date: e.d, label: e.l, xy: e.xy }));
    // A route or empire starting in the same year as an event adds nothing new: the event tells it.
    const eventYears = new Set(eventBeats.map((e) => e.y));
    const startBeats = [
      ...data.routes.filter((r) => r.from !== null).map((r) => ({ y: r.from!, label: r.n, xy: r.pts[0] as XY | null })),
      ...data.empires.filter((e) => e.from !== null && e.from >= a - 50 && e.from <= b).map((e) => ({ y: e.from!, label: e.n, xy: null as XY | null })),
    ].filter((x) => !eventYears.has(x.y)).map((x) => ({ ...x, date: formatDate({ start: x.y, end: x.y }, lang) }));
    beats = [...eventBeats, ...startBeats].sort((p, q) => p.y - q.y).slice(0, 10).map((x) => ({ ...x, t: 0 }));
  }
  // The narration: each line belongs to a scene, and each scene lasts at least as long as its lines
  // take to say. A line for a scene this film lacks moves on to the next scene, or back to the one
  // before when only the end card is left; a key-terms line is dropped when no terms are shown (it
  // would name things nobody sees). "sections" is the old name of the end card's first line.
  const ORDER = ['title', 'when', 'where', 'story', 'terms', 'end'];
  const present = new Set(['title', ...(hasSpan ? ['when'] : []), ...(hasMap ? ['where'] : []), ...(beats.length ? ['story'] : []), ...(data.terms.length ? ['terms'] : []), 'end']);
  const sceneFor = (sc: string): string | null => {
    if (sc === 'sections' || sc === 'end') return 'end';
    if (sc === 'terms' && !present.has('terms')) return null;
    const i = Math.max(0, ORDER.indexOf(sc));
    return ORDER.slice(i, -1).find((x) => present.has(x)) ?? ORDER.slice(0, i).reverse().find((x) => present.has(x)) ?? 'end';
  };
  /** Roughly how long a line takes to say, in seconds. */
  const sayLen = (text: string) => text.split(/\s+/).length / 2.45 + (text.match(/[.!?](\s|$)/g)?.length ?? 1) * 0.35;
  type Line = { scene: string; text: string; start: number; len: number; state: 'wait' | 'speaking' | 'done' };
  const lines: Line[] = (data.narration ?? []).flatMap(([sc, text]) => { const scene = sceneFor(sc); return scene ? [{ scene, text, start: 0, len: sayLen(text), state: 'wait' as const }] : []; });
  const voiced = Boolean(voice) && lines.length > 0;
  const need = (sc: string) => { const l = voiced ? lines.filter((x) => x.scene === sc) : []; return l.length ? 0.9 + l.reduce((n, x) => n + x.len, 0) : 0; };
  let c = 0;
  const T: Record<string, [number, number]> = {};
  T.title = [c, (c += Math.max(5.6, need('title')))];
  if (hasSpan) T.when = [c, (c += Math.max(5.4, need('when')))];
  if (hasMap) T.where = [c, (c += Math.max(3.6, need('where')))];
  if (beats.length) {
    const gap = Math.max(3.4, (need('story') - 2.2) / beats.length);
    T.story = [c, c + 1.2 + beats.length * gap + 1];
    beats.forEach((bt, k) => { bt.t = T.story[0] + 1.2 + k * gap; });
    c = T.story[1];
  }
  if (data.terms.length) T.terms = [c, (c += Math.max(1.8 + Math.min(4, data.terms.length) * 1.7, need('terms')))];
  T.end = [c, (c += Math.max(4.5, need('end') + 1))];
  const DUR = c;
  for (const sc of ORDER) { let at = (T[sc]?.[0] ?? 0) + 0.5; for (const l of lines.filter((x) => x.scene === sc)) { l.start = at; at += l.len; } }

  // The date shown at time t during the story: runs from the chapter's start to its end, landing
  // on each beat's year as its caption appears.
  const yearKeys: [number, number][] = [];
  if (T.story && data.span) {
    yearKeys.push([T.story[0], data.span[0]]);
    let last = data.span[0];
    // The counter lands on each beat's year and holds it while the caption is up.
    for (const bt of beats) { last = Math.max(last, bt.y); yearKeys.push([bt.t, last], [bt.t + 1.9, last]); }
    yearKeys.push([T.story[1], Math.max(last, data.span[1])]);
  }
  const yearAtT = (t: number) => {
    if (!yearKeys.length) return null;
    if (t <= yearKeys[0][0]) return yearKeys[0][1];
    for (let i = 1; i < yearKeys.length; i++) {
      const [t0, y0] = yearKeys[i - 1], [t1, y1] = yearKeys[i];
      if (t <= t1) return y0 + (y1 - y0) * ease((t - t0) / Math.max(0.01, t1 - t0));
    }
    return yearKeys[yearKeys.length - 1][1];
  };
  // When a year is first reached (for routes and empires to start drawing).
  const tOfYear = (y: number) => {
    for (let i = 1; i < yearKeys.length; i++) if (yearKeys[i][1] >= y) { const [t0, y0] = yearKeys[i - 1], [t1, y1] = yearKeys[i]; return t0 + (t1 - t0) * clamp((y - y0) / Math.max(1, y1 - y0)); }
    return Infinity;
  };

  // ---------- the camera ----------
  type Cam = { x: number; y: number; z: number }; // z: how many atlas units fit across the shorter side
  const world: Cam = { x: 2740, y: 1380, z: 2900 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const box = pts.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: 0, x1: 5480, y0: 0, y1: 2860 };
  // Fit the places on screen (z is how many map units span the screen's shorter side).
  const region = (): Cam => { const s = Math.min(W / Math.max(1, box.x1 - box.x0), H / Math.max(1, box.y1 - box.y0)) / 1.3; return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, z: Math.max(500, Math.min(W, H) / s) }; };
  function camAt(t: number): Cam {
    const R = region();
    const keys: [number, Cam][] = [];
    if (T.where) keys.push([T.where[0], world], [T.where[1], R]);
    for (const bt of beats) {
      const k: Cam = bt.xy ? { x: bt.xy[0] * 0.7 + R.x * 0.3, y: bt.xy[1] * 0.7 + R.y * 0.3, z: Math.max(380, R.z * 0.55) } : R;
      keys.push([bt.t - 0.9, k], [bt.t + 1.9, k]);
    }
    if (T.story) keys.push([T.story[1], R]);
    keys.push([T.end[0] + 1, { ...R, z: R.z * 1.25 }], [DUR + 10, { ...R, z: R.z * 1.32 }]);
    if (!keys.length || t <= keys[0][0]) return keys[0]?.[1] ?? world;
    for (let i = 1; i < keys.length; i++) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      if (t <= t1) {
        const e = ease((t - t0) / Math.max(0.01, t1 - t0));
        const dist = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(a.z, b.z);
        const dip = clamp(dist * 0.35, 0, 0.5);
        return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * e) * (1 + dip * Math.sin(Math.PI * e)) };
      }
    }
    return keys[keys.length - 1][1];
  }

  // ---------- film grain (made once) ----------
  const grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  { const g = grain.getContext('2d')!, img = g.createImageData(160, 160); for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; } g.putImageData(img, 0, 0); }

  // ---------- drawing one frame ----------
  let t = 0;
  function frame() {
    const z = 0; void z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const unit = Math.min(W, H);
    const big = clamp(unit / 18, 22, 54);

    // The map (from "where" to the end).
    const mapA = T.where ? clamp((t - T.where[0] + 0.4) / 1.4) * (1 - 0.72 * clamp((t - (T.terms?.[0] ?? T.end[0])) / 1.2)) : 0;
    const year = yearAtT(t);
    if (mapA > 0.01 && geo) {
      const cam = camAt(t), s = unit / cam.z;
      const toS = (x: number, y: number): XY => [W / 2 + (x - cam.x) * s, H / 2 + (y - cam.y) * s];
      ctx.globalAlpha = mapA;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - cam.x * s), dpr * (H / 2 - cam.y * s));
      ctx.fillStyle = C.sea; ctx.fill(P.edge);
      ctx.strokeStyle = C.grat; ctx.lineWidth = 0.8 / s; ctx.stroke(P.graticule);
      ctx.lineJoin = 'round'; ctx.strokeStyle = C.seaLine; ctx.globalAlpha = mapA * 0.3; ctx.lineWidth = 12 / s; ctx.stroke(P.land); ctx.globalAlpha = mapA * 0.45; ctx.lineWidth = 5 / s; ctx.stroke(P.land);
      ctx.globalAlpha = mapA; ctx.fillStyle = C.land; ctx.fill(P.land); ctx.fillStyle = C.sea; ctx.fill(P.lakes);
      ctx.strokeStyle = C.river; ctx.lineWidth = 1 / s; ctx.stroke(P.rivers);
      ctx.strokeStyle = C.coast; ctx.lineWidth = 1.1 / s; ctx.stroke(P.land);
      // Empires bloom while the date is inside their time.
      for (const e of data.empires) {
        const ea = year === null ? 0.6 : (e.from === null || year >= e.from - 20) && (e.to === null || year <= e.to + 20) ? 1 : 0;
        const tOn = e.from !== null ? tOfYear(e.from) : (T.story?.[0] ?? 0);
        const grow = easeOut((t - tOn) / 2.2) * ea;
        if (grow < 0.02) continue;
        const cities = e.pts.filter(([, , y]) => y === null || year === null || y <= year);
        if (!cities.length) continue;
        const cx = cities.reduce((a, p) => a + p[0], 0) / cities.length, cy = cities.reduce((a, p) => a + p[1], 0) / cities.length;
        for (const [x, y] of cities) {
          const r = (90 + 60 * grow) * grow;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255,177,90,${0.26 * mapA})`); g.addColorStop(1, 'rgba(255,177,90,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const [sx, sy] = toS(cx, cy);
        ctx.globalAlpha = mapA * grow; ctx.font = `italic 600 ${clamp(big * 0.42, 13, 22)}px ${serif}`; ctx.textAlign = 'center'; ctx.fillStyle = C.empire;
        ctx.fillText(`${e.n} ≈`, sx, sy - 24);
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - cam.x * s), dpr * (H / 2 - cam.y * s));
      }
      ctx.globalAlpha = mapA;
      // Routes draw themselves from their start date; a ship sails the line.
      for (const r of data.routes) {
        const tOn = r.from !== null ? tOfYear(r.from) : (T.where?.[1] ?? 0);
        const prog = easeOut((t - tOn) / 3);
        if (prog <= 0) continue;
        const seg = r.pts.length - 1, upto = prog * seg;
        const lineTo: XY[] = [];
        for (let i = 0; i <= seg; i++) {
          if (i <= upto) lineTo.push(r.pts[i]);
          else { const k = upto - (i - 1); const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i]; lineTo.push([ax + (bx - ax) * k, ay + (by - ay) * k]); break; }
        }
        ctx.setLineDash([10 / s, 7 / s]); ctx.strokeStyle = C.route; ctx.lineWidth = 2.6 / s;
        ctx.beginPath(); crossing(lineTo, (x, y, move) => (move ? ctx.moveTo(x, y) : ctx.lineTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
        const [hx, hy] = lineTo[lineTo.length - 1], [px, py] = lineTo[Math.max(0, lineTo.length - 2)];
        if (prog < 1 || ((t - tOn) % 6) < 3) drawShip(hx, hy, Math.atan2(hy - py, hx - px), s, mapA);
      }
      // Places appear one after another as the camera arrives.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const order = [...data.places].sort((a, b) => b.k - a.k);
      const labelled = new Set(order.slice(0, Math.max(5, Math.round(W / 220))).map((p) => p.n));
      const placed: number[][] = [];
      order.forEach((p, i) => {
        const tOn = (T.where?.[0] ?? 0) + 1.6 + i * 0.09;
        const pop = back((t - tOn) / 0.55);
        if (pop <= 0) return;
        const [sx, sy] = toS(p.xy[0], p.xy[1]);
        if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return;
        ctx.globalAlpha = mapA * clamp(pop);
        ctx.fillStyle = C.bg; ctx.strokeStyle = C.coast; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sx, sy, 4.2 * pop, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (labelled.has(p.n)) {
          ctx.font = `500 ${clamp(unit / 55, 11, 15)}px ${sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const w = ctx.measureText(p.n).width, box = [sx + 7, sy - 8, sx + 9 + w, sy + 8];
          if (placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) return;
          placed.push(box);
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,12,19,.85)'; ctx.strokeText(p.n, sx + 8, sy); ctx.fillStyle = C.ink; ctx.fillText(p.n, sx + 8, sy);
        }
      });
      // Each beat: a pulse where it happened.
      for (const bt of beats) {
        const a = win(t, bt.t - 0.3, bt.t + 2.7, 0.3, 0.6);
        if (a <= 0 || !bt.xy) continue;
        const [sx, sy] = toS(bt.xy[0], bt.xy[1]);
        for (let k = 0; k < 2; k++) {
          const ph = ((t - bt.t) * 0.8 + k * 0.5) % 1;
          if (ph < 0) continue;
          ctx.globalAlpha = a * (1 - ph); ctx.strokeStyle = C.event; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(sx, sy, 8 + ph * 34, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = a; ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    // Title card.
    {
      const a = win(t, 0, T.title[1], 0.01, 0.8);
      if (a > 0) {
        const cy = H * 0.42, size = clamp(unit * 0.2, 90, 190);
        ctx.save();
        ctx.translate(W / 2, cy - size * 0.55); ctx.scale(size / 24, size / 24); ctx.translate(-12, -12);
        ctx.lineWidth = 1.15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        emblem.forEach(({ p, fill: f }, i) => {
          const prog = clamp((t - 0.25 - i * 0.18) / 1.5);
          ctx.globalAlpha = a;
          ctx.strokeStyle = C.gold; ctx.setLineDash([120, 120]); ctx.lineDashOffset = 120 * (1 - easeOut(prog));
          ctx.stroke(p);
          if (f && prog > 0.6) { ctx.globalAlpha = a * clamp((prog - 0.6) / 0.4); ctx.fillStyle = C.gold; ctx.fill(p); }
        });
        ctx.restore();
        ctx.setLineDash([]);
        // A soft glow behind the emblem.
        const g = ctx.createRadialGradient(W / 2, cy - size * 0.55, 0, W / 2, cy - size * 0.55, size);
        g.addColorStop(0, `rgba(255,198,90,${0.13 * a})`); g.addColorStop(1, 'rgba(255,198,90,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = a * clamp((t - 1.1) / 0.6);
        ctx.font = `700 ${clamp(big * 0.32, 11, 16)}px ${sans}`; ctx.fillStyle = C.gold;
        ctx.fillText(fill(S.chapterN, { n: data.label }).toUpperCase().split('').join(' '), W / 2, cy + size * 0.2);
        // The title, set letter by letter.
        const tsize = clamp(big * 1.05, 26, 60);
        ctx.font = `650 ${tsize}px ${serif}`;
        const lines = wrap(data.title, W * 0.86);
        lines.forEach((line, li) => {
          const total = ctx.measureText(line).width; let x = W / 2 - total / 2;
          const y = cy + size * 0.2 + tsize * 1.25 + li * tsize * 1.12;
          [...line].forEach((ch, k) => {
            const ta = clamp((t - 1.5 - (li * 18 + k) * 0.035) / 0.35);
            ctx.globalAlpha = a * ta; ctx.fillStyle = C.ink; ctx.textAlign = 'left';
            ctx.fillText(ch, x, y + (1 - easeOut(ta)) * tsize * 0.35);
            x += ctx.measureText(ch).width;
          });
        });
        ctx.textAlign = 'center';
        ctx.globalAlpha = a * clamp((t - 3.1) / 0.8);
        ctx.font = `italic 400 ${clamp(big * 0.42, 14, 20)}px ${serif}`; ctx.fillStyle = C.dim;
        const sl = wrap(data.standfirst, Math.min(W * 0.8, 720)).slice(0, 2);
        sl.forEach((line, i) => ctx.fillText(i === 1 && wrap(data.standfirst, Math.min(W * 0.8, 720)).length > 2 ? `${line}…` : line, W / 2, cy + size * 0.2 + tsize * (1.4 + lines.length * 1.12) + 6 + i * big * 0.62));
        ctx.globalAlpha = 1;
      }
    }
    // When: the timeline ribbon zooms from all of history to this chapter's time.
    if (T.when && data.span) {
      const a = win(t, T.when[0], T.when[1], 0.6, 0.7);
      if (a > 0) {
        const z = ease((t - T.when[0] - 0.9) / 2.6);
        const ua = position(data.span[0]), ub = position(data.span[1]), pad = Math.max(1.5, (ub - ua) * 0.6);
        const u0 = 0 + (ua - pad - 0) * z, u1 = 100 + (ub + pad - 100) * z;
        const x0 = W * 0.08, x1 = W * 0.92, y = H * 0.52;
        const X = (u: number) => x0 + ((u - u0) / (u1 - u0)) * (x1 - x0);
        ctx.globalAlpha = a;
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        // Other chapters as faint dashes; this one glowing.
        data.spans.forEach(([l, s0, s1], i) => {
          const xa = X(position(s0)), xb = X(position(s1));
          if (xb < x0 - 50 || xa > x1 + 50) return;
          const mine = l === data.label;
          ctx.fillStyle = mine ? C.gold : 'rgba(239,228,200,.16)';
          const h = mine ? 10 : 4, yy = mine ? y - 5 : y - 18 - (i % 4) * 7;
          ctx.fillRect(Math.max(x0, xa), yy, Math.max(2, Math.min(x1, xb) - Math.max(x0, xa)), h);
        });
        const xa = X(ua), xb = X(ub);
        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, 'rgba(255,198,90,0)'); g.addColorStop(0.5, `rgba(255,198,90,${0.18 * a})`); g.addColorStop(1, 'rgba(255,198,90,0)');
        ctx.fillStyle = g; ctx.fillRect(xa, y - 60, Math.max(2, xb - xa), 120);
        // Ticks at round years that fit.
        const TICKS = [-3e6, -1e6, -3e5, -1e5, -3e4, -1e4, -5000, -3000, -2000, -1000, -500, 1, 500, 1000, 1200, 1300, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800, 1850, 1900];
        let lastX = -Infinity;
        ctx.font = `500 ${clamp(unit / 60, 10, 13)}px ${sans}`; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
        for (const yr of TICKS) {
          const x = X(position(yr));
          if (x < x0 || x > x1 || x - lastX < 90) continue;
          lastX = x;
          ctx.fillRect(x - 0.5, y - 4, 1, 8);
          ctx.fillText(formatDate({ start: yr, end: yr }, lang), x, y + 24);
        }
        ctx.globalAlpha = a * clamp((t - T.when[0] - 2.8) / 0.8);
        ctx.font = `650 ${clamp(big * 0.9, 24, 48)}px ${serif}`; ctx.fillStyle = C.gold;
        ctx.fillText(data.spanText ?? '', (xa + xb) / 2 < W * 0.25 || (xa + xb) / 2 > W * 0.75 ? W / 2 : (xa + xb) / 2, y - 48);
        ctx.font = `600 ${clamp(big * 0.3, 11, 15)}px ${sans}`; ctx.fillStyle = C.dim;
        ctx.globalAlpha = a * clamp((t - T.when[0] - 0.2) / 0.6);
        ctx.fillText(S.when.toUpperCase(), W / 2, H * 0.3);
        ctx.globalAlpha = 1;
      }
    }
    // No map yet (no places for this chapter): the story follows along the chapter's timeline
    // instead — a cursor runs along the ribbon and each moment rises as a marker as it's reached.
    if (T.story && !hasMap && data.span && year !== null) {
      const a = win(t, T.story[0], T.story[1], 0.7, 0.8);
      if (a > 0) {
        const ua = position(data.span[0]), ub = position(data.span[1]), pad = Math.max(0.8, (ub - ua) * 0.08);
        const x0 = W * 0.08, x1 = W * 0.92, y = H * 0.56;
        const X = (u: number) => x0 + ((u - (ua - pad)) / (ub - ua + 2 * pad)) * (x1 - x0);
        ctx.globalAlpha = a;
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,198,90,.35)'; ctx.fillRect(X(ua), y - 3, X(ub) - X(ua), 6);
        const cur = X(position(year));
        ctx.fillStyle = C.gold; ctx.fillRect(X(ua), y - 3, Math.max(0, cur - X(ua)), 6);
        ctx.font = `500 ${clamp(unit / 60, 10, 13)}px ${sans}`; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
        ctx.fillText(formatDate({ start: data.span[0], end: data.span[0] }, lang), X(ua), y + 26);
        ctx.fillText(formatDate({ start: data.span[1], end: data.span[1] }, lang), X(ub), y + 26);
        beats.forEach((bt, k) => {
          const rise = easeOut((t - bt.t + 0.4) / 0.7);
          if (rise <= 0) return;
          const bx = X(position(bt.y)), active = t >= bt.t - 0.2 && t < bt.t + 2.9;
          const h = (active ? 70 : 34 + (k % 3) * 12) * rise;
          ctx.globalAlpha = a * (active ? 1 : 0.55);
          ctx.strokeStyle = active ? C.gold : C.dim; ctx.lineWidth = active ? 2 : 1.2;
          ctx.beginPath(); ctx.moveTo(bx, y - 4); ctx.lineTo(bx, y - 4 - h); ctx.stroke();
          ctx.fillStyle = active ? C.gold : C.ink; ctx.beginPath(); ctx.arc(bx, y - 4 - h, active ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
          if (!active) { ctx.font = `600 ${clamp(unit / 70, 9, 12)}px ${sans}`; ctx.fillStyle = C.dim; ctx.textAlign = 'center'; ctx.fillText(bt.date, bx, y - 14 - h); }
          if (active) {
            const g = ctx.createRadialGradient(bx, y - 4 - h, 0, bx, y - 4 - h, 60);
            g.addColorStop(0, 'rgba(255,198,90,.35)'); g.addColorStop(1, 'rgba(255,198,90,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, y - 4 - h, 60, 0, Math.PI * 2); ctx.fill();
          }
        });
        // The cursor: a small glowing head moving along the line.
        ctx.globalAlpha = a; ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(cur, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // The running date during the story.
    if (T.story && year !== null) {
      const a = win(t, T.story[0], T.story[1], 0.6, 0.8);
      if (a > 0) {
        ctx.globalAlpha = a; ctx.textAlign = 'left';
        ctx.font = `650 ${clamp(big * 1.2, 30, 64)}px ${serif}`; ctx.fillStyle = C.gold;
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
        ctx.fillText(formatDate({ start: Math.round(year), end: Math.round(year) }, lang), clamp(W * 0.05, 18, 60), clamp(H * 0.13, 60, 110));
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = 'center';
      }
    }
    // Key terms, floating in.
    if (T.terms) {
      const list = data.terms.slice(0, 4);
      list.forEach((term, i) => {
        const t0 = T.terms![0] + 0.4 + i * 1.7;
        const a = win(t, t0, T.terms![1], 0.6, 0.6);
        if (a <= 0) return;
        const y = H * 0.32 + i * clamp(unit / 9, 50, 90), rise = (1 - easeOut((t - t0) / 0.8)) * 24;
        ctx.globalAlpha = a; ctx.font = `650 ${clamp(big * 0.62, 18, 32)}px ${serif}`; ctx.fillStyle = C.gold;
        ctx.fillText(term.t, W / 2, y + rise);
        ctx.font = `400 ${clamp(big * 0.32, 12, 16)}px ${sans}`; ctx.fillStyle = C.dim;
        { const dl = wrap(term.d, Math.min(W * 0.8, 640)); ctx.fillText((dl[0] ?? '') + (dl.length > 1 ? ' …' : ''), W / 2, y + rise + clamp(big * 0.5, 16, 26)); }
      });
      const ha = win(t, T.terms[0], T.terms[1], 0.5, 0.6);
      ctx.globalAlpha = ha; ctx.font = `600 ${clamp(big * 0.3, 11, 15)}px ${sans}`; ctx.fillStyle = C.dim;
      ctx.fillText(S.keyTerms.toUpperCase(), W / 2, H * 0.22); ctx.globalAlpha = 1;
    }
    // End card: the emblem settles above the buttons.
    {
      const a = clamp((t - T.end[0]) / 0.8);
      if (a > 0) {
        const size = clamp(unit * 0.12, 56, 110), cy = H * 0.34;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, cy); ctx.scale(size / 24, size / 24); ctx.translate(-12, -12);
        ctx.lineWidth = 1.15; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = C.gold; ctx.fillStyle = C.gold;
        emblem.forEach(({ p, fill: f }) => { ctx.stroke(p); if (f) ctx.fill(p); });
        ctx.restore();
        ctx.globalAlpha = a; ctx.font = `650 ${clamp(big * 0.8, 22, 42)}px ${serif}`; ctx.fillStyle = C.ink;
        const tl = wrap(data.title, W * 0.86);
        tl.forEach((line, i) => ctx.fillText(line, W / 2, cy + size * 0.95 + i * big * 0.9));
        // The chapter's size, quietly, under its name (the sections themselves are in the storyboard).
        ctx.globalAlpha = a * 0.9; ctx.font = `600 ${clamp(big * 0.3, 11, 15)}px ${sans}`; ctx.fillStyle = C.gold;
        ctx.fillText(fill(S.inChapter, { n: data.sections.length, m: data.minutes }).toUpperCase(), W / 2, cy + size * 0.95 + (tl.length - 1) * big * 0.9 + clamp(big * 0.8, 22, 40));
        ctx.globalAlpha = 1;
      }
    }

    // Vignette and grain: the room is dark, the film is old.
    const v = ctx.createRadialGradient(W / 2, H / 2, unit * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!calm) { ctx.globalAlpha = 0.5; const ox = Math.floor((t * 977) % 160), oy = Math.floor((t * 613) % 160); ctx.fillStyle = ctx.createPattern(grain, 'repeat')!; ctx.translate(-ox, -oy); ctx.fillRect(ox, oy, W, H); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; }

    // Captions (DOM, crisp) and the end buttons.
    const bt = beats.find((b) => t >= b.t - 0.2 && t < b.t + 2.9);
    if (bt) { if (capText.textContent !== bt.label) { capDate.textContent = bt.date; capText.textContent = bt.label; } cap.classList.add('is-on'); }
    else cap.classList.remove('is-on');
    endEl.hidden = t < T.end[0] + 0.6;
    scrub.value = String(Math.round((t / DUR) * 1000));
    timeEl.textContent = `${fmt(t)} / ${fmt(DUR)}`;
  }
  // A route that crosses the Pacific goes off one edge of the flat map and comes back on the other.
  function crossing(line: XY[], to: (x: number, y: number, move: boolean) => void) {
    const HALF = 2740, WORLD = 5480;
    line.forEach(([x, y], i) => {
      if (!i) { to(x, y, true); return; }
      const [px, py] = line[i - 1];
      if (Math.abs(x - px) > HALF) {
        const dir = x < px ? 1 : -1, x2 = x + dir * WORLD, k = ((dir > 0 ? WORLD : 0) - px) / (x2 - px), ym = py + (y - py) * k;
        to(dir > 0 ? WORLD : 0, ym, false); to(dir > 0 ? 0 : WORLD, ym, true);
      }
      to(x, y, false);
    });
  }
  function wrap(text: string, max: number): string[] {
    const words = text.split(/\s+/), out: string[] = []; let line = '';
    for (const w of words) { const test = line ? `${line} ${w}` : w; if (ctx.measureText(test).width > max && line) { out.push(line); line = w; } else line = test; }
    if (line) out.push(line);
    return out;
  }
  function drawShip(x: number, y: number, ang: number, s: number, a: number) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1 / s, 1 / s); ctx.rotate(Math.abs(ang) > Math.PI / 2 ? Math.PI : 0);
    const flip = Math.abs(ang) > Math.PI / 2 ? -1 : 1; void flip;
    ctx.globalAlpha = a; ctx.fillStyle = C.ink; ctx.strokeStyle = C.bg; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(7, 5); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(-1, -18); ctx.stroke();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(-8, -16); ctx.quadraticCurveTo(0, -11, 7, -16); ctx.lineTo(7, -4); ctx.quadraticCurveTo(0, -8, -8, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const fmt = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;

  // ---------- the narrator ----------
  const synth = window.speechSynthesis;
  const voiceBtn = dlg.querySelector<HTMLButtonElement>('[data-tr-voice]')!;
  let narrate = voiced && (() => { try { return localStorage.getItem('kk-tr-narration') !== 'off'; } catch { return true; } })();
  let holdSince = 0;
  const keep: SpeechSynthesisUtterance[] = []; // (some browsers lose the end of an utterance nothing refers to)
  /** Stop the voice; a line cut off mid-way is said again from its start when the film resumes. */
  const hush = () => { if (!voiced) return; keep.length = 0; synth.cancel(); for (const l of lines) if (l.state === 'speaking') l.state = 'wait'; };
  /** After a jump in time: lines already past are skipped, the rest wait for their moment. */
  const resync = () => { hush(); for (const l of lines) l.state = l.start + 0.3 < t ? 'done' : 'wait'; holdSince = 0; };
  function speakLine(l: Line) {
    l.state = 'speaking';
    // One sentence per utterance: long utterances can be cut short by some voices.
    const parts = l.text.match(/[^.!?]+[.!?]*(\s+|$)/g) ?? [l.text];
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.voice = voice!; u.lang = voice!.lang; u.rate = 1;
      if (i === parts.length - 1) { const end = () => { if (l.state === 'speaking') l.state = 'done'; }; u.onend = end; u.onerror = end; }
      keep.push(u); synth.speak(u);
    });
  }
  /** Each frame while playing: start the line that is due; true while the picture waits for the voice. */
  function narrationStep(): boolean {
    if (!voiced || !narrate) return false;
    const speaking = lines.some((l) => l.state === 'speaking');
    const due = lines.find((l) => l.state === 'wait' && l.start <= t);
    if (due && !speaking) { speakLine(due); holdSince = 0; return false; }
    if (speaking && (due || t >= DUR - 0.05)) {
      const now = performance.now(); holdSince ||= now;
      if (now - holdSince < 6000) return true;
      for (const l of lines) if (l.state === 'speaking') l.state = 'done'; // a voice that never says it has finished
    }
    holdSince = 0;
    return false;
  }
  const showVoice = () => {
    voiceBtn.hidden = !voiced; voiceBtn.setAttribute('aria-pressed', String(narrate));
    voiceBtn.setAttribute('aria-label', narrate ? S.narrationOn ?? 'Narration on' : S.narrationOff ?? 'Narration off');
    dlg.classList.toggle('is-muted', voiced && !narrate);
  };
  voiceBtn.addEventListener('click', () => {
    narrate = !narrate;
    try { localStorage.setItem('kk-tr-narration', narrate ? 'on' : 'off'); } catch { /* fine */ }
    if (narrate) resync(); else hush();
    showVoice(); bumpUi();
  });
  showVoice();

  // ---------- playing ----------
  let playing = false, last = 0, raf = 0, hideTimer = 0;
  const setPlaying = (on: boolean) => {
    playing = on;
    playBtn.setAttribute('aria-label', on ? S.pause : S.play);
    playBtn.firstElementChild!.className = on ? 'tr-i-pause' : 'tr-i-play';
    dlg.classList.toggle('is-playing', on);
    cancelAnimationFrame(raf);
    if (on) { if (t >= DUR) { t = 0; resync(); } last = performance.now(); raf = requestAnimationFrame(tick); bumpUi(); }
    else frame();
  };
  /** Play or pause at the reader's request (pausing also stops the voice). */
  const toggle = () => { if (playing) { setPlaying(false); hush(); } else setPlaying(true); };
  const jump = (to: number) => { t = clamp(to, 0, DUR); resync(); frame(); };
  function tick(now: number) {
    const hold = narrationStep();
    if (!hold) t = Math.min(DUR, t + Math.min(0.1, (now - last) / 1000));
    last = now;
    frame();
    // At the end the picture stops; the last line is allowed to finish.
    if (t >= DUR && !hold) { setPlaying(false); return; }
    if (playing) raf = requestAnimationFrame(tick);
  }
  const bumpUi = () => { dlg.classList.add('ui-on'); clearTimeout(hideTimer); hideTimer = window.setTimeout(() => { if (playing) dlg.classList.remove('ui-on'); }, 2600); };
  dlg.addEventListener('pointermove', bumpUi);
  playBtn.addEventListener('click', toggle);
  canvas.addEventListener('click', toggle);
  scrub.addEventListener('input', () => { jump((Number(scrub.value) / 1000) * DUR); bumpUi(); });
  dlg.querySelector('[data-tr-again]')!.addEventListener('click', () => { jump(0); setPlaying(true); });
  const close = () => { cancelAnimationFrame(raf); hush(); removeEventListener('resize', resize); document.documentElement.classList.remove('km-lock'); dlg.close(); dlg.remove(); opts && document.querySelector<HTMLElement>('[data-trailer]')?.focus(); };
  dlg.querySelector('[data-tr-close]')!.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.tr-board') && e.key !== 'Escape') return;
    if (e.key === ' ' || e.key === 'k') { if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === ' ') return; e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight' && e.target !== scrub) jump(t + 5);
    else if (e.key === 'ArrowLeft' && e.target !== scrub) jump(t - 5);
    else if (e.key === 'Home') jump(0);
  });

  // ---------- the storyboard: the same film as text ----------
  board.querySelector('.tr-board-in')!.innerHTML = `
    <h2 id="tr-board-h">${esc(fill(S.chapterN, { n: data.label }))}: ${esc(data.title)}</h2>
    <p class="tr-sf">${esc(data.standfirst)}</p>
    ${lines.length ? `<h3>${esc(S.narrated ?? 'Narration')}</h3><p class="tr-narration">${lines.map((l) => esc(l.text)).join(' ')}</p>` : ''}
    ${data.spanText ? `<h3>${esc(S.when)}</h3><p>${esc(data.spanText)}</p>` : ''}
    ${data.places.length ? `<h3>${esc(S.where)}</h3><p>${data.places.map((p) => esc(p.n)).join(', ')}</p>` : ''}
    ${beats.length ? `<h3>${esc(S.story)}</h3><ol>${beats.map((b) => `<li><strong>${esc(b.date)}</strong> ${esc(b.label)}</li>`).join('')}</ol>` : ''}
    ${data.terms.length ? `<h3>${esc(S.keyTerms)}</h3><dl>${data.terms.map((x) => `<dt>${esc(x.t)}</dt><dd>${esc(x.d)}</dd>`).join('')}</dl>` : ''}
    <h3>${esc(fill(S.inChapter, { n: data.sections.length, m: data.minutes }))}</h3><ol>${data.sections.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="tr-board-actions"><a class="btn btn-primary" href="${esc(data.first ?? data.url)}">${esc(S.start)} →</a>${calm ? ` <button type="button" class="btn" data-tr-anyway>${esc(S.playAnyway)}</button>` : ''}</p>`;
  const showBoard = (on: boolean) => {
    board.hidden = !on; boardBtn.setAttribute('aria-pressed', String(on)); dlg.classList.toggle('is-board', on);
    if (on) { setPlaying(false); hush(); board.querySelector<HTMLElement>('h2')!.setAttribute('tabindex', '-1'); board.querySelector<HTMLElement>('h2')!.focus(); }
  };
  boardBtn.addEventListener('click', () => showBoard(board.hidden));
  board.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-tr-anyway]')) { showBoard(false); setPlaying(true); } });

  resize();
  dlg.classList.add('is-ready', 'ui-on');
  if (calm) showBoard(true); else setPlaying(true);
  playBtn.focus({ preventScroll: true });
  Object.assign(dlg, { trSeek: (x: number) => jump(x), trState: () => ({ t, DUR, playing, beats: beats.length, scenes: Object.keys(T),
    voice: voice?.name ?? null, narrate, lines: lines.map((l) => ({ scene: l.scene, start: +l.start.toFixed(2), state: l.state })) }) });
}

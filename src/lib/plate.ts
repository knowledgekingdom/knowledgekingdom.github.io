// The chapter's opening plate (Motion & Story, M4): an engraving of the chapter's own corner of the
// world, built at build time from the book's data. Three layers, drawn in ink when the page opens and
// drifting at different depths as the reader scrolls (src/styles/plate.css):
//   far  — the Atlas coastlines and graticule around the chapter's places (a portolan rose for
//          chapters that have no places: method chapters such as 001 or 006),
//   mid  — the places as stamped dots (the most-cited ones named) and the routes as ink lines,
//   near — a time ruler: the chapter's span with a tick for each of its events.
// Nothing here runs in the browser; the page gets a few kilobytes of SVG.
import geo from '../../public/atlas/geo.json';
import { ATLAS_W, project } from '../atlas/projection';
import { knowledge, tx } from './knowledge';
import { getTimeline, formatDate } from './timeline';
import type { Lang } from '../i18n/ui';

type XY = [number, number];
type Pt = { xy: XY; k: number; name: string };
export type Plate = {
  mode: 'map' | 'rose';
  w: number; h: number;
  far: string; // path data (coasts + lakes)
  grid: string; // path data (graticule, or rhumb lines)
  rose: string | null; // path data of a compass rose
  places: { x: number; y: number; r: number; label: string | null; anchor: 'start' | 'end' }[];
  routes: string[];
  ruler: { from: string; to: string; ticks: number[] } | null;
};

const W = 1000, H = 625; // the plate's own units (aspect 1.6)
const decode = (line: number[]): XY[] => {
  const out: XY[] = []; let x = line[0], y = line[1]; out.push([x, y]);
  for (let i = 2; i < line.length; i += 2) { x += line[i]; y += line[i + 1]; out.push([x, y]); }
  return out;
};
const LAND = (geo.land as number[][]).map(decode);
const LAKES = (geo.lakes as number[][]).map(decode);
const GRAT = (geo.graticule as number[][]).map(decode);

/** Polylines in plate units, cut to the plate (plus a margin) and thinned to about one point per `tol`. */
function cut(lines: XY[][], tf: (p: XY) => XY, tol: number): string {
  const m = 30, inside = ([x, y]: XY) => x > -m && x < W + m && y > -m && y < H + m;
  let d = '';
  for (const line of lines) {
    let run: XY[] = [];
    const flush = () => {
      if (run.length > 1) {
        let [px, py] = run[0].map(Math.round) as XY;
        d += `M${px} ${py}`;
        for (let i = 1; i < run.length; i++) {
          const [x, y] = run[i].map(Math.round) as XY;
          if (i < run.length - 1 && Math.hypot(x - px, y - py) < tol) continue;
          if (x === px && y === py) continue;
          d += `l${x - px} ${y - py}`; px = x; py = y;
        }
      }
      run = [];
    };
    for (const p of line) { const q = tf(p); if (inside(q)) run.push(q); else flush(); }
    flush();
  }
  return d;
}

/** A compass rose of `n` points centred at (cx, cy). */
function roseAt(cx: number, cy: number, r: number): string {
  let d = `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0`;
  const r2 = r * 0.82;
  d += `M${cx + r2} ${cy}a${r2} ${r2} 0 1 0 ${-2 * r2} 0a${r2} ${r2} 0 1 0 ${2 * r2} 0`;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8, long = i % 2 === 0, tip = long ? (i % 4 === 0 ? r * 1.32 : r * 1.05) : r * 0.74, base = r * (long ? 0.16 : 0.1);
    const tx = cx + Math.sin(a) * tip, ty = cy - Math.cos(a) * tip;
    const lx = cx + Math.sin(a - Math.PI / 2) * base, ly = cy - Math.cos(a - Math.PI / 2) * base;
    const rx = cx + Math.sin(a + Math.PI / 2) * base, ry = cy - Math.cos(a + Math.PI / 2) * base;
    d += `M${lx.toFixed(1)} ${ly.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}L${rx.toFixed(1)} ${ry.toFixed(1)}`;
  }
  return d;
}

export function buildPlate(label: string, lang: Lang): Plate {
  const cites = (list: { id: string }[]) => list.some((s) => s.id.startsWith(`${label}/`));
  const placeById = new Map(knowledge.places.map((p) => [p.id, p]));
  const pts: Pt[] = knowledge.places.filter((p) => p.type !== 'empire' && cites(p.sections))
    .map((p) => ({ xy: project(p.lat, p.lon), k: p.sections.filter((s) => s.id.startsWith(`${label}/`)).length, name: tx(p.name, lang) }))
    .sort((a, b) => b.k - a.k);
  const events = knowledge.events.filter((e) => cites(e.sections));
  const routes = knowledge.routes.filter((r) => cites(r.sections))
    .map((r) => r.places.map((id) => placeById.get(id)).filter((p) => p !== undefined).map((p) => project(p!.lat, p!.lon)))
    .filter((r) => r.length >= 2);

  // The time ruler: the chapter's span, a tick for each event inside it (as a fraction of the span).
  const span = getTimeline(lang).chapterSpans[label];
  const ruler = span && span[1] > span[0] ? {
    from: formatDate({ start: span[0], end: span[0] }, lang), to: formatDate({ start: span[1], end: span[1] }, lang),
    ticks: [...new Set(events.map((e) => (Math.round((e.start + e.end) / 2) - span[0]) / (span[1] - span[0]))
      .filter((f) => f >= 0 && f <= 1).map((f) => Math.round(f * 1000) / 1000))].sort((a, b) => a - b),
  } : null;

  if (pts.length < 3) {
    // A portolan chart: a compass rose and its rhumb lines, for chapters about method. Drawn in a
    // square centred on the chapter's emblem (plate.css places it), so the emblem sits in the rose.
    const c = 300, r = 62;
    let grid = '';
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12, len = 1800;
      grid += `M${c} ${c}l${Math.round(Math.sin(a) * len)} ${Math.round(-Math.cos(a) * len)}`;
    }
    return { mode: 'rose', w: 600, h: 600, far: '', grid, rose: roseAt(c, c, r), places: [], routes: [], ruler };
  }

  // The region: centred on the places' weighted middle (a place counts once per section citing it),
  // just wide enough for 70% of that weight, padded, at the plate's aspect.
  const total = pts.reduce((n, p) => n + p.k, 0);
  const wmedian = (axis: 0 | 1) => { const o = [...pts].sort((a, b) => a.xy[axis] - b.xy[axis]); let n = 0; for (const p of o) { n += p.k; if (n >= total / 2) return p.xy[axis]; } return o[o.length - 1].xy[axis]; };
  const mx = wmedian(0), my = wmedian(1);
  const reach = pts.map((p) => ({ k: p.k, d: Math.max(Math.abs(p.xy[0] - mx), Math.abs(p.xy[1] - my) * 1.6) })).sort((a, b) => a.d - b.d);
  let acc = 0, half = 0;
  for (const q of reach) { acc += q.k; half = q.d; if (acc >= total * 0.7) break; }
  // (With only a handful of places, all of them are in the picture.)
  const core = pts.length <= 5 ? pts : pts.filter((p) => Math.max(Math.abs(p.xy[0] - mx), Math.abs(p.xy[1] - my) * 1.6) <= half);
  const x0 = Math.min(...core.map((p) => p.xy[0])), x1 = Math.max(...core.map((p) => p.xy[0]));
  const y0 = Math.min(...core.map((p) => p.xy[1])), y1 = Math.max(...core.map((p) => p.xy[1]));
  // Wide and tall enough that the places, centred at 72% across and 36% down, stay on the plate.
  let rw = Math.max(900, (x1 - x0) / 0.5), rh = Math.max(rw / 1.6, (y1 - y0) / 0.62);
  rw = Math.min(ATLAS_W, Math.max(rw, rh * 1.6)); rh = rw / 1.6;
  // The places sit up and to the right, where the page has room (the title and standfirst are below and left)
  // (their middle lands at 72% across and 36% down the plate: above the title, beside the number).
  const cx = (x0 + x1) / 2 - rw * 0.22, cy = (y0 + y1) / 2 + rh * 0.14;
  const s = W / rw;
  const tf = ([x, y]: XY): XY => [(x - cx) * s + W / 2, (y - cy) * s + H / 2];

  const shown = pts.map((p) => ({ p, q: tf(p.xy) })).filter(({ q: [x, y] }) => x > 8 && x < W - 8 && y > 8 && y < H - 8).slice(0, 14);
  const named = new Set(shown.slice(0, 4).map(({ p }) => p.name));
  const places = shown.map(({ p, q: [x, y] }) => ({
    x: Math.round(x), y: Math.round(y), r: p.k >= 3 ? 5 : 3.6,
    label: named.has(p.name) ? p.name : null, anchor: (x > W * 0.78 ? 'end' : 'start') as 'start' | 'end',
  }));
  const routeD = routes.map((r) => {
    const q = r.map(tf);
    let d = `M${Math.round(q[0][0])} ${Math.round(q[0][1])}`;
    for (let i = 1; i < q.length; i++) {
      // A route that crosses the date line would streak across the map: leave that leg out.
      if (Math.abs(r[i][0] - r[i - 1][0]) > ATLAS_W / 2) { d += `M${Math.round(q[i][0])} ${Math.round(q[i][1])}`; continue; }
      const [ax, ay] = q[i - 1], [bx, by] = q[i];
      // A gentle arc, like a course drawn with a ruler that slipped.
      const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
      d += `Q${Math.round(mx)} ${Math.round(my)} ${Math.round(bx)} ${Math.round(by)}`;
    }
    return d;
  });
  // Coastlines thinned until they fit a budget: a wide region has far more coast in view.
  let tol = 2.2, far = '';
  for (let k = 0; k < 8; k++) { far = cut(LAND, tf, tol) + cut(LAKES, tf, tol * 1.5); if (far.length <= 11000) break; tol *= 1.35; }
  return {
    mode: 'map', w: W, h: H,
    far, grid: cut(GRAT, tf, 4.4), rose: null,
    places, routes: routeD, ruler,
  };
}

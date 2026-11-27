// Draws the Kingdom Map from src/data/map.json and the reader's progress, as SVG strings.
// Plain functions, no DOM: runs in the browser (homepage) and in Node (tests).
// Colours and line weights come from CSS (.km-* classes and --km-* custom properties), so the
// same drawing serves the light parchment and the dark lantern-lit theme. The fog and the sea's
// watercolour are painted on canvases by textures.ts, above and below this drawing.
import { EMBLEMS, EMBLEM_MOTION } from './emblems.ts';

export type Pt = [number, number];
export type Region = { number: number; roman?: string; title: string; titleBg?: string | null; known: boolean; cx: number; cy: number; r: number; outline: Pt[]; first: number; last: number; next?: boolean; islets?: Pt[][] };
export type Town = { label: string; number: number; part: number; x: number; y: number; planned: boolean; url: string; sections: number; emblem: string; title: string; titleBg?: string | null; name: string; nameBg?: string | null };
export type Bridge = { a: string; b: string; n: number };
export type MapData = { width: number; height: number; regions: Region[]; towns: Town[]; rivers: Pt[][]; bridges: Bridge[]; decor: { kind: string; part: number; x: number; y: number; s: number }[]; waves: Pt[] };
/** chapter label → sections read */
export type Progress = Record<string, number>;
export type TownState = 'done' | 'started' | 'next' | 'unread' | 'planned';
export type Strings = { map: string; part: string; chapter: string; comingSoon: string; chapters: string; sectionsRead: string; league: string; planned: string };
export type RenderOptions = { lang?: 'en' | 'bg'; progress?: Progress; strings?: Partial<Strings>; relief?: boolean; motion?: boolean };

const EN: Strings = { map: 'The Kingdom Map', part: 'Part', chapter: 'Chapter', comingSoon: 'coming soon', chapters: 'Chapters', sectionsRead: '{n} of {t} sections read', league: '1 league = 1 chapter', planned: 'planned' };
const f = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n: number) => String(n).padStart(3, '0');

/** Catmull-Rom spline through the points, as an SVG path. */
export function smooth(pts: Pt[], closed = false, tension = 0.5): string {
  if (pts.length < 2) return '';
  // Whole map units are fine enough for curves on a map thousands of units wide.
  const f = Math.round;
  const n = pts.length;
  const at = (i: number): Pt => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  const k = tension / 3;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) * k)} ${f(p1[1] + (p2[1] - p0[1]) * k)} ${f(p2[0] - (p3[0] - p1[0]) * k)} ${f(p2[1] - (p3[1] - p1[1]) * k)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
const scaled = (pts: Pt[], cx: number, cy: number, k: number): Pt[] => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

/**
 * Where the reader stands in each town: finished, started, the next town on the road (the first
 * unread chapter after the furthest one touched), not yet visited, or not yet written.
 */
export function townStates(towns: Town[], progress: Progress): { states: Record<string, TownState>; next: string | null; current: string | null } {
  const states: Record<string, TownState> = {};
  for (const t of towns) {
    const read = progress[t.label] ?? 0;
    states[t.label] = t.planned ? 'planned' : t.sections > 0 && read >= t.sections ? 'done' : read > 0 ? 'started' : 'unread';
  }
  const touched = towns.filter((t) => states[t.label] === 'done' || states[t.label] === 'started');
  const furthest = touched.length ? touched[touched.length - 1].number : 0;
  const nextTown = towns.find((t) => !t.planned && t.number > furthest && states[t.label] === 'unread');
  if (nextTown) states[nextTown.label] = 'next';
  // "Where I am": the latest started-but-unfinished town, else the next one, else the first.
  const started = touched.filter((t) => states[t.label] === 'started');
  const current = started.length ? started[started.length - 1].label : nextTown?.label ?? towns[0]?.label ?? null;
  return { states, next: nextTown?.label ?? null, current };
}

/** Regions whose every written chapter is finished. */
export function partsDone(data: MapData, states: Record<string, TownState>): number[] {
  return data.regions.filter((r) => r.known).filter((r) => {
    const ts = data.towns.filter((t) => t.part === r.number && !t.planned);
    return ts.length > 0 && ts.every((t) => states[t.label] === 'done');
  }).map((r) => r.number);
}

/** The fog's clear patches: soft circles around every town the reader has reached. */
export function fogHoles(data: MapData, states: Record<string, TownState>): { label: string; x: number; y: number; r: number }[] {
  const holes = data.towns.filter((t) => ['done', 'started', 'next'].includes(states[t.label]))
    .map((t) => ({ label: t.label, x: t.x, y: t.y, r: states[t.label] === 'next' ? 250 : states[t.label] === 'started' ? 350 : 410 }));
  if (!holes.length && data.towns[0]) holes.push({ label: data.towns[0].label, x: data.towns[0].x, y: data.towns[0].y, r: 270 });
  return holes;
}

// Buildings: a block of houses around the medallion, nearest first, so reading fills the town
// from its square outward. Rows are offset like streets; the medallion's square stays clear.
const slotCache: Record<number, Pt[]> = {};
export function houseSlots(n: number): Pt[] {
  if (slotCache[n]) return slotCache[n];
  const pts: Pt[] = [];
  for (let row = -6; row <= 6; row++) for (let col = -8; col <= 8; col++) {
    const x = col * 11.5 + (row % 2 ? 5.75 : 0), y = row * 10 + 6;
    if (Math.hypot(x, (y - 2) * 1.25) < 30) continue;
    pts.push([x, y]);
  }
  const key = ([x, y]: Pt) => Math.hypot(x * 0.82, y * 1.15) + ((((x * 7 + y * 13) % 5) + 5) % 5) * 0.9;
  return (slotCache[n] = pts.sort((a, b) => key(a) - key(b)).slice(0, n));
}
const houseDepth = (n: number) => Math.max(26, ...houseSlots(n).map(([, y]) => y));

// Scenery, drawn with its foot at (0, 0): [layer, path] pairs. Every piece of one layer across the
// whole map becomes a single path (a few elements instead of hundreds), back layers first.
const SCENERY: Record<string, [string, string][]> = {
  mountain: [['km-m-body', 'M-22 0L-3-30L4-22L9-28L24 0z'], ['km-m-shade', 'M-3-30L4-22L2-11L7 0H24L9-28L4-22z'], ['km-m-snow', 'M-9-20L-3-30L2-23L-1-21L-4-24L-6-19z'], ['km-ink', 'M-22 0L-3-30L4-22L9-28L24 0']],
  hill: [['km-h-body', 'M-20 0C-14-15 12-15 20 0z'], ['km-ink', 'M-20 0C-14-15 12-15 20 0M2-6c3-2 6-2 9 0']],
  pine: [['km-t-body', 'M0-30L9-13H4L11-2H-11L-4-13H-9z'], ['km-ink', 'M0-30L9-13H4L11-2H-11L-4-13H-9zM0-2V3']],
  tree: [['km-t-body', 'M-10-15a10 10 0 1 0 20 0a10 10 0 1 0-20 0z'], ['km-ink', 'M0 0v-8M-10-15a10 10 0 0 1 20 0a10 10 0 0 1-20 0M-4-17c2-3 6-3 7 0']],
  dune: [['km-d-body', 'M-24 0C-14-12-4-12 4-4C10-9 18-9 24 0z'], ['km-ink', 'M-24 0C-14-12-4-12 4-4C10-9 18-9 24 0']],
  palm: [['km-ink', 'M0 0C2-8 1-16-2-24M-2-24C-8-26-13-23-15-18M-2-24C3-28 9-27 13-22M-2-24C-6-30-3-34 2-34M-2-24C3-24 6-20 7-16']],
  reeds: [['km-ink', 'M-6 0C-7-8-7-14-5-20M0 0V-24M6 0C7-8 6-14 3-19M-10 1h20'], ['km-ink-fill', 'M-1.5-24h3v7h-3z']],
  field: [['km-f-body', 'M-20 0L-12-14H22L14 0z'], ['km-ink', 'M-20 0L-12-14H22L14 0zM-15-4.5H17M-10-9.5H20']],
  chimney: [['km-c-body', 'M-14 0V-12L-6-7V-12L2-7V-22H7V0z'], ['km-ink', 'M-14 0V-12L-6-7V-12L2-7V-22H7V0zM-17 0H10'], ['km-smoke', 'M4.5-25c-3-3 1-6 4-5c1-4 7-4 8 0c4-1 6 3 3 5']],
  // Part IV (war, peace and geopolitics): walled keeps and watchtowers.
  fort: [['km-c-body', 'M-14 0V-16H-10V-19H-6V-16H-2V-19H2V-16H6V-19H10V-16H14V0z'], ['km-ink', 'M-14 0V-16H-10V-19H-6V-16H-2V-19H2V-16H6V-19H10V-16H14V0zM-3 0V-6H3V0M-17 0H17']],
  watchtower: [['km-c-body', 'M-5 0L-3-21H3L5 0zM-7-21V-28H7V-21z'], ['km-ink', 'M-5 0L-3-21H3L5 0zM-7-21V-28H7V-21zM-7-28V-31M7-28V-31M-1-25H1M-9 0H9']],
};
const LAYERS = ['km-m-body', 'km-h-body', 'km-t-body', 'km-d-body', 'km-f-body', 'km-c-body', 'km-m-shade', 'km-m-snow', 'km-ink', 'km-ink-fill', 'km-smoke'];

/** An SVG path moved by (dx, dy) and scaled by k. */
export function movePath(d: string, dx: number, dy: number, k: number): string {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let out = '', i = 0, cmd = '';
  const n = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const abs = cmd === cmd.toUpperCase();
    const P = () => { const x = n(), y = n(); return abs ? `${f(dx + x * k)} ${f(dy + y * k)}` : `${f(x * k)} ${f(y * k)}`; };
    switch (cmd.toUpperCase()) {
      case 'Z': out += cmd; break;
      case 'M': case 'L': case 'T': out += cmd + P(); break;
      case 'H': out += cmd + f(abs ? dx + n() * k : n() * k); break;
      case 'V': out += cmd + f(abs ? dy + n() * k : n() * k); break;
      case 'C': out += `${cmd}${P()} ${P()} ${P()}`; break;
      case 'S': case 'Q': out += `${cmd}${P()} ${P()}`; break;
      case 'A': { const rx = n() * k, ry = n() * k, rot = n(), large = n(), sweep = n(); out += `${cmd}${f(rx)} ${f(ry)} ${rot} ${large} ${sweep} ${P()}`; break; }
      default: i++;
    }
  }
  return out;
}

function symbols(): string {
  // Scenery and building symbols, each drawn with its foot at (0, 0).
  return ``
    + `<symbol id="km-ship" overflow="visible"><path class="km-s-hull" d="M-16 0H16L11 6H-11z"/><path class="km-s-sail" d="M-11-23H9C11-17 11-10 9-5H-11C-9-10-9-17-11-23z"/><path class="km-ink" d="M-16 0H16L11 6H-11zM-1-26V0M-11-23H9C11-17 11-10 9-5H-11C-9-10-9-17-11-23zM-1-26l6 2"/></symbol>`
    + `<symbol id="km-pennant" overflow="visible"><path class="km-ink" d="M0 0V-26"/><path class="km-pennant-flag" d="M0-26H16L11-21.5L16-17H0z"/></symbol>`
    + `<pattern id="km-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path class="km-hatch-line" d="M2 0V9"/></pattern>`;
}

function crest(x: number, y: number, done: boolean, roman: string, n: number): string {
  return `<g class="km-crest${done ? ' is-done' : ''}" data-part="${n}" transform="translate(${f(x)} ${f(y)})"><g class="km-crest-in"><path d="M-17-20H17V-2C17 10 8 17 0 21C-8 17-17 10-17-2z"/><path class="km-crest-band" d="M-17-9H17"/><text y="9" text-anchor="middle">${roman}</text></g></g>`;
}

/** The map itself: sea marks, land, scenery, roads, bridges, towns, region names. */
export function renderMap(data: MapData, opts: RenderOptions = {}): string {
  const lang = opts.lang ?? 'en';
  const s = { ...EN, ...opts.strings };
  const progress = opts.progress ?? {};
  const relief = opts.relief ?? true;
  const prefix = lang === 'bg' ? '/bg' : '';
  const { width: W, height: H } = data;
  const { states } = townStates(data.towns, progress);
  const done = new Set(partsDone(data, states));
  const known = data.regions.filter((r) => r.known);
  const islands = data.regions.filter((r) => !r.known);
  // Each land's shape is written once (in <defs>) and every layer that needs it refers to it.
  const paths = Object.fromEntries(data.regions.map((r) => [r.number, smooth(r.outline, true)]));
  const isletPaths = Object.fromEntries(known.map((r) => [r.number, (r.islets ?? []).map((o) => smooth(o, true)).join('')]));
  const townsByLabel = Object.fromEntries(data.towns.map((t) => [t.label, t]));
  const out: string[] = [];
  const use = (id: string, attrs = '') => `<use href="#${id}"${attrs}/>`;

  out.push(`<svg class="km-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(s.map)}">`);
  out.push(`<defs>${symbols()}`);
  // km-o-N: the coast alone (for the ripples); km-l-N: the land with its islets.
  data.regions.forEach((r) => out.push(`<path id="km-o-${r.number}" d="${paths[r.number]}"/>`));
  known.forEach((r) => out.push(`<path id="km-l-${r.number}" d="${paths[r.number]}${isletPaths[r.number]}"/>`));
  known.forEach((r) => out.push(`<clipPath id="km-clip-${r.number}">${use(`km-l-${r.number}`)}</clipPath>`));
  out.push(`</defs>`);

  out.push(`<g class="km-waves"><path d="${data.waves.map(([x, y], i) => `M${x - 14} ${y}c5-6 9-6 14 0s9 6 14 0${i % 3 ? '' : `M${x - 4} ${y + 9}c4-4 7-4 10 0`}`).join('')}"/></g>`);
  // Engraved ripples round every coast (the coast itself, scaled out from the land's middle).
  const grow = (k: number, cx: number, cy: number) => ` transform="matrix(${k} 0 0 ${k} ${f(cx * (1 - k))} ${f(cy * (1 - k))})"`;
  out.push(`<g class="km-ripples">${data.regions.map((r) => [1.05, 1.1, 1.17].map((k, i) => use(`km-o-${r.number}`, ` class="km-ripple km-ripple-${i}"${grow(k, r.cx, r.cy)}`)).join('')
    + (r.islets ?? []).map((o) => { const c = o.reduce((a, p) => [a[0] + p[0] / o.length, a[1] + p[1] / o.length], [0, 0]); return `<path class="km-ripple km-ripple-0" d="${smooth(scaled(o, c[0], c[1], 1.25), true)}"/>`; }).join('')).join('')}</g>`);
  out.push(`<g class="km-islands">${islands.map((r) => use(`km-o-${r.number}`, ' class="km-island"')).join('')}</g>`);
  // Relief: each land stands on a cliff, drawn below and offset downwards, hatched like an engraving.
  if (relief) out.push(`<g class="km-cliff" transform="translate(0 30)">${known.map((r) => use(`km-l-${r.number}`)).join('')}${known.map((r) => use(`km-l-${r.number}`, ' class="km-cliff-hatch"')).join('')}</g>`);
  // Land: ink outline first, fills on top, so only the outer coast stays inked; then a soft rim inside the coast.
  out.push(`<g class="km-coast">${known.map((r) => use(`km-l-${r.number}`)).join('')}</g>`);
  out.push(`<g class="km-land">${known.map((r) => use(`km-l-${r.number}`, ` class="km-land-${r.number}"`)).join('')}</g>`);
  out.push(`<g class="km-rims">${known.map((r) => use(`km-l-${r.number}`, ` class="km-rim km-rim-${r.number}" clip-path="url(#km-clip-${r.number})"`)).join('')}</g>`);
  out.push(`<g class="km-rivers">${data.rivers.map((pts) => `<path d="${smooth(pts)}"/>`).join('')}</g>`);
  // Scenery, back to front, each on its own small shadow.
  const decor = [...data.decor].sort((a, b) => a.y - b.y);
  const ellipse = (x: number, y: number, rx: number, ry: number) => `M${f(x - rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0z`;
  if (relief) out.push(`<path class="km-shadow" d="${decor.map((d) => ellipse(d.x + 5, d.y + 1, 19 * d.s, 4.5 * d.s)).join('')}"/>`);
  const layers: Record<string, string[]> = {};
  for (const d of decor) for (const [cls, path] of SCENERY[d.kind] ?? []) (layers[cls] ??= []).push(movePath(path, d.x, d.y, d.s));
  out.push(`<g class="km-decor">${LAYERS.filter((c) => layers[c]).map((c) => `<path class="${c}" d="${layers[c].join('')}"/>`).join('')}</g>`);

  // The road in reading order (the walked part drawn over it): over land within each Part, by a sea
  // lane across each strait, and an uncharted lane on to the next land still to be written.
  const walked = data.towns.reduce((n, t, i) => (states[t.label] === 'done' || states[t.label] === 'started' ? i : n), -1);
  const roads: string[] = [], lanes: string[] = [];
  const lane = (a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, bend = Math.min(140, len * 0.12);
    return `M${f(a[0])} ${f(a[1])}Q${f((a[0] + b[0]) / 2 + (dy / len) * bend)} ${f((a[1] + b[1]) / 2 - (dx / len) * bend)} ${f(b[0])} ${f(b[1])}`;
  };
  let from = 0;
  data.towns.forEach((t, i) => {
    const next = data.towns[i + 1];
    if (next && next.part === t.part) return;
    const seg = data.towns.slice(from, i + 1).map((q) => [q.x, q.y] as Pt);
    if (seg.length > 1) {
      roads.push(`<path class="km-road" d="${smooth(seg)}"/>`);
      if (walked > from) roads.push(`<path class="km-road km-road-walked" d="${smooth(seg.slice(0, walked - from + 1))}"/>`);
    }
    if (next) lanes.push(`<path class="km-lane${walked > i ? ' is-walked' : ''}" d="${lane([t.x, t.y], [next.x, next.y])}"/>`);
    from = i + 1;
  });
  const ahead = islands.find((r) => r.next), lastTown = data.towns[data.towns.length - 1];
  if (ahead && lastTown) lanes.push(`<path class="km-lane is-uncharted" d="${lane([lastTown.x, lastTown.y], [ahead.cx, ahead.cy + 60])}"/>`);
  out.push(`<g class="km-lanes">${lanes.join('')}</g><g class="km-roads">${roads.join('')}</g>`);
  out.push(`<g class="km-bridges">${data.bridges.map(({ a, b }) => {
    const A = townsByLabel[a], B = townsByLabel[b];
    if (!A || !B) return '';
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(160, len * 0.28);
    return `<path class="km-bridge" data-a="${a}" data-b="${b}" d="M${A.x} ${A.y}Q${f(mx - (dy / len) * bend)} ${f(my + (dx / len) * bend)} ${B.x} ${B.y}"/>`;
  }).join('')}</g>`);

  // Towns: section buildings round an emblem medallion, then the name.
  out.push(`<g class="km-towns">`);
  for (const t of data.towns) {
    const st = states[t.label];
    const read = Math.min(progress[t.label] ?? 0, t.sections);
    const name = lang === 'bg' ? t.nameBg ?? t.name : t.name;
    const title = lang === 'bg' ? t.titleBg ?? t.title : t.title;
    const n = t.planned ? 8 : t.sections;
    // All of a town's buildings as two shapes (lit and unlit): far fewer elements to draw.
    const slots = houseSlots(n);
    const house = ([x, y]: Pt) => `M${f(x - 3.6)} ${f(y)}v-4.6l3.6-3.2l3.6 3.2v4.6z`;
    const houses = `<path class="km-house" d="${slots.slice(read).map(house).join('')}"/>` + (read ? `<path class="km-house on" data-lit="${read}" d="${slots.slice(0, read).map(house).join('')}"/>` : '');
    // (It begins with the town's visible name, so the words on the map are the words a screen reader says.)
    const label = `${t.number} ${name} — ${s.chapter} ${t.number}: ${title}` + (t.planned ? ` (${s.planned})` : ` — ${s.sectionsRead.replace('{n}', String(read)).replace('{t}', String(t.sections))}`);
    out.push(`<a class="km-town is-${st}" href="${esc(prefix + t.url)}" data-ch="${t.label}" aria-label="${esc(label)}" transform="translate(${t.x} ${t.y})">`
      + `<circle class="km-hit" r="58"/>`
      + (relief ? `<ellipse class="km-shadow" cx="5" cy="${f(houseDepth(n) - 4)}" rx="${f(Math.min(60, 30 + n))}" ry="7"/>` : '')
      + `<g class="km-houses">${houses}</g>`
      + `<circle class="km-medal" r="20"/>`
      + `<g class="km-emblem" transform="translate(-11.5 -11.5) scale(.96)"><g class="em em-m-${EMBLEM_MOTION[t.emblem] ?? 'wave'}">${EMBLEMS[t.emblem] ?? EMBLEMS.banner}</g></g>`
      + `<g class="km-flag"${st === 'done' ? '' : ' hidden'}><use href="#km-pennant" x="20" y="-14"/></g>`
      + `<text class="km-name" y="${f(houseDepth(n) + 34)}"><tspan class="km-num">${t.number}</tspan> ${esc(name)}</text>`
      + `</a>`);
  }
  out.push(`</g>`);

  // Region names on an arc across the top of each Part, with its crest above.
  out.push(`<g class="km-regions">`);
  for (const r of known) {
    const title = lang === 'bg' ? r.titleBg ?? r.title : r.title;
    const top = Math.min(...data.towns.filter((t) => t.part === r.number).map((t) => t.y));
    const y0 = Math.max(r.cy - r.r * 0.74, top - 120), x0 = r.cx - r.r * 0.9, x1 = r.cx + r.r * 0.9;
    const text = `${s.part} ${r.roman ?? r.number} · ${title}`;
    // The name grows as the map zooms out, but only as far as its arc is long (about 27 units a letter).
    const fit = Math.max(1, (r.r * 1.8 * 1.04 * 0.94) / (text.length * 27));
    out.push(`<path id="km-arc-${r.number}" class="km-arc" d="M${f(x0)} ${f(y0 + 40)}Q${r.cx} ${f(y0 - 50)} ${f(x1)} ${f(y0 + 40)}"/>`);
    out.push(`<text class="km-region-name" style="--km-rs-max:${fit.toFixed(2)}"><textPath href="#km-arc-${r.number}" startOffset="50%" text-anchor="middle">${esc(text)}</textPath></text>`);
    out.push(crest(r.cx, y0 - 66, done.has(r.number), r.roman ?? String(r.number), r.number));
  }
  out.push(`</g>`);

  // A ship sailing round the continent (the page pauses it for reduced motion).
  if (opts.motion !== false) {
    const loop: Pt[] = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [W / 2 + Math.cos(a) * W * 0.46, H * 0.5 + Math.sin(a) * H * 0.3 + Math.sin(a * 3) * 60] as Pt; });
    out.push(`<g class="km-sail"><use href="#km-ship" transform="scale(1.6)"><animateMotion dur="170s" repeatCount="indefinite" rotate="0" path="${smooth(loop, true)}"/></use></g>`);
  }
  out.push(`</svg>`);
  return out.join('');
}

/** What sits above the fog: names of the lands still to be written, the compass and the scale bar. */
export function renderTop(data: MapData, opts: RenderOptions = {}): string {
  const s = { ...EN, ...opts.strings };
  const { width: W, height: H } = data;
  const out: string[] = [`<svg class="km-svg km-top" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`];
  // Seen from far away, each land carries its name across it in large letters.
  for (const r of data.regions.filter((q) => q.known)) {
    const title = opts.lang === 'bg' ? r.titleBg ?? r.title : r.title;
    const fit = Math.min(4.5, (r.r * 2) / Math.max(10, title.length * 19));
    out.push(`<g transform="translate(${r.cx} ${r.cy})"><g class="km-far" style="--km-far:${fit.toFixed(2)}"><text class="km-far-part" y="-34" text-anchor="middle">${esc(`${s.part} ${r.roman ?? r.number}`)}</text><text class="km-far-title" y="30" text-anchor="middle">${esc(title)}</text></g></g>`);
  }
  for (const r of data.regions.filter((q) => !q.known)) {
    out.push(`<g transform="translate(${r.cx} ${r.cy})"><g class="km-island-label"><text class="km-island-name" y="-8" text-anchor="middle">${esc(`${s.chapters} ${pad(r.first)}–${pad(r.last)}`)}</text><text class="km-soon" y="28" text-anchor="middle">${esc(s.comingSoon)}</text></g></g>`);
  }
  // Compass and scale bar in the open sea of the south-east corner.
  const cx = W - 230, cy = H - 420;
  out.push(`<g class="km-compass" transform="translate(${cx} ${cy})"><g class="km-compass-g"><circle r="92"/><circle r="74" class="km-compass-in"/>`
    + `<path class="km-compass-dark" d="M0-112L13-13L0 0zM0 112L-13 13L0 0zM112 0L13 13L0 0zM-112 0L-13-13L0 0z"/>`
    + `<path class="km-compass-light" d="M0-112L-13-13L0 0zM0 112L13 13L0 0zM112 0L13-13L0 0zM-112 0L-13 13L0 0z"/>`
    + `<path class="km-compass-light" d="M0-62L7-7L0 0zM62 0L7 7L0 0zM0 62L-7 7L0 0zM-62 0L-7-7L0 0z" transform="rotate(45)"/>`
    + `<text y="-122" text-anchor="middle">N</text></g></g>`);
  // One league is the average road distance between neighbouring towns.
  const gaps = data.towns.slice(1).map((t, i) => [t, data.towns[i]] as const).filter(([a, b]) => a.part === b.part).map(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y));
  const league = Math.round(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length));
  out.push(`<g class="km-scale" transform="translate(${W - 90 - league * 3} ${cy + 220})"><path d="M0 0H${league * 3}M0-8V8M${league}-8V8M${league * 2}-8V8M${league * 3}-8V8"/><path class="km-scale-fill" d="M0-5H${league}V5H0zM${league * 2}-5H${league * 3}V5H${league * 2}z"/><text x="${league * 1.5}" y="-20" text-anchor="middle">${esc(s.league)}</text></g>`);
  out.push(`</svg>`);
  return out.join('');
}

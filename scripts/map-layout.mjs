// The Kingdom Map layout (v2 Phase 5, world v2), generated from the book, not drawn by hand.
//   node scripts/map-layout.mjs        (runs before every build)
// - Each Part is its own land, with open water between neighbouring Parts; each written chapter is
//   a town, each section a building in its town. The road crosses each strait by a sea lane.
// - Planned chapters of a written Part are fogged towns at the end of its road. Planned groups from
//   the roadmap are fogged islands: the next one sits where its land will rise (the next stop east,
//   reached by an uncharted lane), the rest lie in a ring round the known world ("coming soon").
// - Bridges join the chapters the related-sections data links most.
// - content-meta/map-layout.json keeps what must not change by itself: land and town positions
//   (towns never move once placed), each chapter's emblem and short map name (EN/BG). New chapters
//   get a position automatically and the generic banner emblem until one is chosen there.
// Output: src/data/map.json (what the homepage map draws).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const VERSION = 2; // world v2: separate lands; a saved layout from an older version is re-placed
const TAU = Math.PI * 2;
const STRAIT = 300; // open water between neighbouring Parts' coasts
const MARGIN = 380; // sea round the whole world
const partRadius = (n) => Math.round((150 + 135 * Math.sqrt(n)) * 1.25);
const islandRadius = (n) => Math.round(230 + 50 * Math.sqrt(n));

// Seeded randomness: the same book always gives the same map.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const book = read('src/data/book.json');
const bookBg = existsSync(new URL('src/data/bg/book.json', ROOT)) ? read('src/data/bg/book.json') : null;
const roadmap = read('src/data/roadmap.json');
const related = read('src/data/related.json');
const sectionsByChapter = {};
for (const e of book.readingOrder) if (e.kind === 'section' || e.kind === 'summary') sectionsByChapter[e.chapter] = (sectionsByChapter[e.chapter] ?? 0) + 1;
const titleOf = (n) => book.readingOrder.find((e) => e.kind === 'chapter' && e.chapter === n)?.title ?? roadmap.chapters.find((c) => c.number === n)?.title ?? `Chapter ${n}`;
const roadmapBg = existsSync(new URL('src/data/bg/roadmap.json', ROOT)) ? read('src/data/bg/roadmap.json') : null;
const titleBgOf = (n) => bookBg?.readingOrder.find((e) => e.kind === 'chapter' && e.chapter === n)?.title ?? roadmapBg?.chapters.find((c) => c.number === n)?.title ?? null;

const layoutPath = new URL('content-meta/map-layout.json', ROOT);
const saved = existsSync(layoutPath) ? JSON.parse(readFileSync(layoutPath, 'utf8')) : {};
saved.regions ??= {}; saved.towns ??= {}; saved.emblems ??= {}; saved.names ??= {};
if ((saved.version ?? 1) < VERSION) { saved.regions = {}; saved.towns = {}; }

/**
 * A coastline round (0, 0). Lands get long peninsulas (kept off the top, where the Part's name sits),
 * deep bays, a ragged edge and their own build and tilt, so no two look alike; islands are gentler.
 */
function coast(r, rand, n = 100, squash = 0.74, land = true) {
  const ph = [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU];
  const angleAwayFromTop = () => { for (;;) { const a = rand() * TAU; if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) > 0.75) return a; } };
  const bumps = land
    ? [...Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({ a: angleAwayFromTop(), w: 0.13 + rand() * 0.14, h: 0.24 + rand() * 0.2 })),
       ...Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({ a: rand() * TAU, w: 0.07 + rand() * 0.09, h: -(0.1 + rand() * 0.1) })),
       ...Array.from({ length: 4 }, () => ({ a: rand() * TAU, w: 0.05 + rand() * 0.06, h: (rand() - 0.4) * 0.12 }))]
    : Array.from({ length: 4 }, () => ({ a: rand() * TAU, w: 0.1 + rand() * 0.2, h: (rand() < 0.62 ? 1 : -0.6) * (0.07 + rand() * 0.13) }));
  if (land) squash = 0.62 + rand() * 0.16;
  const tilt = land ? (rand() - 0.5) * 0.36 : 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let k = 1 + 0.09 * Math.sin(2 * a + ph[0]) + 0.06 * Math.sin(3 * a + ph[1]) + 0.04 * Math.sin(5 * a + ph[2]) + 0.026 * Math.sin(9 * a + ph[3]) + 0.016 * Math.sin(17 * a + ph[4]) + 0.009 * Math.sin(31 * a + ph[5]);
    for (const b of bumps) { const d = Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a)); k += b.h * Math.exp(-((d / b.w) ** 2)); }
    const x = r * k * Math.cos(a), y = r * k * squash * Math.sin(a);
    pts.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return pts;
}
const inside = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Push the coast out wherever something that must stand on land (towns, the name band) is too near the sea. */
function holdOnLand(pts, cx, cy, keep) {
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (const [x, y, clear] of keep) {
      const ok = Array.from({ length: 12 }, (_, i) => [x + Math.cos((i / 12) * TAU) * clear, y + Math.sin((i / 12) * TAU) * clear * 0.8]).every(([px, py]) => inside(pts, px, py));
      if (ok) continue;
      moved = true;
      const at = Math.atan2(y - cy, x - cx);
      for (const p of pts) {
        const d = Math.atan2(Math.sin(Math.atan2(p[1] - cy, p[0] - cx) - at), Math.cos(Math.atan2(p[1] - cy, p[0] - cx) - at));
        const w = Math.exp(-((d / 0.45) ** 2));
        p[0] = cx + (p[0] - cx) * (1 + 0.05 * w); p[1] = cy + (p[1] - cy) * (1 + 0.05 * w);
      }
    }
    if (!moved) break;
  }
  return pts;
}
const round = (pts) => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
const pad = (n) => String(n).padStart(3, '0');

// Written Parts, and the roadmap chapters planned inside each Part's group (e.g. 039–041 in Part III).
const written = new Set(book.parts.flatMap((p) => p.chapters));
const maxWritten = Math.max(...written);
const parts = book.parts.map((p, i) => {
  const group = roadmap.groups.find((g) => g.chapters.includes(p.chapters[p.chapters.length - 1]));
  const planned = i === book.parts.length - 1 && group ? group.chapters.filter((n) => n > maxWritten) : [];
  return { number: p.number, roman: p.roman, title: p.title, titleBg: bookBg?.parts[i]?.title ?? null, chapters: p.chapters, planned };
});
const lastCovered = Math.max(maxWritten, ...parts.flatMap((p) => p.planned));
const groups = roadmap.groups.filter((g) => g.chapters[0] > lastCovered);

// The known world: one land per Part, west → east, rising and falling a little like a coast road.
const regions = [], towns = [], decor = [];
const chainY = (i) => (i % 2 ? 230 : 0) + (i % 4 === 3 ? -120 : 0);
const xExtent = (pts) => [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
for (const p of parts) {
  const randCoast = rng(1000 + p.number * 97), randTown = rng(2000 + p.number * 89), randDecor = rng(3000 + p.number * 83);
  const list = [...p.chapters, ...p.planned].sort((a, b) => a - b);
  const r = saved.regions[p.number]?.[2] ?? partRadius(list.length);
  const rel = coast(r, randCoast);
  // A land keeps its place and size once made (content-meta/map-layout.json "regions").
  let slot = saved.regions[p.number];
  if (!slot) {
    const prev = regions[regions.length - 1];
    const [minX] = xExtent(rel);
    slot = [Math.round(prev ? prev.maxX + STRAIT - minX : -minX), chainY(regions.length), r];
    saved.regions[p.number] = slot;
  }
  const [cx, cy] = slot;
  const outline = rel.map(([x, y]) => [x + cx, y + cy]);
  // Towns along a road that snakes through the land in columns, west → east, in reading order.
  const cols = Math.max(2, Math.round(Math.sqrt(list.length * 1.1)));
  const perCol = Math.ceil(list.length / cols);
  const mine = [];
  list.forEach((num, i) => {
    const label = pad(num);
    let pos = saved.towns[label];
    if (!pos) {
      const col = Math.floor(i / perCol), j = i % perCol, m = Math.min(perCol, list.length - col * perCol);
      const t = m > 1 ? j / (m - 1) : 0.5, tt = col % 2 ? 1 - t : t;
      const x = cx + (col / (cols - 1) - 0.5) * 2 * r * 0.7;
      const half = r * 0.74 * 0.64 * Math.sqrt(Math.max(0.62, 1 - ((x - cx) / (r * 0.95)) ** 2));
      pos = [Math.round(x + (randTown() - 0.5) * 60 + Math.sin(tt * Math.PI) * 34 * (col % 2 ? -1 : 1)), Math.round(cy - half + tt * 2 * half + (randTown() - 0.5) * 44)];
      saved.towns[label] = pos;
    }
    const planned = !written.has(num);
    if (!saved.emblems[label] && !planned) saved.emblems[label] = 'banner';
    const url = book.readingOrder.find((e) => e.kind === 'chapter' && e.chapter === num)?.url ?? '/roadmap/';
    const town = { label, number: num, part: p.number, x: pos[0], y: pos[1], planned, url,
      sections: sectionsByChapter[num] ?? 0, emblem: planned ? 'scaffold' : saved.emblems[label],
      title: titleOf(num), titleBg: titleBgOf(num), name: saved.names[label]?.en ?? titleOf(num), nameBg: saved.names[label]?.bg ?? titleBgOf(num) };
    towns.push(town); mine.push(town);
  });
  // Keep the band across the top (the Part's name and crest) and every town on dry land.
  const top = Math.min(...mine.map((t) => t.y));
  const labelY = Math.max(cy - r * 0.74, top - 120);
  holdOnLand(outline, cx, cy, [...mine.map((t) => [t.x, t.y + 20, 130]), [cx - r * 0.55, labelY, 110], [cx + r * 0.55, labelY, 110], [cx, labelY - 60, 120]]);
  const land = round(outline);
  const [minX, maxX] = xExtent(land);
  // A few islets off the coast (not in the straits, where the sea lanes run, nor above the name).
  const islets = [];
  for (let k = 0, tries = 0; k < 3 && tries < 40; tries++) {
    const a = randCoast() * TAU;
    if (Math.abs(Math.cos(a)) > 0.72 || Math.sin(a) < -0.88) continue;
    const edge = land.reduce((best, q) => { const d = Math.abs(Math.atan2(Math.sin(Math.atan2(q[1] - cy, q[0] - cx) - a), Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - a))); return d < best.d ? { d, q } : best; }, { d: 9, q: land[0] }).q;
    const ir = 34 + randCoast() ** 2 * 96, out = ir + 70 + randCoast() * 150;
    const ix = edge[0] + Math.cos(a) * out, iy = edge[1] + Math.sin(a) * out * 0.8;
    if (islets.some((o) => Math.hypot(o.x - ix, o.y - iy) < 260)) continue;
    islets.push({ x: ix, y: iy, outline: round(coast(ir, randCoast, 40, 0.72, false).map(([x, y]) => [x + ix, y + iy])) });
    k++;
  }
  regions.push({ number: p.number, roman: p.roman, title: p.title, titleBg: p.titleBg, known: true, cx, cy, r, outline: land,
    islets: islets.map((o) => o.outline), first: p.chapters[0], last: p.chapters[p.chapters.length - 1], minX, maxX });
  // Scenery: highlands for Part I, river valleys and desert for Part II, coast, fields and chimneys for Part III,
  // walls and watchtowers for Part IV (war, peace and geopolitics), mixed country after that.
  const kinds = { 1: ['mountain', 'mountain', 'mountain', 'hill', 'pine', 'pine'], 2: ['dune', 'palm', 'hill', 'reeds', 'mountain'], 3: ['field', 'tree', 'hill', 'chimney', 'tree'] }[p.number]
    ?? ['hill', 'pine', 'mountain', 'field', 'tree', 'hill'];
  for (let k = 0, tries = 0; k < Math.round(r / 4.4) && tries < 5000; tries++) {
    const x = cx + (randDecor() - 0.5) * 2.4 * r, y = cy + (randDecor() - 0.5) * 2 * r * 0.85;
    if (!inside(land, x, y)) continue;
    if (y > labelY - 140 && y < labelY + 70 && Math.abs(x - cx) < r * 0.85) continue;
    if (!inside(land, x, y + 40) || !inside(land, x + 30, y) || !inside(land, x - 30, y)) continue;
    if (towns.some((t) => Math.hypot((t.x - x) * 0.8, (t.y - y) * 1.2) < 110)) continue;
    if (decor.some((d) => Math.hypot(d.x - x, d.y - y) < 50)) continue;
    decor.push({ kind: kinds[Math.floor(randDecor() * kinds.length)], part: p.number, x: Math.round(x), y: Math.round(y), s: +(0.8 + randDecor() * 0.6).toFixed(2) });
    k++;
  }
}

// The lands still to be written: the next one where it will rise, the rest in a ring round the world.
const islands = [];
{
  const last = regions[regions.length - 1];
  const ys = regions.flatMap((r) => r.outline.map((p) => p[1]));
  const top = Math.min(...ys), bottom = Math.max(...ys), west = Math.min(...regions.map((r) => r.minX));
  groups.forEach((g, i) => {
    const rand = rng(5000 + (parts.length + i + 1) * 131);
    const r = islandRadius(g.chapters.length);
    const rel = coast(r, rand, 96, 0.64, false);
    const [minX, maxX] = xExtent(rel);
    let cx, cy;
    if (i === 0) { cx = last.maxX + STRAIT * 1.6 - minX; cy = last.cy - chainY(regions.length - 1) + chainY(regions.length) + 40; }
    else {
      // Clockwise round the known world: along the south from east to west, then the north from west to east.
      const rest = groups.length - 1, south = Math.ceil(rest / 2), north = rest - south, k = i - 1;
      const east = last.maxX + 120;
      if (k < south) { const t = south > 1 ? k / (south - 1) : 0.5; cx = east - t * (east - west) + (rand() - 0.5) * 200; cy = bottom + STRAIT + r * 0.64 + rand() * 120; }
      else { const t = north > 1 ? (k - south) / (north - 1) : 0.5; cx = west + 160 + t * (east - west) + (rand() - 0.5) * 200; cy = top - STRAIT - r * 0.64 - rand() * 120; }
    }
    const outline = round(rel.map(([x, y]) => [x + cx, y + cy]));
    islands.push({ number: parts.length + i + 1, title: g.title, known: false, cx: Math.round(cx), cy: Math.round(cy), r, outline,
      first: g.chapters[0], last: g.chapters[g.chapters.length - 1], minX: minX + cx, maxX: maxX + cx, next: i === 0 });
  });
}

// Frame the world: shift everything so the sea round it is MARGIN wide.
const all = [...regions, ...islands].flatMap((r) => [...r.outline, ...(r.islets ?? []).flat()]);
const dx = MARGIN - Math.min(...all.map((p) => p[0])), dy = MARGIN + 140 - Math.min(...all.map((p) => p[1]));
const W = Math.round(Math.max(...all.map((p) => p[0])) + dx + MARGIN + 260), H = Math.round(Math.max(...all.map((p) => p[1])) + dy + MARGIN);
const shift = ([x, y]) => [Math.round(x + dx), Math.round(y + dy)];
for (const r of [...regions, ...islands]) { r.outline = r.outline.map(shift); if (r.islets) r.islets = r.islets.map((o) => o.map(shift)); [r.cx, r.cy] = shift([r.cx, r.cy]); delete r.minX; delete r.maxX; }
for (const t of towns) { [t.x, t.y] = shift([t.x, t.y]); saved.towns[t.label] = [t.x, t.y]; }
for (const d of decor) [d.x, d.y] = shift([d.x, d.y]);
for (const r of regions) saved.regions[r.number] = [r.cx, r.cy, r.r];
regions.push(...islands);
towns.sort((a, b) => a.number - b.number);

// Wave marks scattered over open sea.
const waves = [];
{
  const rand = rng(777);
  const target = Math.round((W * H) / 160000);
  for (let k = 0, tries = 0; k < target && tries < 8000; tries++) {
    const x = 60 + rand() * (W - 120), y = 60 + rand() * (H - 120);
    if (regions.some((g) => inside(g.outline, x, y) || Math.hypot(g.cx - x, (g.cy - y) / 0.8) < g.r * 1.25)) continue;
    if (waves.some((w) => Math.hypot(w[0] - x, w[1] - y) < 160)) continue;
    waves.push([Math.round(x), Math.round(y)]);
    k++;
  }
}

// Rivers in Part II (the river valleys): from the coast toward the valley floor.
const rivers = [];
const p2 = regions.find((r) => r.number === 2);
if (p2) {
  const rand = rng(4242);
  for (const at of [0.2, 0.62]) {
    const start = p2.outline[Math.floor(at * p2.outline.length)];
    const pts = [start];
    for (let s = 1; s <= 8; s++) {
      const t = s / 8;
      pts.push([Math.round(start[0] + (p2.cx - start[0]) * t * 0.72 + Math.sin(t * 9 + at * 10 + rand()) * 34), Math.round(start[1] + (p2.cy - start[1]) * t * 0.72 + Math.cos(t * 7 + at * 6) * 26)]);
    }
    rivers.push(pts);
  }
}

// Bridges: the chapter pairs the related-sections data connects most often (not neighbours on the road).
const pairCount = {};
for (const [from, tos] of Object.entries(related)) {
  const a = from.match(/^\/(\d{3})-/)?.[1];
  for (const to of tos) {
    const b = to.match(/^\/(\d{3})-/)?.[1];
    if (!a || !b || a === b) continue;
    const key = [a, b].sort().join('-');
    pairCount[key] = (pairCount[key] ?? 0) + 1;
  }
}
const bridges = Object.entries(pairCount).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => { const [a, b] = k.split('-'); return { a, b, n }; })
  .filter(({ a, b, n }) => n >= 6 && Math.abs(Number(a) - Number(b)) > 1 && towns.some((t) => t.label === a) && towns.some((t) => t.label === b))
  .slice(0, 10);

const sortObj = (o) => Object.fromEntries(Object.entries(o).sort());
writeFileSync(layoutPath, JSON.stringify({
  _help: 'Kingdom Map (scripts/map-layout.mjs). regions: Part → [x, y, radius]. towns: chapter → [x, y], kept so towns never move (delete one to re-place it). emblems: chapter → emblem id from src/map/emblems.ts. names: short town names on the map.',
  version: VERSION, regions: saved.regions, towns: sortObj(saved.towns), emblems: sortObj(saved.emblems), names: sortObj(saved.names),
}, null, 1).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2]').replace(/\[\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2, $3]').replace(/\{\n\s+"en": ("[^"]*"),\n\s+"bg": ("[^"]*")\n\s+\}/g, '{ "en": $1, "bg": $2 }') + '\n');
writeFileSync(new URL('src/data/map.json', ROOT), JSON.stringify({ _generated: 'by scripts/map-layout.mjs', width: W, height: H, regions, towns, rivers, bridges, decor, waves }) + '\n');
const missing = towns.filter((t) => t.emblem === 'banner').map((t) => t.label);
console.log(`Kingdom map: ${W} × ${H}, ${parts.length} lands, ${towns.filter((t) => !t.planned).length} towns (+${towns.filter((t) => t.planned).length} planned), ${islands.length} islands, ${bridges.length} bridges.` + (missing.length ? ` No emblem chosen yet for ${missing.join(', ')} (content-meta/map-layout.json).` : ''));

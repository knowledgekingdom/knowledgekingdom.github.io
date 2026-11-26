// The Kingdom Map layout (v2 Phase 5), generated from the book, not drawn by hand.
//   node scripts/map-layout.mjs        (runs before every build)
// - Each Part is a region; each written chapter a town; each section a building in its town.
// - Planned chapters of a written Part are fogged towns at the end of its road; planned groups
//   from the roadmap are fogged islands across the sea ("coming soon").
// - Roads join towns in reading order; bridges join the chapters the related-sections data links most.
// - content-meta/map-layout.json keeps what must not change by itself: town positions (towns never
//   move once placed), each chapter's emblem and short map name (EN/BG). New chapters get a
//   position automatically and the generic banner emblem until one is chosen there.
// Output: src/data/map.json (what the homepage map draws).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const W = 4400, H = 2800;

// Seeded randomness: the same book always gives the same map.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Where regions sit: the written Parts form one continent across the middle, west → east, each
// overlapping the last a little; planned groups are islands around it.
const ISLAND_SLOTS = [[640, 400], [1640, 340], [2640, 370], [3700, 420], [3820, 2420], [2560, 2470], [1340, 2460], [380, 2300]];
const partRadius = (n) => 150 + 135 * Math.sqrt(n);

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

function blob(cx, cy, r, rand, n = 64, squash = 0.78) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(2 * a + ph[0]) + 0.08 * Math.sin(3 * a + ph[1]) + 0.05 * Math.sin(7 * a + ph[2]) + 0.025 * Math.sin(13 * a + ph[3]);
    pts.push([Math.round(cx + r * k * Math.cos(a)), Math.round(cy + r * k * squash * Math.sin(a))]);
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
const islands = roadmap.groups.filter((g) => g.chapters[0] > lastCovered)
  .map((g, i) => ({ number: parts.length + i + 1, title: g.title, chapters: g.chapters, slot: ISLAND_SLOTS[i] }))
  .filter((g) => g.slot);

const regions = [], towns = [], decor = [];
for (const p of parts) {
  const rand = rng(1000 + p.number * 97);
  const list = [...p.chapters, ...p.planned].sort((a, b) => a - b);
  // A region keeps its place and size once made (content-meta/map-layout.json "regions").
  let slot = saved.regions[p.number];
  if (!slot) {
    const prev = regions[regions.length - 1];
    const r0 = Math.round(partRadius(list.length));
    slot = prev ? [Math.round(prev.cx + prev.r + r0 - 70), regions.length % 2 ? 1460 : 1360, r0] : [200 + r0, 1360, r0];
    saved.regions[p.number] = slot;
  }
  const [cx, cy, r] = slot;
  const outline = blob(cx, cy, r, rand);
  regions.push({ number: p.number, roman: p.roman, title: p.title, titleBg: p.titleBg, known: true, cx, cy, r: Math.round(r), outline,
    first: p.chapters[0], last: p.chapters[p.chapters.length - 1] });
  // Towns along a road that snakes through the region in columns, west → east, in reading order,
  // so each Part's road ends where the next Part begins.
  const cols = Math.max(2, Math.round(Math.sqrt(list.length * 1.1)));
  const perCol = Math.ceil(list.length / cols);
  list.forEach((num, i) => {
    const label = pad(num);
    let pos = saved.towns[label];
    if (!pos) {
      const col = Math.floor(i / perCol), j = i % perCol, m = Math.min(perCol, list.length - col * perCol);
      const t = m > 1 ? j / (m - 1) : 0.5, tt = col % 2 ? 1 - t : t;
      const x = cx + (col / (cols - 1) - 0.5) * 2 * r * 0.72;
      const half = r * 0.78 * 0.66 * Math.sqrt(Math.max(0.62, 1 - ((x - cx) / (r * 0.95)) ** 2));
      pos = [Math.round(x + (rand() - 0.5) * 34 + Math.sin(tt * Math.PI) * 20 * (col % 2 ? -1 : 1)), Math.round(cy - half + tt * 2 * half + (rand() - 0.5) * 30)];
      saved.towns[label] = pos;
    }
    const planned = !written.has(num);
    if (!saved.emblems[label] && !planned) saved.emblems[label] = 'banner';
    const url = book.readingOrder.find((e) => e.kind === 'chapter' && e.chapter === num)?.url ?? '/roadmap/';
    towns.push({ label, number: num, part: p.number, x: pos[0], y: pos[1], planned, url,
      sections: sectionsByChapter[num] ?? 0, emblem: planned ? 'scaffold' : saved.emblems[label],
      title: titleOf(num), titleBg: titleBgOf(num), name: saved.names[label]?.en ?? titleOf(num), nameBg: saved.names[label]?.bg ?? titleBgOf(num) });
  });
  // Scenery: highlands for Part I, river valleys and desert for Part II, coast, fields and chimneys for Part III.
  const kinds = p.number === 1 ? ['mountain', 'mountain', 'mountain', 'hill', 'pine', 'pine'] : p.number === 2 ? ['dune', 'palm', 'hill', 'reeds', 'mountain'] : ['field', 'tree', 'hill', 'chimney', 'tree'];
  // Keep the band across the top clear for the region's name and crest.
  const top = Math.min(...towns.filter((t) => t.part === p.number).map((t) => t.y));
  const labelY = Math.max(cy - r * 0.74, top - 120);
  for (let k = 0, tries = 0; k < Math.round(r / 5) && tries < 3000; tries++) {
    const x = cx + (rand() - 0.5) * 2 * r, y = cy + (rand() - 0.5) * 2 * r * 0.8;
    if (!inside(outline, x, y)) continue;
    if (y > labelY - 130 && y < labelY + 70 && Math.abs(x - cx) < r * 0.85) continue;
    if (!inside(outline, x, y + 40) || !inside(outline, x + 30, y) || !inside(outline, x - 30, y)) continue;
    if (towns.some((t) => Math.hypot((t.x - x) * 0.8, (t.y - y) * 1.2) < 110)) continue;
    if (decor.some((d) => Math.hypot(d.x - x, d.y - y) < 48)) continue;
    decor.push({ kind: kinds[Math.floor(rand() * kinds.length)], part: p.number, x: Math.round(x), y: Math.round(y), s: +(0.8 + rand() * 0.6).toFixed(2) });
    k++;
  }
}
for (const g of islands) {
  const rand = rng(5000 + g.number * 131);
  const r = 210 + 46 * Math.sqrt(g.chapters.length);
  const [cx, cy] = g.slot;
  regions.push({ number: g.number, title: g.title, known: false, cx, cy, r: Math.round(r), outline: blob(cx, cy, r, rand, 56, 0.66),
    first: g.chapters[0], last: g.chapters[g.chapters.length - 1] });
}
towns.sort((a, b) => a.number - b.number);

// Wave marks scattered over open sea.
const waves = [];
{
  const rand = rng(777);
  for (let k = 0, tries = 0; k < 120 && tries < 5000; tries++) {
    const x = 60 + rand() * (W - 120), y = 60 + rand() * (H - 120);
    if (regions.some((g) => inside(g.outline, x, y) || Math.hypot(g.cx - x, (g.cy - y) / 0.8) < g.r * 1.3)) continue;
    if (waves.some((w) => Math.hypot(w[0] - x, w[1] - y) < 150)) continue;
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
    for (let s = 1; s <= 7; s++) {
      const t = s / 7;
      pts.push([Math.round(start[0] + (p2.cx - start[0]) * t * 0.75 + Math.sin(t * 9 + at * 10) * 28), Math.round(start[1] + (p2.cy - start[1]) * t * 0.75 + Math.cos(t * 7 + at * 6) * 22)]);
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
  version: 1, regions: saved.regions, towns: sortObj(saved.towns), emblems: sortObj(saved.emblems), names: sortObj(saved.names),
}, null, 1).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2]').replace(/\{\n\s+"en": ("[^"]*"),\n\s+"bg": ("[^"]*")\n\s+\}/g, '{ "en": $1, "bg": $2 }') + '\n');
writeFileSync(new URL('src/data/map.json', ROOT), JSON.stringify({ _generated: 'by scripts/map-layout.mjs', width: W, height: H, regions, towns, rivers, bridges, decor, waves }) + '\n');
const missing = towns.filter((t) => t.emblem === 'banner').map((t) => t.label);
console.log(`Kingdom map: ${parts.length} regions, ${towns.filter((t) => !t.planned).length} towns (+${towns.filter((t) => t.planned).length} planned), ${islands.length} islands, ${bridges.length} bridges.` + (missing.length ? ` No emblem chosen yet for ${missing.join(', ')} (content-meta/map-layout.json).` : ''));

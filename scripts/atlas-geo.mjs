// Builds the Atlas base map (v2 Phase 6) from Natural Earth (public domain): land, lakes and
// major rivers, projected (src/atlas/projection.ts), simplified and stored compactly in
// public/atlas/geo.json. The result is committed, so builds never need the internet; run this
// again only to change the base map:
//   1. download ne_50m_land, ne_50m_lakes and ne_50m_rivers_lake_centerlines (GeoJSON) from
//      https://github.com/nvkelso/natural-earth-vector/tree/master/geojson into a folder
//   2. node scripts/atlas-geo.mjs <that folder>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { project, ATLAS_W, ATLAS_H } from '../src/atlas/projection.ts';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/atlas-geo.mjs <folder with the Natural Earth GeoJSON files>'); process.exit(1); }
const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.geojson`), 'utf8')).features;

/** Douglas–Peucker simplification of a projected line (tolerance in atlas units). */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      // Closed rings start and end on the same point: measure from that point instead.
      const d = len ? Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (pts) => { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(s / 2); };
// Rings and lines are stored as [x0, y0, dx1, dy1, …]: small numbers, small file.
const encode = (pts) => { const out = []; let px = 0, py = 0; for (const [x, y] of pts) { out.push(x - px, y - py); px = x; py = y; } return out; };
const proj = (ring) => {
  const out = [];
  for (const [lon, lat] of ring) { const p = project(lat, lon); const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  return out;
};
const polygons = (f) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
const lines = (f) => f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : [];

let points = 0;
const ring = (r, tol, minArea) => { const p = simplify(proj(r), tol); if (p.length < 4 || area(p) < minArea) return null; points += p.length; return encode(p); };
const land = load('ne_50m_land').flatMap(polygons).map((poly) => ring(poly[0], 1.1, 6)).filter(Boolean);
const lakes = load('ne_50m_lakes').filter((f) => (f.properties.scalerank ?? 9) <= 4).flatMap(polygons).map((poly) => ring(poly[0], 1.1, 30)).filter(Boolean);
const rivers = load('ne_50m_rivers_lake_centerlines').filter((f) => f.properties.featurecla === 'River' && (f.properties.scalerank ?? 9) <= 5)
  .flatMap(lines).map((l) => { const p = simplify(proj(l), 1.5); if (p.length < 2) return null; points += p.length; return encode(p); }).filter(Boolean);
// The world's outline (the edge of the projection), for the sea and the graticule frame.
const edge = [];
for (let lat = -90; lat <= 90; lat += 2) edge.push(project(lat, 180));
for (let lat = 90; lat >= -90; lat -= 2) edge.push(project(lat, -180));
const graticule = [];
for (let lon = -150; lon <= 150; lon += 30) { const l = []; for (let lat = -90; lat <= 90; lat += 3) l.push(project(lat, lon)); graticule.push(encode(l)); }
for (let lat = -60; lat <= 60; lat += 30) { const l = []; for (let lon = -180; lon <= 180; lon += 3) l.push(project(lat, lon)); graticule.push(encode(l)); }

mkdirSync(new URL('../public/atlas/', import.meta.url), { recursive: true });
const out = { _source: 'Natural Earth 1:50m (public domain), via scripts/atlas-geo.mjs', width: ATLAS_W, height: ATLAS_H, edge: encode(edge), graticule, land, lakes, rivers };
const json = JSON.stringify(out);
writeFileSync(new URL('../public/atlas/geo.json', import.meta.url), json);
console.log(`Atlas base map: ${land.length} land rings, ${lakes.length} lakes, ${rivers.length} rivers, ${points} points, ${Math.round(json.length / 1024)} KB.`);

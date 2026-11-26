// Tests for the Atlas (v2 Phase 6): projection, base map file, empire entries in the knowledge
// layer, and the approved/proposed data the page draws. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, ATLAS_W, ATLAS_H } from '../src/atlas/projection.ts';
import { validate } from '../scripts/knowledge.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

test('projection: the world fits the atlas, north is up, east is right', () => {
  const [cx, cy] = project(0, 0);
  assert.ok(Math.abs(cx - ATLAS_W / 2) < 5 && Math.abs(cy - ATLAS_H / 2) < 5);
  for (const [lat, lon] of [[90, 180], [-90, -180], [85, 0], [-85, 179]]) {
    const [x, y] = project(lat, lon);
    assert.ok(x >= 0 && x <= ATLAS_W && y >= 0 && y <= ATLAS_H, `${lat},${lon} → ${x},${y}`);
  }
  assert.ok(project(50, 0)[1] < project(0, 0)[1], 'north is up');
  assert.ok(project(0, 90)[0] > project(0, 0)[0], 'east is right');
});

test('base map: land, lakes and rivers decode to points inside the atlas', () => {
  const geo = read('public/atlas/geo.json');
  assert.ok(geo.land.length > 500 && geo.rivers.length > 100 && geo.lakes.length > 50);
  for (const ring of [...geo.land.slice(0, 50), ...geo.rivers.slice(0, 50)]) {
    let x = 0, y = 0;
    for (let i = 0; i < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; assert.ok(x >= -5 && x <= ATLAS_W + 5 && y >= -5 && y <= ATLAS_H + 5); }
  }
});

test('empires need key cities and a start date; cities may join "@year"', () => {
  const index = { ids: new Map([['015/p', '/015-x/p/']]), moved: {} };
  const city = (id) => ({ id, name: id, lat: 1, lon: 1, type: 'city', sections: ['015/p'], source: 'wikidata:Q1', status: 'proposed' });
  const base = { events: [], routes: [], concepts: [], places: [city('susa'), city('sardis')] };
  const empire = (extra) => ({ id: 'e', name: 'E', lat: 1, lon: 1, type: 'empire', sections: ['015/p'], source: 'centre', status: 'proposed', ...extra });
  assert.deepEqual(validate({ ...base, places: [...base.places, empire({ extent: ['susa', 'sardis@546 BCE'], active: { from: 'c. 550 BCE', to: 'c. 330 BCE' } })] }, index).errors, []);
  const errs = (extra) => validate({ ...base, places: [...base.places, empire(extra)] }, index).errors.join(' | ');
  assert.match(errs({ active: { from: '550 BCE' } }), /needs extent/);
  assert.match(errs({ extent: ['nowhere'], active: { from: '550 BCE' } }), /isn't in places.yaml/);
  assert.match(errs({ extent: ['susa@soon'], active: { from: '550 BCE' } }), /year after @/);
  assert.match(errs({ extent: ['susa'] }), /needs active.from/);
  assert.match(validate({ ...base, places: [{ ...city('x'), extent: ['susa'] }, ...base.places] }, index).errors.join(' | '), /only an empire/);
});

test('knowledge: every route stop and empire city exists, and every place has coordinates', () => {
  const k = read('src/data/knowledge.json');
  const ids = new Set(k.places.map((p) => p.id));
  for (const r of k.routes) for (const p of r.places) assert.ok(ids.has(p), `${r.id}: ${p}`);
  for (const p of k.places.filter((q) => q.type === 'empire')) {
    assert.ok(p.extent.length && p.active?.from !== null, p.id);
    for (const x of p.extent) assert.ok(ids.has(x.split('@')[0]), `${p.id}: ${x}`);
  }
  for (const p of k.places) assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.sections.length, p.id);
});

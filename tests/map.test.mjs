// Tests for the Kingdom Map: the layout generator (scripts/map-layout.mjs) and the drawing
// (src/map/render.ts). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderMap, renderTop, townStates, partsDone, fogHoles, houseSlots } from '../src/map/render.ts';
import { EMBLEMS } from '../src/map/emblems.ts';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const map = read('src/data/map.json');
const book = read('src/data/book.json');
const layout = read('content-meta/map-layout.json');

test('layout is deterministic: running the generator again changes nothing', () => {
  const before = readFileSync(new URL('src/data/map.json', root), 'utf8');
  execFileSync(process.execPath, ['scripts/map-layout.mjs'], { cwd: root });
  assert.equal(readFileSync(new URL('src/data/map.json', root), 'utf8'), before);
});

test('every written chapter is a town, in its Part, with a stored position and an emblem that exists', () => {
  const written = book.parts.flatMap((p) => p.chapters.map((n) => [n, p.number]));
  for (const [n, part] of written) {
    const t = map.towns.find((x) => x.number === n);
    assert.ok(t, `chapter ${n} has a town`);
    assert.equal(t.part, part);
    assert.equal(t.planned, false);
    assert.deepEqual(layout.towns[t.label], [t.x, t.y], `position of ${t.label} is kept in map-layout.json`);
    assert.ok(EMBLEMS[t.emblem], `emblem ${t.emblem} exists`);
  }
});

test('towns are inside the map and not on top of each other', () => {
  for (const t of map.towns) {
    assert.ok(t.x > 0 && t.x < map.width && t.y > 0 && t.y < map.height, `${t.label} inside`);
    for (const u of map.towns) if (u !== t) assert.ok(Math.hypot(t.x - u.x, t.y - u.y) > 110, `${t.label} and ${u.label} apart`);
  }
});

test('bridges join towns that exist, and are not neighbours on the road', () => {
  const labels = new Set(map.towns.map((t) => t.label));
  assert.ok(map.bridges.length > 0);
  for (const b of map.bridges) {
    assert.ok(labels.has(b.a) && labels.has(b.b));
    assert.ok(Math.abs(Number(b.a) - Number(b.b)) > 1);
  }
});

test('planned groups beyond the written Parts are fogged islands', () => {
  const islands = map.regions.filter((r) => !r.known);
  assert.ok(islands.length >= 1);
  for (const r of islands) assert.ok(r.first > Math.max(...map.towns.map((t) => t.number)));
});

test('town states: done, started, next, unread, planned', () => {
  const progress = { '001': 999, '002': 3 };
  const { states, next, current } = townStates(map.towns, progress);
  assert.equal(states['001'], 'done');
  assert.equal(states['002'], 'started');
  assert.equal(states['003'], 'next');
  assert.equal(next, '003');
  assert.equal(current, '002');
  assert.equal(states['010'], 'unread');
  const planned = map.towns.find((t) => t.planned);
  assert.ok(planned, 'the roadmap still has planned chapters');
  assert.equal(states[planned.label], 'planned');
  const fresh = townStates(map.towns, {});
  assert.equal(fresh.states['001'], 'next');
  assert.equal(fresh.current, '001');
});

test('a Part is done when all its written chapters are', () => {
  const all = Object.fromEntries(map.towns.filter((t) => t.part === 1).map((t) => [t.label, t.sections]));
  assert.deepEqual(partsDone(map, townStates(map.towns, all).states), [1]);
  delete all['008'];
  assert.deepEqual(partsDone(map, townStates(map.towns, all).states), []);
});

test('fog clears around visited towns (and the first town for a new reader)', () => {
  assert.deepEqual(fogHoles(map, townStates(map.towns, {}).states).map((h) => h.label), ['001']);
  const h = fogHoles(map, townStates(map.towns, { '001': 99, '002': 1 }).states);
  assert.deepEqual(h.map((x) => x.label), ['001', '002', '003']);
});

test('the drawing: one link per town, lit buildings, banners, crests, BG names and links', () => {
  const progress = Object.fromEntries(map.towns.filter((t) => t.part === 1).map((t) => [t.label, t.sections]));
  progress['010'] = 5;
  const svg = renderMap(map, { progress });
  assert.equal((svg.match(/<a class="km-town/g) ?? []).length, map.towns.length);
  const farm = svg.slice(svg.indexOf('data-ch="010"'), svg.indexOf('data-ch="011"'));
  assert.match(farm, /class="km-house on" data-lit="5"/);
  assert.equal((farm.match(/v-4\.6/g) ?? []).length, map.towns.find((t) => t.label === '010').sections);
  assert.match(svg, /class="km-crest is-done" data-part="1"/);
  assert.equal((svg.match(/<g class="km-flag">/g) ?? []).length, 8);
  const bg = renderMap(map, { lang: 'bg', strings: { part: 'Част' } });
  assert.match(bg, /href="\/bg\/010-/);
  assert.match(bg, /Земеделие/);
  assert.match(renderTop(map), /coming soon/);
});

test('every section gets a building', () => {
  for (const n of [1, 16, 37, 60]) assert.equal(houseSlots(n).length, n);
});

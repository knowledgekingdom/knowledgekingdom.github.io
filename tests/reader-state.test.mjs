// Tests for src/lib/reader-state.ts. Run with `npm test` (Node runs the TypeScript directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, migrate, follow, cleanSettings, STATE_KEY, SETTINGS_KEY, SCHEMA_VERSION } from '../src/lib/reader-state.ts';

class MemoryKV {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}
class FullKV extends MemoryKV { setItem() { throw new Error('QuotaExceededError'); } }

const P1 = '/001-how-to-know-what-is-true/what-does-it-mean-to-know-something/';
const P2 = '/002-logic-arguments-and-common-fallacies/what-an-argument-is/';
const OLD = '/001-how-to-know-what-is-true/three-investigations-a-photograph-a-historical-claim-and-a/';
const NEW = '/001-how-to-know-what-is-true/three-investigations-a-photograph-a-historical-claim/';

test('starts empty and remembers what is read', () => {
  const kv = new MemoryKV();
  const s = createStore(kv);
  assert.equal(s.readCount(), 0);
  s.update((st) => { st.read[P1] = 100; });
  assert.ok(s.isRead(P1));
  const again = createStore(kv);
  assert.equal(again.state.read[P1], 100);
  assert.equal(JSON.parse(kv.getItem(STATE_KEY)).v, SCHEMA_VERSION);
});

test('works without storage (private window) and when storage is full', () => {
  const s = createStore(null);
  s.update((st) => { st.read[P1] = 1; });
  assert.ok(s.isRead(P1));
  const full = createStore(new FullKV());
  full.update((st) => { st.read[P2] = 2; });
  assert.ok(full.isRead(P2));
  full.setSettings({ theme: 'dark' });
  assert.equal(full.settings.theme, 'dark');
});

test('moves data from the old storage keys once, then deletes them', () => {
  const kv = new MemoryKV({
    'kk-read': JSON.stringify({ [P1]: 5, [OLD]: 7, 'javascript:alert(1)': 3 }),
    'kk-last': JSON.stringify({ path: P2, titles: { en: 'What an argument is', bg: 'Какво е аргумент' } }),
    'kk-fc-003': JSON.stringify({ order: [3, 1, 2], known: [1], review: [2], idx: 1, mode: 'review' }),
    'kk-theme': 'dark',
    'kk-palette': 'ocean',
    'unrelated': 'keep me',
  });
  const s = createStore(kv, { moved: { [OLD]: NEW }, keys: () => kv.keys() });
  assert.deepEqual(Object.keys(s.state.read).sort(), [NEW, P1].sort(), 'renamed page followed, junk dropped');
  assert.equal(s.state.last.path, P2);
  assert.equal(s.state.last.titles.bg, 'Какво е аргумент');
  assert.deepEqual(s.state.decks['003'], { order: [3, 1, 2], known: [1], review: [2], idx: 1, mode: 'review' });
  assert.deepEqual(s.settings, { theme: 'dark', palette: 'ocean' });
  for (const k of ['kk-read', 'kk-last', 'kk-fc-003', 'kk-theme', 'kk-palette']) assert.equal(kv.getItem(k), null, k);
  assert.equal(kv.getItem('unrelated'), 'keep me');
  assert.ok(kv.getItem(STATE_KEY) && kv.getItem(SETTINGS_KEY));
});

test('a page renamed after an import keeps its read mark', () => {
  const kv = new MemoryKV({ [STATE_KEY]: JSON.stringify({ v: 1, read: { [OLD]: 9 }, last: { path: OLD, scroll: 0.5, at: 1, titles: {} } }) });
  const s = createStore(kv, { moved: { [OLD]: NEW } });
  assert.ok(s.isRead(NEW) && !s.isRead(OLD));
  assert.equal(s.state.last.path, NEW);
  assert.ok(JSON.parse(kv.getItem(STATE_KEY)).read[NEW], 'saved, so it is not redone every page load');
});

test('follow() handles chains and loops', () => {
  assert.equal(follow('/a/', { '/a/': '/b/', '/b/': '/c/' }), '/c/');
  assert.equal(typeof follow('/a/', { '/a/': '/b/', '/b/': '/a/' }), 'string');
});

test('update() re-reads storage, so two tabs do not overwrite each other', () => {
  const kv = new MemoryKV();
  const tab1 = createStore(kv);
  const tab2 = createStore(kv);
  tab1.update((st) => { st.read[P1] = 1; });
  tab2.update((st) => { st.read[P2] = 2; });
  assert.deepEqual(Object.keys(createStore(kv).state.read).sort(), [P1, P2].sort());
});

test('subscribers hear about changes; reload() picks up other tabs', () => {
  const kv = new MemoryKV();
  const s = createStore(kv);
  let calls = 0;
  const off = s.subscribe(() => calls++);
  s.update((st) => { st.badges.first = 1; });
  s.setSettings({ rate: 1.25 });
  createStore(kv).update((st) => { st.read[P1] = 1; });
  s.reload();
  assert.equal(calls, 3);
  assert.ok(s.isRead(P1));
  off();
  s.update(() => {});
  assert.equal(calls, 3);
});

test('reset() forgets reading but keeps flashcards and settings unless asked', () => {
  const kv = new MemoryKV();
  const s = createStore(kv);
  s.update((st) => { st.read[P1] = 1; st.last = { path: P1, scroll: 0, at: 1, titles: {} }; st.decks['001'] = { order: [1], known: [], review: [], idx: 0, mode: 'all' }; });
  s.setSettings({ theme: 'light' });
  s.reset();
  assert.equal(s.readCount(), 0);
  assert.equal(s.state.last, null);
  assert.ok(s.state.decks['001']);
  assert.equal(s.settings.theme, 'light');
  s.reset(true);
  assert.deepEqual(s.state.decks, {});
});

test('export and import round-trip, merging with what is already there', () => {
  const a = createStore(new MemoryKV());
  a.update((st) => {
    st.read[P1] = 10;
    st.bookmarks[P2] = { at: 5, titles: { en: 'Arg' } };
    st.badges['finished-part-1'] = 50;
    st.last = { path: P2, scroll: 0.4, at: 20, titles: {} };
  });
  a.setSettings({ theme: 'dark', fontScale: 1.1 });
  const file = a.exportJson(Date.UTC(2026, 10, 25));
  assert.match(file, /"exported": "2026-11-25T00:00:00.000Z"/);

  const b = createStore(new MemoryKV());
  b.update((st) => { st.read[P1] = 30; st.read[NEW] = 2; st.last = { path: NEW, scroll: 0.1, at: 10, titles: {} }; });
  b.setSettings({ theme: 'light' });
  const res = b.importJson(file, 'merge');
  assert.deepEqual(res, { ok: true, read: 2 });
  assert.equal(b.state.read[P1], 30, 'later read time kept');
  assert.equal(b.state.last.path, P2, 'most recent position wins');
  assert.ok(b.state.bookmarks[P2] && b.state.badges['finished-part-1']);
  assert.equal(b.settings.theme, 'light', 'this device keeps its own settings on merge');
  assert.equal(b.settings.fontScale, 1.1, 'settings it did not have are added');

  const c = createStore(new MemoryKV());
  c.importJson(file, 'replace');
  assert.deepEqual(c.state, a.state);
  assert.deepEqual(c.settings, a.settings);
});

test('import rejects other files and newer versions, and cleans bad values', () => {
  const s = createStore(new MemoryKV());
  assert.deepEqual(s.importJson('not json'), { ok: false, error: 'format' });
  assert.deepEqual(s.importJson('{"hello":1}'), { ok: false, error: 'format' });
  assert.deepEqual(s.importJson(JSON.stringify({ app: 'knowledge-kingdom', schema: SCHEMA_VERSION + 1, state: {} })), { ok: false, error: 'newer' });
  const res = s.importJson(JSON.stringify({ app: 'knowledge-kingdom', schema: 1, state: {
    read: { [P1]: 'yesterday', [P2]: 5, 'no-slash': 1, '/<script>/': 1 },
    decks: { 'abc': { order: [1] }, '004': { order: [1, 'x', 2], known: 'nope' } },
  }, settings: { theme: 'neon', fontScale: 9, palette: 'Bad Name', rate: 1.5 } }));
  assert.deepEqual(res, { ok: true, read: 1 });
  assert.deepEqual(s.state.read, { [P2]: 5 });
  assert.deepEqual(s.state.decks, { '004': { order: [1, 2], known: [], review: [], idx: 0, mode: 'all' } });
  assert.deepEqual(s.settings, { rate: 1.5 });
});

test('listen settings: voice per language, speed and "then the next section" are kept', () => {
  const s = createStore(new MemoryKV());
  s.setSettings({ voice: { en: 'Daniel', bg: 'Ivan' }, rate: 1.25, autoNext: true });
  assert.deepEqual(createStore(new MemoryKV({ [SETTINGS_KEY]: JSON.stringify(s.settings) })).settings,
    { voice: { en: 'Daniel', bg: 'Ivan' }, rate: 1.25, autoNext: true });
  assert.deepEqual(cleanSettings({ autoNext: 'yes', rate: 9 }), {});
});

test('migrate() and cleanSettings() never throw on garbage', () => {
  for (const junk of [null, 42, 'x', [], { read: [] }, { last: { path: 5 } }, { bookmarks: { '/a/': null } }]) {
    assert.equal(migrate(junk).v, SCHEMA_VERSION);
    assert.deepEqual(cleanSettings(junk), {});
  }
});

// Tests for spaced repetition (src/lib/srs.ts), streaks and badges (src/lib/badges.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rate, previewDue, isDue, isMastered, interval, toCard, fromCard, _setFuzz, AGAIN, GOOD, EASY } from '../src/lib/srs.ts';
import { emptyState, migrate, bump, streak, dayKey } from '../src/lib/reader-state.ts';
import { earned, sealSvg, BADGES } from '../src/lib/badges.ts';

_setFuzz(false);
const T0 = new Date(2026, 10, 25, 9, 0, 0);
const at = (days, h = 9) => new Date(2026, 10, 25 + days, h, 0, 0);

test('a new card: Again comes back within minutes, Good later, Easy later still', () => {
  const p = previewDue(undefined, T0);
  assert.ok(p[1] - T0.getTime() <= 10 * 60e3, 'again: minutes');
  assert.ok(p[1] <= p[2] && p[2] <= p[3] && p[3] < p[4], JSON.stringify(p));
  assert.ok(p[4] - T0.getTime() >= 24 * 3600e3, 'easy: at least a day');
});

test('reviews spread out as a card is remembered, and shrink after a lapse', () => {
  let c = rate(undefined, GOOD, T0);
  let now = new Date(c.d);
  const gaps = [];
  for (let i = 0; i < 4; i++) {
    const next = rate(c, GOOD, now);
    gaps.push(next.d - now.getTime());
    c = next; now = new Date(c.d);
  }
  assert.ok(gaps.every((g, i) => i === 0 || g > gaps[i - 1]), `growing gaps ${gaps}`);
  const lapsed = rate(c, AGAIN, now);
  assert.ok(lapsed.d - now.getTime() < gaps.at(-1), 'a forgotten card comes back sooner');
  assert.equal(lapsed.l, 1);
});

test('stored cards round-trip and are judged due by the end of the day', () => {
  const c = rate(undefined, EASY, T0);
  assert.deepEqual(fromCard(toCard(c)), c);
  assert.equal(isDue({ ...c, d: at(0, 23).getTime() }, T0), true);
  assert.equal(isDue({ ...c, d: at(1, 1).getTime() }, T0), false);
  assert.equal(isMastered({ ...c, st: 2, s: 30 }), true);
  assert.equal(isMastered({ ...c, st: 1, s: 30 }), false);
});

test('interval labels', () => {
  assert.equal(interval(30e3, 'en'), '<1 min');
  assert.equal(interval(10 * 60e3, 'en'), '10 min');
  assert.equal(interval(3 * 86400e3, 'bg'), '3 д');
  assert.equal(interval(400 * 86400e3, 'en'), '1.1 y');
});

test('streaks count consecutive days, today or ending yesterday', () => {
  const s = emptyState();
  for (const d of [-3, -2, -1]) bump(s, 'r', 5, at(d));
  assert.equal(streak(s.activity, T0), 3, 'nothing yet today: still a 3-day streak');
  bump(s, 's', 1, T0);
  assert.equal(streak(s.activity, T0), 4);
  assert.equal(streak(s.activity, at(2)), 0, 'a missed day ends it');
  assert.equal(dayKey(T0), '2026-11-25');
});

test('activity, review settings and game scores survive saving and cleaning', () => {
  const s = migrate({ activity: { '2026-11-25': { r: 3, s: 1, junk: 9 }, 'bad-day': { r: 1 } }, review: { chapters: ['001', 'x'], newPerDay: 10 },
    games: { 'which-came-first': { played: 2, best: 7 }, 'Bad Id!': { played: 1 } },
    srs: { '001-3': { d: 1, s: 2, df: 5, st: 2 }, 'nope': { d: 1 } } });
  assert.deepEqual(s.activity, { '2026-11-25': { s: 1, r: 3 } });
  assert.deepEqual(s.review, { chapters: ['001'], newPerDay: 10 });
  assert.deepEqual(Object.keys(s.games), ['which-came-first']);
  assert.deepEqual(Object.keys(s.srs), ['001-3']);
});

const meta = { chapters: [
  { path: '/001-a/', label: '001', part: 1, total: 2, region: null },
  { path: '/012-egypt/', label: '012', part: 2, total: 1, region: 'africa' },
] };

test('badges follow what the reader has done', () => {
  const s = emptyState();
  assert.deepEqual(earned(s, meta, T0), []);
  s.read['/001-a/x/'] = 1;
  assert.deepEqual(earned(s, meta, T0), ['first-page']);
  s.read['/001-a/y/'] = 1;
  assert.deepEqual(earned(s, meta, T0), ['first-page', 'chapter-complete', 'part-1']);
  s.games['which-came-first'] = { played: 3, best: 10 };
  s.games['fallacy-detective'] = { played: 1, best: 9 };
  for (let d = -6; d <= 0; d++) bump(s, 'r', 15, at(d));
  const e = earned(s, meta, T0);
  for (const b of ['time-keeper', 'fallacy-detective', 'streak-7', 'cards-100']) assert.ok(e.includes(b), b);
  assert.ok(!e.includes('streak-30') && !e.includes('part-2'));
});

test('every badge has a seal', () => {
  for (const b of BADGES) assert.match(sealSvg(b.glyph, { color: '#13707a', earned: true }), /^<svg[\s\S]*<\/svg>$/);
});

// Explorer badges (v2 Phase 2.4): which milestones a reader has reached. Pure functions, so the
// same rules run in the browser (src/scripts/badges.ts) and in tests. No points, no leaderboards.
import type { ReaderState } from './reader-state.ts';
import { streak } from './reader-state.ts';
import type { StoredCard } from './reader-state.ts';

// Same rule as src/lib/srs.ts (kept here so pages that only check badges don't load the scheduler):
// a card in the Review state (2) whose memory is stable for 21+ days.
const isMastered = (x: StoredCard) => x.st === 2 && x.s >= 21;

/** What the rules need to know about the book (embedded in every page by Base.astro). */
export type BookMeta = { chapters: { path: string; label: string; part: number | null; total: number; region: string | null }[] };

export type BadgeId = 'first-page' | 'chapter-complete' | 'part-1' | 'part-2' | 'part-3' | 'part-4' | 'world-reader' | 'cards-100'
  | 'cards-1000' | 'mastered-50' | 'streak-7' | 'streak-30' | 'time-keeper' | 'fallacy-detective';

/** Glyph (icon path, 24 × 24) and which Part colour the seal uses. */
export const BADGES: { id: BadgeId; glyph: string; part: number }[] = [
  { id: 'first-page', part: 1, glyph: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h4"/>' },
  { id: 'chapter-complete', part: 1, glyph: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z"/><path d="m9 9 2 2 4-4"/>' },
  { id: 'part-1', part: 1, glyph: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' },
  { id: 'part-2', part: 2, glyph: '<path d="M3 20h18M6 20V10l6-5 6 5v10"/><path d="M10 20v-5h4v5"/>' },
  { id: 'part-3', part: 3, glyph: '<path d="M3 17h18l-2 4H5z"/><path d="M7 17V9h4v8M13 17V5h4v12"/>' },
  { id: 'part-4', part: 4, glyph: '<path d="M4 14c3 0 5-1.5 6.5-4C12 13 14.5 14.5 18 14l3-3l-3-.5c-1-3.2-3.5-5-6.5-5c1 2 .8 3.8-.8 5"/><path d="M7 18c2.5 1 5 1 7.5-.5M9.5 18.5l-1 2.5M13 18.2l.8 2.3"/>' },
  { id: 'world-reader', part: 2, glyph: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
  { id: 'cards-100', part: 4, glyph: '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v11"/>' },
  { id: 'cards-1000', part: 4, glyph: '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v11"/><path d="m7 13 2 2 4-4"/>' },
  { id: 'mastered-50', part: 5, glyph: '<path d="M12 3c3 3 6 4 6 9a6 6 0 0 1-12 0c0-5 3-6 6-9Z"/><path d="M12 21v-6"/>' },
  { id: 'streak-7', part: 3, glyph: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 2 3-4Z"/>' },
  { id: 'streak-30', part: 3, glyph: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 2 3-4Z"/><path d="M4 21h16"/>' },
  { id: 'time-keeper', part: 6, glyph: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>' },
  { id: 'fallacy-detective', part: 6, glyph: '<circle cx="10" cy="10" r="6"/><path d="m21 21-6.5-6.5"/>' },
];

/** Regions a reader visits for "Around the world" (history chapters only). */
export const WORLD_REGIONS = ['africa', 'west-asia', 'mediterranean-europe', 'south-asia', 'east-asia', 'americas'];

export function progressFacts(s: ReaderState, meta: BookMeta, now = new Date()) {
  const perChapter: Record<string, number> = {};
  for (const p of Object.keys(s.read)) {
    const ch = p.match(/^\/[^/]+\//)?.[0] ?? '';
    perChapter[ch] = (perChapter[ch] ?? 0) + 1;
  }
  const finished = meta.chapters.filter((c) => c.total > 0 && (perChapter[c.path] ?? 0) >= c.total);
  const partDone = (n: number) => {
    const cs = meta.chapters.filter((c) => c.part === n);
    return cs.length > 0 && cs.every((c) => finished.includes(c));
  };
  const reviews = Object.values(s.activity).reduce((n, a) => n + (a.r ?? 0), 0);
  return {
    read: Object.keys(s.read).length,
    finished,
    partDone,
    regions: new Set(finished.map((c) => c.region).filter(Boolean)),
    reviews,
    mastered: Object.values(s.srs).filter(isMastered).length,
    streak: streak(s.activity, now),
  };
}

/** Every badge the reader has earned by now (whether or not it was already recorded). */
export function earned(s: ReaderState, meta: BookMeta, now = new Date()): BadgeId[] {
  const f = progressFacts(s, meta, now);
  const out: BadgeId[] = [];
  if (f.read >= 1) out.push('first-page');
  if (f.finished.length >= 1) out.push('chapter-complete');
  for (const n of [1, 2, 3, 4] as const) if (f.partDone(n)) out.push(`part-${n}`);
  if (WORLD_REGIONS.every((r) => f.regions.has(r))) out.push('world-reader');
  if (f.reviews >= 100) out.push('cards-100');
  if (f.reviews >= 1000) out.push('cards-1000');
  if (f.mastered >= 50) out.push('mastered-50');
  if (f.streak >= 7) out.push('streak-7');
  if (f.streak >= 30) out.push('streak-30');
  if ((s.games['which-came-first']?.best ?? 0) >= 10) out.push('time-keeper');
  if ((s.games['fallacy-detective']?.best ?? 0) >= 9) out.push('fallacy-detective');
  return out;
}

/** A badge seal: a scalloped rosette with a ring and a glyph, as an SVG string. */
export function sealSvg(glyph: string, opts: { color: string; earned: boolean; size?: number }): string {
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? 44 : 49;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  const c = opts.earned ? opts.color : 'var(--rule-strong)';
  const ink = opts.earned ? 'var(--paper)' : 'var(--ink-3)';
  const size = opts.size ?? 72;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" class="seal${opts.earned ? ' is-earned' : ''}">`
    + `<polygon points="${pts.join(' ')}" fill="${opts.earned ? c : 'none'}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="50" cy="50" r="35" fill="none" stroke="${opts.earned ? ink : c}" stroke-width="1.5" stroke-dasharray="${opts.earned ? '0' : '3 3'}" opacity=".7"/>`
    + `<g transform="translate(26 26) scale(2)" fill="none" stroke="${opts.earned ? ink : c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

// Spaced repetition (v2 Phase 2.1) with FSRS (the ts-fsrs library, MIT). Cards are stored in
// the reader state in a compact form (StoredCard); this module converts and schedules them.
// Card ids are "{chapter}-{card number}", e.g. "003-11".
import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { StoredCard } from './reader-state.ts';

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;
export type Rate = 1 | 2 | 3 | 4;

/** Days of stability after which a card counts as "mastered" on the stats page. */
export const MASTERED_DAYS = 21;

export function scheduler(fuzz = true) {
  return fsrs({ enable_fuzz: fuzz, request_retention: 0.9, maximum_interval: 3650 });
}
let f = scheduler();

export const toCard = (x: StoredCard | undefined, now = new Date()): Card => x
  ? { due: new Date(x.d), stability: x.s, difficulty: x.df, scheduled_days: x.sd, reps: x.r, lapses: x.l,
      learning_steps: x.ls, state: x.st as State, last_review: x.lr ? new Date(x.lr) : undefined } as Card
  : createEmptyCard(now);

export const fromCard = (c: Card): StoredCard => ({
  d: c.due.getTime(), s: round(c.stability), df: round(c.difficulty), sd: c.scheduled_days, r: c.reps, l: c.lapses,
  ls: c.learning_steps ?? 0, st: c.state, lr: c.last_review ? new Date(c.last_review).getTime() : null,
});
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Apply a rating; returns the card's new stored state. */
export function rate(x: StoredCard | undefined, rating: Rate, now = new Date()): StoredCard {
  return fromCard(f.next(toCard(x, now), now, rating as Grade).card);
}

/** When each rating would bring the card back (ms timestamps), for the button hints. */
export function previewDue(x: StoredCard | undefined, now = new Date()): Record<Rate, number> {
  const r = f.repeat(toCard(x, now), now);
  return { 1: r[Rating.Again].card.due.getTime(), 2: r[Rating.Hard].card.due.getTime(),
    3: r[Rating.Good].card.due.getTime(), 4: r[Rating.Easy].card.due.getTime() };
}

/** Due by the end of the reader's day. */
export function isDue(x: StoredCard, now = new Date()): boolean {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return x.d <= end.getTime();
}

export const isMastered = (x: StoredCard) => x.st === State.Review && x.s >= MASTERED_DAYS;

/** "<1 min", "10 min", "1 d", "3 mo" … in the given language. */
export function interval(ms: number, lang: 'en' | 'bg'): string {
  const m = ms / 60000, h = m / 60, d = h / 24;
  const u = lang === 'bg' ? { min: 'мин', h: 'ч', d: 'д', mo: 'мес', y: 'г' } : { min: 'min', h: 'h', d: 'd', mo: 'mo', y: 'y' };
  if (m < 1) return `<1 ${u.min}`;
  if (m < 60) return `${Math.round(m)} ${u.min}`;
  if (h < 24) return `${Math.round(h)} ${u.h}`;
  if (d < 31) return `${Math.round(d)} ${u.d}`;
  if (d < 365) return `${Math.round(d / 30)} ${u.mo}`;
  return `${(d / 365).toFixed(1).replace('.0', '')} ${u.y}`;
}

/** Tests only: deterministic scheduling. */
export function _setFuzz(on: boolean) { f = scheduler(on); }

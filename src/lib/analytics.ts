// Feature-use counts for GoatCounter (no cookies, nothing personal). Each call records one
// "event" that appears in the GoatCounter dashboard under its name, e.g. "flashcards-start".
// If GoatCounter isn't loaded (local preview, blocked by an ad blocker, or turned off in
// src/config/features.ts), nothing happens.
import { features } from '../config/features';

export type TrackedEvent =
  | 'flashcards-start'
  | 'review-start'
  | 'game-play'
  | 'map-open'
  | 'atlas-open'
  | 'listen-start'
  | 'progress-export'
  | 'progress-import';

declare global {
  interface Window { goatcounter?: { count?: (o: { path: string; title?: string; event?: boolean }) => void } }
}

const sent = new Set<string>();

/** Record that a feature was used. `detail` (e.g. a chapter or game name) is optional. Once per page view. */
export function track(event: TrackedEvent, detail?: string) {
  if (!features.analyticsEvents) return;
  const path = detail ? `${event}/${detail}` : event;
  if (sent.has(path)) return;
  sent.add(path);
  try {
    window.goatcounter?.count?.({ path, title: document.documentElement.lang, event: true });
  } catch { /* never let counting break the page */ }
}

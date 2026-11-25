// Everything the site remembers about a reader lives in their own browser, and every
// feature reads and writes it through this module only. Nothing is ever sent anywhere.
//
// Two storage keys:
//   kk-state     progress, last position, bookmarks, flashcards, explored places, badges
//   kk-settings  theme, palette, text size, motion, listen voice and speed (small, because
//                the page <head> reads it before first paint to avoid a theme flash)
//
// Paths are language-neutral ("/001-how-to-know-what-is-true/…/"), so English and
// Bulgarian share one reading history. This file has no DOM code, so it can be tested in
// Node; src/scripts/reader.ts connects it to the browser's localStorage.

export const SCHEMA_VERSION = 1;
export const STATE_KEY = 'kk-state';
export const SETTINGS_KEY = 'kk-settings';
const APP = 'knowledge-kingdom';

type Lang = 'en' | 'bg';
export type Titles = Partial<Record<Lang, string>>;

/** Spaced-repetition state of one card (compact form of a ts-fsrs Card; times in ms). */
export type StoredCard = { d: number; s: number; df: number; sd: number; r: number; l: number; ls: number; st: number; lr: number | null };
export type DayActivity = { s?: number; r?: number; n?: number; g?: number };

/** Per-chapter flashcard piles (the original flashcards, kept until spaced review replaces them). */
export type DeckPiles = { order: number[]; known: number[]; review: number[]; idx: number; mode: 'all' | 'review' };

export type ReaderState = {
  v: number;
  /** path → unix seconds when it was marked read */
  read: Record<string, number>;
  /** the last section opened, with how far down it was scrolled (0–1) */
  last: { path: string; scroll: number; at: number; titles: Titles } | null;
  bookmarks: Record<string, { at: number; titles: Titles }>;
  /** chapter label → flashcard piles */
  decks: Record<string, DeckPiles>;
  /** card id → spaced-repetition scheduling data (Phase 2) */
  srs: Record<string, StoredCard>;
  /** daily review: which chapters (null = the ones the reader has started) and new cards per day */
  review: { chapters: string[] | null; newPerDay: number };
  /** what the reader did each day ("2026-11-25"): sections read, cards reviewed, new cards, games */
  activity: Record<string, DayActivity>;
  /** game id → times played and best score */
  games: Record<string, { played: number; best: number }>;
  /** map region / place id → unix seconds first explored */
  explored: Record<string, number>;
  /** badge id → unix seconds earned */
  badges: Record<string, number>;
};

export type Settings = {
  theme?: 'light' | 'dark';
  palette?: string;
  /** text size multiplier, 0.85–1.4 */
  fontScale?: number;
  motion?: 'auto' | 'reduce';
  voice?: Partial<Record<Lang, string>>;
  rate?: number;
  /** listen mode: carry on with the next section when one ends */
  autoNext?: boolean;
};

/** Minimal storage interface (localStorage fits it; tests use a Map). */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const emptyState = (): ReaderState => ({
  v: SCHEMA_VERSION, read: {}, last: null, bookmarks: {}, decks: {}, srs: {}, explored: {}, badges: {},
  review: { chapters: null, newPerDay: 20 }, activity: {}, games: {},
});

// ---- validation helpers (imported files and old data are never trusted) --------------
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isPath = (p: unknown): p is string => typeof p === 'string' && /^\/[^\s<>"]{0,300}$/.test(p);
const num = (x: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER) =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
const ids = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n)) : []);
function titles(x: unknown): Titles {
  const out: Titles = {};
  if (isObj(x)) for (const l of ['en', 'bg'] as const) if (typeof x[l] === 'string') out[l] = (x[l] as string).slice(0, 300);
  return out;
}
function timeMap(x: unknown, keyOk: (k: string) => boolean = () => true): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) { const n = num(v); if (n !== null && keyOk(k)) out[k] = n; }
  return out;
}

/** Follow page moves (old → new address), including chains. */
export function follow(path: string, moved: Record<string, string>): string {
  let p = path;
  for (let i = 0; i < 10 && moved[p]; i++) p = moved[p];
  return p;
}

/** Turn anything stored or imported into a valid current-version state. */
export function migrate(raw: unknown, moved: Record<string, string> = {}): ReaderState {
  const s = emptyState();
  if (!isObj(raw)) return s;
  // (Future schema versions add their upgrade steps here, oldest first.)
  const mv = (p: string) => follow(p, moved);

  for (const [p, t] of Object.entries(timeMap(raw.read, isPath))) s.read[mv(p)] = Math.max(t, s.read[mv(p)] ?? 0);
  if (isObj(raw.last) && isPath(raw.last.path)) {
    s.last = { path: mv(raw.last.path), scroll: num(raw.last.scroll, 0, 1) ?? 0,
      at: num(raw.last.at) ?? 0, titles: titles(raw.last.titles) };
  }
  if (isObj(raw.bookmarks)) {
    for (const [p, b] of Object.entries(raw.bookmarks)) {
      if (isPath(p) && isObj(b)) s.bookmarks[mv(p)] = { at: num(b.at) ?? 0, titles: titles(b.titles) };
    }
  }
  if (isObj(raw.decks)) {
    for (const [ch, d] of Object.entries(raw.decks)) {
      if (/^\d{3}$/.test(ch) && isObj(d) && Array.isArray(d.order)) {
        s.decks[ch] = { order: ids(d.order), known: ids(d.known), review: ids(d.review),
          idx: num(d.idx, 0, 1e6) ?? 0, mode: d.mode === 'review' ? 'review' : 'all' };
      }
    }
  }
  if (isObj(raw.srs)) {
    for (const [id, c] of Object.entries(raw.srs)) {
      if (!/^\d{3}-\d+$/.test(id) || !isObj(c)) continue;
      const n = (k: string) => num(c[k], 0, 1e15);
      if (n('d') === null || n('s') === null || n('df') === null) continue;
      s.srs[id] = { d: n('d')!, s: n('s')!, df: n('df')!, sd: n('sd') ?? 0, r: n('r') ?? 0, l: n('l') ?? 0, ls: n('ls') ?? 0,
        st: n('st') ?? 0, lr: n('lr') };
    }
  }
  if (isObj(raw.review)) {
    const ch = raw.review.chapters;
    s.review = { chapters: Array.isArray(ch) ? ch.filter((x): x is string => typeof x === 'string' && /^\d{3}$/.test(x)) : null,
      newPerDay: num(raw.review.newPerDay, 0, 200) ?? 20 };
  }
  if (isObj(raw.activity)) {
    for (const [day, a] of Object.entries(raw.activity)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isObj(a)) continue;
      const out: DayActivity = {};
      for (const k of ['s', 'r', 'n', 'g'] as const) { const v = num(a[k], 0, 1e6); if (v) out[k] = v; }
      if (Object.keys(out).length) s.activity[day] = out;
    }
  }
  if (isObj(raw.games)) {
    for (const [g, v] of Object.entries(raw.games)) {
      if (/^[a-z-]{1,40}$/.test(g) && isObj(v)) s.games[g] = { played: num(v.played, 0, 1e6) ?? 0, best: num(v.best, 0, 1e6) ?? 0 };
    }
  }
  s.explored = timeMap(raw.explored);
  s.badges = timeMap(raw.badges);
  return s;
}

export function cleanSettings(raw: unknown): Settings {
  const out: Settings = {};
  if (!isObj(raw)) return out;
  if (raw.theme === 'light' || raw.theme === 'dark') out.theme = raw.theme;
  if (typeof raw.palette === 'string' && /^[a-z]{1,20}$/.test(raw.palette)) out.palette = raw.palette;
  const fs = num(raw.fontScale, 0.85, 1.4); if (fs !== null) out.fontScale = fs;
  if (raw.motion === 'auto' || raw.motion === 'reduce') out.motion = raw.motion;
  const voice = titles(raw.voice); if (Object.keys(voice).length) out.voice = voice;
  const rate = num(raw.rate, 0.5, 2); if (rate !== null) out.rate = rate;
  if (typeof raw.autoNext === 'boolean') out.autoNext = raw.autoNext;
  return out;
}

function mergeActivity(a: Record<string, DayActivity>, b: Record<string, DayActivity>) {
  const out: Record<string, DayActivity> = { ...a };
  for (const [day, x] of Object.entries(b)) {
    const y = out[day] ?? {};
    out[day] = { ...(Math.max(y.s ?? 0, x.s ?? 0) ? { s: Math.max(y.s ?? 0, x.s ?? 0) } : {}),
      ...(Math.max(y.r ?? 0, x.r ?? 0) ? { r: Math.max(y.r ?? 0, x.r ?? 0) } : {}),
      ...(Math.max(y.n ?? 0, x.n ?? 0) ? { n: Math.max(y.n ?? 0, x.n ?? 0) } : {}),
      ...(Math.max(y.g ?? 0, x.g ?? 0) ? { g: Math.max(y.g ?? 0, x.g ?? 0) } : {}) };
  }
  return out;
}
function mergeGames(a: ReaderState['games'], b: ReaderState['games']) {
  const out = { ...a };
  for (const [g, x] of Object.entries(b)) out[g] = { played: Math.max(out[g]?.played ?? 0, x.played), best: Math.max(out[g]?.best ?? 0, x.best) };
  return out;
}

// ---- days and streaks --------------------------------------------------------------------
/** The reader's local calendar day, "2026-11-25". */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Count something the reader did today. */
export function bump(s: ReaderState, kind: keyof DayActivity, by = 1, now = new Date()) {
  const k = dayKey(now);
  const a = (s.activity[k] ??= {});
  a[kind] = (a[kind] ?? 0) + by;
}
/** Days in a row with any activity, ending today (or yesterday, if nothing yet today). */
export function streak(activity: Record<string, DayActivity>, now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (activity[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---- data kept by older versions of the site ------------------------------------------
/** Gather pre-v2 keys (kk-read, kk-last, kk-fc-NNN, kk-theme, kk-palette) into the new shape. */
function fromLegacy(kv: KV, keys: string[]): { state: unknown; settings: unknown; legacyKeys: string[] } | null {
  const get = (k: string) => { try { return JSON.parse(kv.getItem(k) ?? 'null'); } catch { return kv.getItem(k); } };
  const deckKeys = keys.filter((k) => /^kk-fc-\d{3}$/.test(k));
  const legacyKeys = ['kk-read', 'kk-last', 'kk-theme', 'kk-palette', ...deckKeys].filter((k) => kv.getItem(k) !== null);
  if (!legacyKeys.length) return null;
  const last = get('kk-last');
  const decks: Record<string, unknown> = {};
  for (const k of deckKeys) decks[k.slice(6)] = get(k);
  return {
    state: { read: get('kk-read'), decks,
      last: isObj(last) ? { path: last.path, scroll: 0, at: 0, titles: last.titles } : null },
    settings: { theme: kv.getItem('kk-theme'), palette: kv.getItem('kk-palette') },
    legacyKeys,
  };
}

// ---- the store -------------------------------------------------------------------------
export type Store = ReturnType<typeof createStore>;
type Listener = () => void;

/**
 * kv is null when the browser blocks storage: everything still works for the current
 * page, it just isn't remembered.
 */
export function createStore(kv: KV | null, opts: { moved?: Record<string, string>; keys?: () => string[] } = {}) {
  const moved = opts.moved ?? {};
  const listeners = new Set<Listener>();
  let state = emptyState();
  let settings: Settings = {};

  const readKey = (k: string): unknown => {
    if (!kv) return null;
    try { return JSON.parse(kv.getItem(k) ?? 'null'); } catch { return null; }
  };
  const writeKey = (k: string, v: unknown) => {
    if (!kv) return;
    try { kv.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: keep going in memory */ }
  };

  function load() {
    const raw = readKey(STATE_KEY);
    const rawSettings = readKey(SETTINGS_KEY);
    if (raw === null && kv) {
      let legacy: ReturnType<typeof fromLegacy> = null;
      try { legacy = fromLegacy(kv, opts.keys?.() ?? []); } catch { /* ignore */ }
      if (legacy) {
        state = migrate(legacy.state, moved);
        settings = cleanSettings({ ...(legacy.settings as object), ...(isObj(rawSettings) ? rawSettings : {}) });
        writeKey(STATE_KEY, state);
        writeKey(SETTINGS_KEY, settings);
        for (const k of legacy.legacyKeys) { try { kv.removeItem(k); } catch { /* ignore */ } }
        return;
      }
    }
    const before = JSON.stringify(raw);
    state = migrate(raw, moved);
    settings = cleanSettings(rawSettings);
    // Persist upgrades (renamed pages, newer schema) once, so they don't repeat every load.
    if (raw !== null && JSON.stringify(state) !== before) writeKey(STATE_KEY, state);
  }
  load();

  const emit = () => listeners.forEach((f) => { try { f(); } catch { /* one bad listener can't break others */ } });

  return {
    get state(): Readonly<ReaderState> { return state; },
    get settings(): Readonly<Settings> { return settings; },

    /** Change the state. Re-reads storage first, so another open tab's changes aren't lost. */
    update(fn: (s: ReaderState) => void) {
      const fresh = readKey(STATE_KEY);
      if (fresh !== null) state = migrate(fresh, moved);
      fn(state);
      writeKey(STATE_KEY, state);
      emit();
    },
    setSettings(patch: Partial<Settings>) {
      settings = cleanSettings({ ...cleanSettings(readKey(SETTINGS_KEY) ?? settings), ...patch });
      writeKey(SETTINGS_KEY, settings);
      emit();
    },
    subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Another tab changed storage. */
    reload() { load(); emit(); },

    // -- convenience for the common cases --
    isRead: (path: string) => Boolean(state.read[path]),
    readCount: () => Object.keys(state.read).length,

    /** Download format: one JSON file with everything. */
    exportJson(now = Date.now()): string {
      return JSON.stringify({ app: APP, schema: SCHEMA_VERSION, exported: new Date(now).toISOString(), state, settings }, null, 2);
    },
    /**
     * Load a file made by exportJson. "merge" keeps the most recent of both (read marks,
     * badges, bookmarks are combined); "replace" swaps everything.
     */
    importJson(text: string, mode: 'merge' | 'replace' = 'merge'): { ok: true; read: number } | { ok: false; error: 'format' | 'newer' } {
      let data: unknown;
      try { data = JSON.parse(text); } catch { return { ok: false, error: 'format' }; }
      if (!isObj(data) || data.app !== APP || !isObj(data.state)) return { ok: false, error: 'format' };
      if (typeof data.schema === 'number' && data.schema > SCHEMA_VERSION) return { ok: false, error: 'newer' };
      const incoming = migrate(data.state, moved);
      const inSettings = cleanSettings(data.settings);
      if (mode === 'replace') {
        state = incoming;
        settings = inSettings;
      } else {
        const cur = migrate(readKey(STATE_KEY) ?? state, moved);
        const later = <T extends { at: number }>(a: T | null | undefined, b: T | null | undefined) =>
          !a ? b ?? null : !b ? a : b.at > a.at ? b : a;
        const maxMap = (a: Record<string, number>, b: Record<string, number>) => {
          const out = { ...a };
          for (const [k, v] of Object.entries(b)) out[k] = Math.max(v, out[k] ?? 0);
          return out;
        };
        const bookmarks = { ...cur.bookmarks };
        for (const [k, b] of Object.entries(incoming.bookmarks)) bookmarks[k] = later(bookmarks[k], b)!;
        state = {
          v: SCHEMA_VERSION,
          read: maxMap(cur.read, incoming.read),
          last: later(cur.last, incoming.last),
          bookmarks,
          decks: { ...incoming.decks, ...cur.decks },
          srs: { ...incoming.srs, ...cur.srs },
          review: cur.review,
          activity: mergeActivity(cur.activity, incoming.activity),
          games: mergeGames(cur.games, incoming.games),
          explored: maxMap(cur.explored, incoming.explored),
          badges: maxMap(cur.badges, incoming.badges),
        };
        settings = { ...inSettings, ...cleanSettings(readKey(SETTINGS_KEY) ?? settings) };
      }
      writeKey(STATE_KEY, state);
      writeKey(SETTINGS_KEY, settings);
      emit();
      return { ok: true, read: Object.keys(state.read).length };
    },
    /**
     * Forget reading progress (read marks and the last position). With `everything`,
     * also bookmarks, flashcards, explored places and badges. Settings are always kept.
     */
    reset(everything = false) {
      const fresh = readKey(STATE_KEY);
      if (fresh !== null) state = migrate(fresh, moved);
      state = everything ? emptyState() : { ...state, read: {}, last: null };
      writeKey(STATE_KEY, state);
      emit();
    },
  };
}

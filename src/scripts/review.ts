// The daily review (v2 Phase 2.1). Cards come from /cards/{lang}/{chapter}.json for the chapters
// in the reader's review; scheduling is FSRS (src/lib/srs.ts); everything is stored through the
// reader-state store, so it travels with "Save progress file".
import { store } from './reader';
import { bump, dayKey, streak } from '../lib/reader-state';
import { rate, previewDue, isDue, isMastered, interval, type Rate } from '../lib/srs';
import { track } from '../lib/analytics';

type Card = { id: string; front: string; back: string };
type Ch = { label: string; title: string; path: string; count: number };

const root = document.querySelector<HTMLElement>('[data-review]')!;
const lang = root.dataset.lang === 'bg' ? 'bg' : 'en';
const chapters: Ch[] = JSON.parse(root.dataset.chapters || '[]');
const S: Record<string, string> = JSON.parse(root.dataset.strings || '{}');
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const byLabel = new Map(chapters.map((c) => [c.label, c]));

/** Chapters the reader has started: read a section, sorted flashcards, or reviewed a card. */
function started(): string[] {
  const s = store.state;
  const set = new Set<string>();
  for (const p of Object.keys(s.read)) { const c = chapters.find((x) => p.startsWith(x.path)); if (c) set.add(c.label); }
  for (const k of Object.keys(s.decks)) set.add(k);
  for (const id of Object.keys(s.srs)) set.add(id.slice(0, 3));
  return chapters.map((c) => c.label).filter((l) => set.has(l));
}
const reviewChapters = () => store.state.review.chapters ?? started();

const cache = new Map<string, Promise<Card[]>>();
const load = (label: string) => {
  if (!cache.has(label)) {
    cache.set(label, fetch(`/cards/${lang}/${label}.json`).then((r) => (r.ok ? r.json() : { cards: [] })).then((d) => d.cards as Card[]).catch(() => []));
  }
  return cache.get(label)!;
};

let queue: Card[] = [];
let newIds = new Set<string>();
async function buildQueue() {
  const now = new Date();
  const labels = reviewChapters();
  const all = (await Promise.all(labels.map(load))).flat();
  const srs = store.state.srs;
  const due = all.filter((c) => srs[c.id] && isDue(srs[c.id], now)).sort((a, b) => srs[a.id].d - srs[b.id].d);
  const newToday = store.state.activity[dayKey(now)]?.n ?? 0;
  const room = Math.max(0, store.state.review.newPerDay - newToday);
  const fresh = all.filter((c) => !srs[c.id]).slice(0, room);
  newIds = new Set(fresh.map((c) => c.id));
  // Mix new cards in after the first few reviews so a session doesn't start with unknowns only.
  queue = [...due.slice(0, 3), ...interleave(due.slice(3), fresh)];
  return { due: due.length, fresh: fresh.length, labels };
}
const interleave = (a: Card[], b: Card[]) => {
  const out: Card[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
};

// ---- summary and stats -------------------------------------------------------------------
async function renderSummary() {
  const { due, fresh, labels } = await buildQueue();
  $('[data-summary]').hidden = false;
  $('[data-due-text]').textContent = fill(S.due, { n: due });
  $('[data-new-text]').textContent = fresh ? `+ ${fill(S.new, { n: fresh })}` : '';
  $('[data-summary-note]').textContent = !labels.length ? S.empty : due + fresh === 0 ? S.none : '';
  $<HTMLButtonElement>('[data-start]').hidden = due + fresh === 0;
  renderStats();
}

function renderStats() {
  const s = store.state;
  const today = s.activity[dayKey()]?.r ?? 0;
  const total = Object.values(s.activity).reduce((n, a) => n + (a.r ?? 0), 0);
  $('[data-stat="streak"]').textContent = String(streak(s.activity));
  $('[data-stat="today"]').textContent = String(today);
  $('[data-stat="total"]').textContent = String(total);
  const per: Record<string, number> = {};
  for (const [id, c] of Object.entries(s.srs)) if (isMastered(c)) per[id.slice(0, 3)] = (per[id.slice(0, 3)] ?? 0) + 1;
  const ul = $('[data-mastery]');
  ul.replaceChildren(...reviewChapters().map((l) => {
    const c = byLabel.get(l)!;
    const n = per[l] ?? 0;
    const li = document.createElement('li');
    li.innerHTML = `<span class="m-name"></span><span class="m-bar"><span style="transform:scaleX(${c.count ? n / c.count : 0})"></span></span><span class="m-n"></span>`;
    li.querySelector('.m-name')!.textContent = `${c.label} · ${c.title}`;
    li.querySelector('.m-n')!.textContent = fill(S.masteredOf, { n, total: c.count });
    return li;
  }));
}

// ---- settings ---------------------------------------------------------------------------------
const modes = [...root.querySelectorAll<HTMLInputElement>('[data-mode]')];
const picks = [...root.querySelectorAll<HTMLInputElement>('[data-pick]')];
const perDay = $<HTMLSelectElement>('[data-new-per-day]');
function renderSettings() {
  const r = store.state.review;
  const auto = r.chapters === null;
  modes.forEach((m) => { m.checked = (m.value === 'auto') === auto; });
  const on = new Set(reviewChapters());
  picks.forEach((p) => { p.checked = on.has(p.value); p.disabled = auto; });
  perDay.value = String(r.newPerDay);
}
modes.forEach((m) => m.addEventListener('change', () => {
  store.update((s) => { s.review.chapters = m.value === 'auto' ? null : started(); });
  renderSettings(); renderSummary();
}));
picks.forEach((p) => p.addEventListener('change', () => {
  store.update((s) => { s.review.chapters = picks.filter((x) => x.checked).map((x) => x.value); });
  renderSummary();
}));
perDay.addEventListener('change', () => { store.update((s) => { s.review.newPerDay = Number(perDay.value); }); renderSummary(); });

// ---- the session ---------------------------------------------------------------------------------
let current: Card | null = null, revealed = false, reviewed = 0;
const card = $('[data-card]'), front = $('[data-front]'), back = $('[data-back]');
const showBtn = $<HTMLButtonElement>('[data-show]'), rateBox = $('[data-rate]');

function next() {
  current = queue.shift() ?? null;
  revealed = false;
  if (!current) {
    $('[data-session]').hidden = true;
    renderSummary().then(() => { $('[data-summary-note]').textContent = fill(S.done, { n: reviewed }); });
    return;
  }
  $('[data-left]').textContent = fill(S.left, { n: queue.length + 1 });
  $('[data-tag]').hidden = !newIds.has(current.id);
  const c = byLabel.get(current.id.slice(0, 3));
  $('[data-chapter-name]').textContent = c ? `· ${c.label} ${c.title}` : '';
  front.innerHTML = current.front;
  back.innerHTML = current.back;
  back.hidden = true;
  rateBox.hidden = true;
  showBtn.hidden = false;
  card.classList.remove('is-revealed');
  card.focus({ preventScroll: true });
}
function reveal() {
  if (!current || revealed) return;
  revealed = true;
  back.hidden = false;
  card.classList.add('is-revealed');
  showBtn.hidden = true;
  rateBox.hidden = false;
  const p = previewDue(store.state.srs[current.id]);
  const now = Date.now();
  for (const r of [1, 2, 3, 4] as Rate[]) rateBox.querySelector(`[data-hint="${r}"]`)!.textContent = interval(p[r] - now, lang);
}
function answer(r: Rate) {
  if (!current || !revealed) return;
  const id = current.id, isNew = !store.state.srs[id];
  const nextState = rate(store.state.srs[id], r);
  store.update((s) => { s.srs[id] = nextState; bump(s, 'r'); if (isNew) bump(s, 'n'); });
  reviewed++;
  // Cards due again within this sitting (e.g. "Again") come back at the end of the queue.
  if (nextState.d - Date.now() < 20 * 60e3) queue.push(current);
  next();
}

$('[data-start]').addEventListener('click', () => {
  $('[data-summary]').hidden = true;
  $('[data-session]').hidden = false;
  reviewed = 0;
  track('review-start');
  next();
});
showBtn.addEventListener('click', reveal);
card.addEventListener('click', () => { if (swiped) { swiped = false; return; } reveal(); });
rateBox.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rating]');
  if (b) answer(Number(b.dataset.rating) as Rate);
});
document.addEventListener('keydown', (e) => {
  if ($('[data-session]').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) return;
  if ((e.key === ' ' || e.key === 'Enter') && !revealed) { e.preventDefault(); reveal(); }
  else if (/^[1-4]$/.test(e.key) && revealed) answer(Number(e.key) as Rate);
});
// Swipe: left Again, down Hard, right Good, up Easy (after the answer is shown).
let x0 = 0, y0 = 0, tracking = false, swiped = false;
card.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; tracking = true; } });
card.addEventListener('pointerup', (e) => {
  if (!tracking) return;
  tracking = false;
  const dx = e.clientX - x0, dy = e.clientY - y0;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;
  swiped = true;
  if (!revealed) { reveal(); return; }
  answer(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy > 0 ? 2 : 4));
});

renderSettings();
renderSummary();

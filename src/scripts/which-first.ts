// "Which came first?" (v2 Phase 2.2). Fair pairs only: two events are never paired if their
// date ranges overlap, and dates the book gives only roughly ("c. 3100 BCE") count as a range
// around that date. Difficulty grows with the streak: closer dates, and events from different
// regions of the world.
import { store } from './reader';
import { bump } from '../lib/reader-state';
import { track } from '../lib/analytics';

type Ev = { id: string; label: string; date: string; start: number; end: number; precision: string; region: string; url: string; title: string };
const root = document.querySelector<HTMLElement>('[data-wf]');
const events: Ev[] = JSON.parse(root?.dataset.events || '[]');
const S: Record<string, string> = JSON.parse(root?.dataset.strings || '{}');
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** The range an event could really fall in: a "c." date gets a margin of 5% of its age. */
const span = (e: Ev): [number, number] => {
  if (e.precision !== 'approximate') return [e.start, e.end];
  const m = Math.max(20, 0.05 * (2000 - (e.start + e.end) / 2));
  return [e.start - m, e.end + m];
};
const fair = (a: Ev, b: Ev) => { const [a0, a1] = span(a), [b0, b1] = span(b); return a1 < b0 || b1 < a0; };
const age = (e: Ev) => Math.max(1, 2000 - (e.start + e.end) / 2);
/** 0 (easy) … 1 (hard): close dates (on a log scale) and different regions are harder. */
const difficulty = (a: Ev, b: Ev) => {
  const gap = Math.abs(Math.log10(age(a)) - Math.log10(age(b)));
  return (1 - Math.min(gap / 1.5, 1)) * 0.8 + (a.region !== b.region ? 0.2 : 0);
};

if (root && events.length >= 6) {
  const pair = root.querySelector<HTMLElement>('[data-pair]')!;
  const feedback = root.querySelector<HTMLElement>('[data-feedback]')!;
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-next]')!;
  const streakEl = root.querySelector<HTMLElement>('[data-streak]')!;
  const bestEl = root.querySelector<HTMLElement>('[data-best]')!;
  let streak = 0, recent: string[] = [], answered = false, started = false;
  let cur: [Ev, Ev] | null = null;
  const best = () => store.state.games['which-came-first']?.best ?? 0;
  const save = (finalScore: number) => store.update((s) => {
    const g = s.games['which-came-first'] ?? { played: 0, best: 0 };
    s.games['which-came-first'] = { played: g.played + 1, best: Math.max(g.best, finalScore) };
  });

  const pick = (): [Ev, Ev] => {
    const target = Math.min(0.15 + streak * 0.07, 0.95);
    let bestPair: [Ev, Ev] | null = null, bestScore = Infinity;
    const pool = events.filter((e) => !recent.includes(e.id));
    for (let i = 0; i < 250; i++) {
      const a = rnd(pool), b = rnd(pool);
      if (a === b || !fair(a, b)) continue;
      const score = Math.abs(difficulty(a, b) - target) + Math.random() * 0.08;
      if (score < bestScore) { bestScore = score; bestPair = Math.random() < 0.5 ? [a, b] : [b, a]; }
    }
    return bestPair ?? [events[0], events.find((e) => fair(e, events[0]))!];
  };

  const card = (e: Ev, i: number) => `<div class="event-card">
      <button type="button" class="ev-choose" data-choice="${i}"><span class="ev-label">${esc(e.label)}</span>
      <span class="ev-date" hidden>${esc(e.date)}</span></button>
      <a class="ev-read" href="${esc(e.url)}" hidden>${esc(S.read)}: ${esc(e.title)} →</a></div>`;

  const round = () => {
    if (!started) { started = true; store.update((s) => bump(s, 'g')); track('game-play', 'which-came-first'); }
    cur = pick();
    recent = [...recent, cur[0].id, cur[1].id].slice(-6);
    answered = false;
    pair.innerHTML = card(cur[0], 0) + card(cur[1], 1);
    feedback.textContent = '';
    nextBtn.hidden = true;
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best());
    pair.querySelector<HTMLElement>('[data-choice]')?.focus({ preventScroll: true });
  };

  pair.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]');
    if (!btn || answered || !cur) return;
    answered = true;
    const chosen = cur[Number(btn.dataset.choice)], other = cur[1 - Number(btn.dataset.choice)];
    const right = (chosen.start + chosen.end) < (other.start + other.end); // fair pairs never overlap
    pair.querySelectorAll<HTMLElement>('.ev-date, .ev-read').forEach((x) => { x.hidden = false; });
    pair.querySelectorAll<HTMLElement>('.event-card').forEach((c, i) => {
      const earlier = (cur![i].start + cur![i].end) <= (cur![1 - i].start + cur![1 - i].end);
      c.classList.add(earlier ? 'is-earlier' : 'is-later');
      c.querySelector('button')!.setAttribute('aria-disabled', 'true');
    });
    btn.parentElement!.classList.add(right ? 'is-right' : 'is-wrong');
    if (right) {
      streak++;
      feedback.textContent = S.right;
      nextBtn.textContent = S.next;
    } else {
      feedback.textContent = S.wrong;
      save(streak);
      streak = 0;
      nextBtn.textContent = S.again;
    }
    if (right && streak > best()) save(streak);
    streakEl.textContent = String(streak);
    bestEl.textContent = String(best());
    nextBtn.hidden = false;
    nextBtn.focus({ preventScroll: true });
  });
  nextBtn.addEventListener('click', round);
  document.addEventListener('keydown', (e) => {
    if (root.querySelector<HTMLElement>('[data-pane="pairs"]')!.hidden || answered) return;
    if (e.key === '1' || e.key === '2') pair.querySelectorAll<HTMLButtonElement>('[data-choice]')[Number(e.key) - 1]?.click();
  });

  // ---- Five in order ---------------------------------------------------------------------
  const placed = root.querySelector<HTMLOListElement>('[data-placed]')!;
  const poolEl = root.querySelector<HTMLElement>('[data-pool]')!;
  const checkBtn = root.querySelector<HTMLButtonElement>('[data-check]')!;
  const orderFb = root.querySelector<HTMLElement>('[data-order-feedback]')!;
  let set: Ev[] = [], order: string[] = [], checked = false;
  const byId = new Map(events.map((e) => [e.id, e]));

  const newSet = () => {
    for (let tries = 0; tries < 400; tries++) {
      const c: Ev[] = [];
      for (const e of [...events].sort(() => Math.random() - 0.5)) {
        if (c.every((x) => x !== e && fair(x, e))) c.push(e);
        if (c.length === 5) break;
      }
      if (c.length === 5) { set = c; break; }
    }
    order = []; checked = false;
    orderFb.textContent = '';
    renderOrder();
  };
  const item = (e: Ev, where: 'pool' | 'placed') => `<li class="order-item" data-id="${e.id}" ${where === 'placed' ? 'draggable="true"' : ''}>
      <button type="button" class="order-btn">${esc(e.label)}${checked ? `<span class="ev-date">${esc(e.date)}</span>` : ''}</button></li>`;
  const renderOrder = () => {
    placed.innerHTML = order.map((id) => item(byId.get(id)!, 'placed')).join('');
    poolEl.innerHTML = `<ul>${set.filter((e) => !order.includes(e.id)).map((e) => item(e, 'pool')).join('')}</ul>`;
    checkBtn.disabled = order.length < 5 || checked;
  };
  poolEl.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (li && !checked) { order.push(li.dataset.id!); renderOrder(); }
  });
  placed.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (li && !checked) { order = order.filter((x) => x !== li.dataset.id); renderOrder(); }
  });
  // Drag to reorder (mouse / desktop).
  let dragged: string | null = null;
  placed.addEventListener('dragstart', (e) => { dragged = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id ?? null; });
  placed.addEventListener('dragover', (e) => e.preventDefault());
  placed.addEventListener('drop', (e) => {
    e.preventDefault();
    const over = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!dragged || !over || dragged === over || checked) return;
    const from = order.indexOf(dragged), to = order.indexOf(over);
    order.splice(from, 1);
    order.splice(to, 0, dragged);
    renderOrder();
  });
  checkBtn.addEventListener('click', () => {
    checked = true;
    const right = [...set].sort((a, b) => (a.start + a.end) - (b.start + b.end)).map((e) => e.id);
    const n = order.filter((id, i) => right[i] === id).length;
    order = right;
    renderOrder();
    placed.querySelectorAll<HTMLElement>('[data-id]').forEach((li, i) => li.classList.add('is-done'));
    orderFb.textContent = fill(S.orderScore, { n });
    store.update((s) => {
      const g = s.games['five-in-order'] ?? { played: 0, best: 0 };
      s.games['five-in-order'] = { played: g.played + 1, best: Math.max(g.best, n) };
      bump(s, 'g');
    });
  });
  root.querySelector('[data-new-set]')!.addEventListener('click', newSet);

  // ---- modes ---------------------------------------------------------------------------------
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    root.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.mode; });
    if (b.dataset.mode === 'order' && !set.length) newSet();
  }));

  round();
}

// Reading progress, "Continue reading", progress export/import and print helpers. Runs on
// every page. All data goes through the reader-state store (src/lib/reader-state.ts): it
// lives in this browser only and is shared by English and Bulgarian (keys are
// language-neutral paths like "/001-how-to-know-what-is-true/following-a-claim-upstream/").
import { store } from './reader';
import { track } from '../lib/analytics';

const AUTO_MARK_AFTER_MS = 10_000; // scrolling through only counts after 10 s on the page
const READ_AT = 0.8; // share of the text that has been on screen

const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
const plain = (p: string) => p.replace(/^\/bg(?=\/)/, '');
const local = (p: string) => (lang === 'bg' ? `/bg${p}` : p);
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

function chapterOf(path: string) {
  return path.match(/^\/[^/]+\//)?.[0] ?? '';
}

function paint() {
  const read = store.state.read;
  const perChapter: Record<string, number> = {};
  for (const p of Object.keys(read)) {
    const ch = chapterOf(p);
    perChapter[ch] = (perChapter[ch] ?? 0) + 1;
  }
  // Ticks on links to read sections: sidebar, chapter contents, related sections.
  document.querySelectorAll<HTMLAnchorElement>('.sb-sections a, .contents ol a, .related a').forEach((a) => {
    a.classList.toggle('is-read', Boolean(read[plain(new URL(a.href, location.href).pathname)]));
  });
  // Progress rings on chapter cards.
  document.querySelectorAll<HTMLElement>('[data-chapter-progress]').forEach((el) => {
    const total = Number(el.dataset.total) || 0;
    const n = Math.min(perChapter[el.dataset.chapterProgress ?? ''] ?? 0, total);
    el.hidden = n === 0;
    if (!n) return;
    el.querySelector<HTMLElement>('.ring')!.style.setProperty('--p', String(Math.round((n / total) * 100)));
    el.classList.toggle('is-done', n >= total);
    el.querySelector('.txt')!.textContent = fill(el.dataset.label ?? '', { n, total });
  });
  // One bar per Part on the homepage.
  document.querySelectorAll<HTMLElement>('[data-part-progress]').forEach((el) => {
    const total = Number(el.dataset.total) || 0;
    const n = Math.min((el.dataset.partProgress ?? '').split(' ').reduce((s, ch) => s + (perChapter[ch] ?? 0), 0), total);
    el.hidden = n === 0;
    if (!n) return;
    el.querySelector<HTMLElement>('.bar > span')!.style.transform = `scaleX(${total ? n / total : 0})`;
    el.querySelector('.txt')!.textContent = fill(el.dataset.label ?? '', { n, total });
  });
  // Sidebar chapters: a finished chapter gets a tick.
  document.querySelectorAll<HTMLElement>('.sb-chapter[data-chapter-path]').forEach((li) => {
    const total = Number(li.dataset.total) || 0;
    const n = perChapter[li.dataset.chapterPath ?? ''] ?? 0;
    li.classList.toggle('is-done', total > 0 && n >= total);
  });
  // Homepage: overall progress and reset.
  const overall = document.querySelector<HTMLElement>('[data-overall]');
  if (overall) {
    const n = Object.keys(read).length;
    overall.hidden = n === 0;
    overall.querySelector('[data-overall-text]')!.textContent =
      fill(overall.dataset.label ?? '', { n, total: overall.dataset.total ?? '' });
  }
}

// --- Section page: mark as read ------------------------------------------------
const toggle = document.querySelector<HTMLButtonElement>('[data-read-toggle]');
if (toggle) {
  const path = toggle.dataset.path!;
  const label = toggle.querySelector('[data-read-label]')!;
  let userUnmarked = false;
  const render = () => {
    const on = store.isRead(path);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.classList.toggle('is-read', on);
    label.textContent = on ? toggle.dataset.labelDone! : toggle.dataset.labelMark!;
    toggle.title = on ? toggle.dataset.labelUnmark! : '';
  };
  const set = (on: boolean) => store.update((s) => {
    if (on) s.read[path] = Math.floor(Date.now() / 1000);
    else delete s.read[path];
  });
  store.subscribe(render);
  toggle.hidden = false;
  document.querySelector<HTMLElement>('[data-read-hint]')?.removeAttribute('hidden');
  render();
  toggle.addEventListener('click', () => {
    const on = !store.isRead(path);
    if (!on) userUnmarked = true;
    set(on);
  });

  // Having seen ~80% of the text marks the section as read, but only after 10 s on the page
  // (so skimming past doesn't count), and never after the reader unmarked it.
  const opened = performance.now();
  const prose = document.querySelector<HTMLElement>('article .prose');
  const seenShare = () => {
    if (!prose) return 1;
    const r = prose.getBoundingClientRect();
    return r.height > 0 ? (innerHeight - r.top) / r.height : 1;
  };
  let waiting = 0;
  const maybeMark = () => {
    if (userUnmarked || store.isRead(path) || seenShare() < READ_AT) return;
    const wait = AUTO_MARK_AFTER_MS - (performance.now() - opened);
    if (wait <= 0) set(true);
    else if (!waiting) waiting = window.setTimeout(() => { waiting = 0; maybeMark(); }, wait);
  };
  addEventListener('scroll', maybeMark, { passive: true });
  maybeMark();

  // Remember the last section and how far down it was read, for "Continue reading"
  // (titles kept per language). Saved when the reader pauses scrolling or leaves.
  const scrolled = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  // Arriving from "Continue reading" (#continue): go back to where the reader stopped.
  if (location.hash === '#continue') {
    const last = store.state.last;
    history.replaceState(history.state, '', location.pathname + location.search);
    if (last?.path === path && last.scroll > 0.02) {
      const go = () => scrollTo({ top: last.scroll * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
      go();
      addEventListener('load', go, { once: true }); // again once images have their final size
    }
  }
  const remember = () => store.update((s) => {
    const titles = s.last?.path === path ? s.last.titles : {};
    s.last = { path, scroll: Math.round(scrolled() * 1000) / 1000, at: Math.floor(Date.now() / 1000),
      titles: { ...titles, [lang]: toggle.dataset.title ?? '' } };
  });
  remember();
  let timer = 0;
  addEventListener('scroll', () => { clearTimeout(timer); timer = window.setTimeout(remember, 800); }, { passive: true });
  addEventListener('pagehide', remember);
}

// --- Bookmarks --------------------------------------------------------------------
const mark = document.querySelector<HTMLButtonElement>('[data-bookmark]');
if (mark) {
  const path = mark.dataset.path!.replace(/^\/bg(?=\/)/, '');
  const label = mark.querySelector('[data-bookmark-label]')!;
  const render = () => {
    const on = Boolean(store.state.bookmarks[path]);
    mark.setAttribute('aria-pressed', String(on));
    label.textContent = on ? mark.dataset.labelOn! : mark.dataset.labelAdd!;
  };
  mark.hidden = false;
  render();
  store.subscribe(render);
  mark.addEventListener('click', () => store.update((s) => {
    if (s.bookmarks[path]) delete s.bookmarks[path];
    else s.bookmarks[path] = { at: Math.floor(Date.now() / 1000), titles: { [lang]: mark.dataset.title ?? '' } };
  }));
}

const list = document.querySelector<HTMLElement>('[data-bookmarks]');
if (list) {
  const tpl = list.querySelector<HTMLTemplateElement>('template')!;
  const ul = list.querySelector('ul')!;
  const empty = list.querySelector<HTMLElement>('[data-bookmarks-empty]')!;
  const date = new Intl.DateTimeFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const render = () => {
    const items = Object.entries(store.state.bookmarks).sort((a, b) => b[1].at - a[1].at);
    ul.replaceChildren(...items.map(([path, b]) => {
      const li = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const a = li.querySelector('a')!;
      a.href = local(path);
      a.textContent = b.titles[lang] || Object.values(b.titles)[0] || path;
      li.querySelector('[data-when]')!.textContent = b.at ? date.format(new Date(b.at * 1000)) : '';
      li.querySelector('button')!.addEventListener('click', () => store.update((s) => { delete s.bookmarks[path]; }));
      return li;
    }));
    empty.hidden = items.length > 0;
  };
  render();
  store.subscribe(render);
}

// --- Homepage: continue reading, reset, export / import ----------------------------
const cont = document.querySelector<HTMLAnchorElement>('[data-continue]');
const showContinue = () => {
  if (!cont) return;
  const last = store.state.last;
  cont.hidden = !last?.path;
  document.querySelector('[data-start]')?.classList.toggle('btn-primary', !last?.path);
  if (!last?.path) return;
  cont.href = local(last.path) + '#continue';
  const title = last.titles?.[lang] || Object.values(last.titles ?? {})[0] || '';
  cont.querySelector('[data-continue-title]')!.textContent = title;
};
showContinue();
store.subscribe(showContinue);

document.querySelector<HTMLButtonElement>('[data-progress-reset]')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  if (!confirm(btn.dataset.confirm ?? '')) return;
  store.reset();
});

const transfer = document.querySelector<HTMLElement>('[data-transfer]');
if (transfer) {
  const status = transfer.querySelector<HTMLElement>('[data-transfer-status]')!;
  const say = (msg: string) => { status.textContent = msg; };
  transfer.hidden = false;
  transfer.querySelector('[data-export]')!.addEventListener('click', () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `knowledge-kingdom-progress-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(transfer.dataset.exported ?? '');
    track('progress-export');
  });
  const file = transfer.querySelector<HTMLInputElement>('[data-import-file]')!;
  transfer.querySelector('[data-import]')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const res = f.size > 5_000_000 ? { ok: false as const, error: 'format' as const } : store.importJson(await f.text(), 'merge');
    if (res.ok) {
      say(fill(transfer.dataset.imported ?? '', { n: res.read }));
      track('progress-import');
    } else {
      say((res.error === 'newer' ? transfer.dataset.errorNewer : transfer.dataset.errorFormat) ?? '');
    }
  });
}

// --- Printing ---------------------------------------------------------------------
// Open every collapsed answer and contents box for the printout, then restore them.
let reopened: HTMLDetailsElement[] = [];
addEventListener('beforeprint', () => {
  reopened = [...document.querySelectorAll<HTMLDetailsElement>('main details:not([open])')];
  reopened.forEach((d) => (d.open = true));
});
addEventListener('afterprint', () => {
  reopened.forEach((d) => (d.open = false));
  reopened = [];
});
document.querySelectorAll<HTMLButtonElement>('[data-print]').forEach((b) => {
  b.hidden = false;
  b.addEventListener('click', () => print());
});

// Repaint whenever progress changes (here, or in another tab).
store.subscribe(paint);
paint();

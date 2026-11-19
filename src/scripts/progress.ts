// Reading progress, "Continue reading" and print helpers. Runs on every page.
// Progress lives in this browser only (localStorage), shared by English and Bulgarian:
// keys are language-neutral paths like "/001-how-to-know-what-is-true/following-a-claim-upstream/".
// Every storage access is wrapped: in private windows or with storage blocked, the site
// simply works without progress.

const READ_KEY = 'kk-read';
const LAST_KEY = 'kk-last';
const AUTO_MARK_AFTER_MS = 10_000; // reaching the end only counts after 10 s on the page

type Last = { path: string; titles: Record<string, string> };

const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
const plain = (p: string) => p.replace(/^\/bg(?=\/)/, '');
const local = (p: string) => (lang === 'bg' ? `/bg${p}` : p);
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable: progress just isn't kept */ }
}

let read: Record<string, number> = readJson(READ_KEY, {});

function chapterOf(path: string) {
  return path.match(/^\/[^/]+\//)?.[0] ?? '';
}

function paint() {
  const perChapter: Record<string, number> = {};
  for (const p of Object.keys(read)) {
    const ch = chapterOf(p);
    perChapter[ch] = (perChapter[ch] ?? 0) + 1;
  }
  // Ticks on links to read sections: sidebar, chapter contents, related sections.
  document.querySelectorAll<HTMLAnchorElement>('.sb-sections a, .contents ol a, .related a').forEach((a) => {
    a.classList.toggle('is-read', Boolean(read[plain(new URL(a.href, location.href).pathname)]));
  });
  // Progress bars on chapter cards.
  document.querySelectorAll<HTMLElement>('[data-chapter-progress]').forEach((el) => {
    const total = Number(el.dataset.total) || 0;
    const n = Math.min(perChapter[el.dataset.chapterProgress ?? ''] ?? 0, total);
    el.hidden = n === 0;
    if (!n) return;
    el.querySelector<HTMLElement>('.bar > span')!.style.width = `${Math.round((n / total) * 100)}%`;
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
    const on = Boolean(read[path]);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.classList.toggle('is-read', on);
    label.textContent = on ? toggle.dataset.labelDone! : toggle.dataset.labelMark!;
    toggle.title = on ? toggle.dataset.labelUnmark! : '';
  };
  const set = (on: boolean) => {
    read = readJson(READ_KEY, {}); // another tab may have changed it
    if (on) read[path] = Math.floor(Date.now() / 1000);
    else delete read[path];
    writeJson(READ_KEY, read);
    render();
    paint();
  };
  toggle.hidden = false;
  document.querySelector<HTMLElement>('[data-read-hint]')?.removeAttribute('hidden');
  render();
  toggle.addEventListener('click', () => {
    const on = !read[path];
    if (!on) userUnmarked = true;
    set(on);
  });

  // Reaching the end of the text marks the section as read (unless the reader unmarked it).
  const opened = performance.now();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || userUnmarked || read[path]) continue;
        const wait = AUTO_MARK_AFTER_MS - (performance.now() - opened);
        setTimeout(() => {
          if (!userUnmarked && !read[path] && e.target.getBoundingClientRect().top < innerHeight) set(true);
        }, Math.max(0, wait));
      }
    }, { threshold: 0.5 });
    io.observe(toggle);
  }

  // Remember the last section for "Continue reading" (titles kept per language).
  const prev = readJson<Last | null>(LAST_KEY, null);
  const titles = prev && prev.path === path ? prev.titles : {};
  writeJson(LAST_KEY, { path, titles: { ...titles, [lang]: toggle.dataset.title ?? '' } } satisfies Last);
}

// --- Homepage: continue reading and reset ---------------------------------------
const cont = document.querySelector<HTMLAnchorElement>('[data-continue]');
if (cont) {
  const last = readJson<Last | null>(LAST_KEY, null);
  if (last?.path) {
    cont.href = local(last.path);
    const title = last.titles?.[lang] || Object.values(last.titles ?? {})[0] || '';
    cont.querySelector('[data-continue-title]')!.textContent = title;
    cont.hidden = false;
    document.querySelector('[data-start]')?.classList.remove('btn-primary');
  }
}
document.querySelector<HTMLButtonElement>('[data-progress-reset]')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  if (!confirm(btn.dataset.confirm ?? '')) return;
  read = {};
  writeJson(READ_KEY, null);
  writeJson(LAST_KEY, null);
  if (cont) cont.hidden = true;
  document.querySelector('[data-start]')?.classList.add('btn-primary');
  paint();
});

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

// Keep other tabs in sync.
addEventListener('storage', (e) => {
  if (e.key === READ_KEY) {
    read = readJson(READ_KEY, {});
    paint();
  }
});

paint();

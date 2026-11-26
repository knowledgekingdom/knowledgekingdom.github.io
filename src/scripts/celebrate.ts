// Watches for a chapter (or a whole Part) being finished during this visit and celebrates it
// (Motion & Story, M2): a wax seal stamped with the chapter's emblem, and for a Part a short film.
// The animations are a separate download (src/motion/celebrate.ts), fetched only when needed.
// Each celebration happens once: remembered in the reader's state ("seal:ch-NNN", "seal:part-N").
import { store } from './reader';

type Ch = { path: string; label: string; part: number | null; total: number; t: string; e: string };
const el = document.getElementById('kk-book');
if (el) {
  const meta: { chapters: Ch[]; parts: { n: number; roman: string; t: string }[] } = JSON.parse(el.textContent || '{"chapters":[],"parts":[]}');
  const all = JSON.parse(el.dataset.strings || '{}');
  const finished = () => {
    const per: Record<string, number> = {};
    for (const p of Object.keys(store.state.read)) { const ch = p.match(/^\/[^/]+\//)?.[0] ?? ''; per[ch] = (per[ch] ?? 0) + 1; }
    return new Set(meta.chapters.filter((c) => c.total > 0 && (per[c.path] ?? 0) >= c.total).map((c) => c.label));
  };
  let before = finished();
  store.subscribe(() => {
    const now = finished();
    const ex = store.state.explored ?? {};
    const fresh = [...now].filter((l) => !before.has(l) && !ex[`seal:ch-${l}`]);
    before = now;
    if (!fresh.length) return;
    const ch = meta.chapters.find((c) => c.label === fresh[fresh.length - 1])!;
    const partDone = ch.part !== null && meta.chapters.filter((c) => c.part === ch.part).every((c) => now.has(c.label)) && !ex[`seal:part-${ch.part}`];
    const part = partDone ? meta.parts.find((p) => p.n === ch.part) ?? null : null;
    const at = Math.floor(Date.now() / 1000);
    store.update((s) => { s.explored ??= {}; for (const l of fresh) s.explored[`seal:ch-${l}`] ??= at; if (part) s.explored[`seal:part-${part.n}`] ??= at; });
    import('../motion/celebrate').then((m) => m.celebrate({ chapter: ch, part, strings: all.cel ?? {}, journey: all.journey ?? '/journey/' }));
  });
}

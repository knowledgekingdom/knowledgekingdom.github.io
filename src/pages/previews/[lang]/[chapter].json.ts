// /previews/en/001.json: what the hover / long-press previews show for one chapter's pages and
// sources. One small file per chapter and language, fetched only when a reader asks for a preview.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getChapters, sectionsOf, getSources } from '../../../lib/book';
import { plainText } from '../../../lib/terms';
import type { Lang } from '../../../i18n/ui';

const WORDS = 40;
const words = (s: string, n = WORDS) => {
  const w = s.replace(/\s+/g, ' ').trim().split(' ');
  return w.length > n ? `${w.slice(0, n).join(' ').replace(/[,;:—–-]$/, '')}…` : w.join(' ');
};
// The first real paragraphs of a section (skips headings, figures and captions).
const opening = (md: string) => words(md.split(/\n{2,}/)
  .filter((b) => !/^\s*(#|!\[|<figure|<\/?figcaption|\|)/.test(b))
  .map((b) => plainText(b).replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, ''))
  .join(' '));

export const getStaticPaths = (async () => {
  const chapters = await getChapters('en');
  return (['en', 'bg'] as Lang[]).flatMap((lang) => chapters.map((c) => ({ params: { lang, chapter: c.data.label } })));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const ch = (await getChapters(lang)).find((c) => c.data.label === params.chapter)!;
  const chapterName = `${ch.data.label} · ${ch.data.title}`;
  const pages: Record<string, { t: string; c: string; x: string }> = {
    [`/${ch.data.slug}/`]: { t: ch.data.title, c: chapterName, x: words(ch.data.standfirst) },
  };
  for (const s of await sectionsOf(ch.data.number, lang)) {
    pages[`/${s.data.chapterSlug}/${s.data.slug}/`] = {
      t: s.data.title, c: chapterName,
      x: s.data.type === 'section' || s.data.type === 'summary' ? opening(s.body ?? '') : s.data.description,
    };
  }
  const src = getSources(lang)[ch.data.label as keyof ReturnType<typeof getSources>];
  const sources: Record<string, string> = {};
  for (const e of src?.entries ?? []) sources[e.n] = words(e.html.replace(/<[^>]+>/g, ''), 60);
  return new Response(JSON.stringify({ pages, sources }), { headers: { 'Content-Type': 'application/json' } });
};

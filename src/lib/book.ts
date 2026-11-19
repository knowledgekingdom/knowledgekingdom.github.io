import { getCollection, type CollectionEntry } from 'astro:content';
import { localize, type Lang } from '../i18n/ui';
import bookEn from '../data/book.json';
import roadmapEn from '../data/roadmap.json';
import updatesJson from '../data/updates.json';
import flashcardsEn from '../data/flashcards.json';
import practiceEn from '../data/practice.json';
import sourcesEn from '../data/sources.json';
import figuresEn from '../data/figures.json';
import relatedJson from '../data/related.json';

// Bulgarian data files are produced by `npm run translate` and may not exist yet.
const bgData = import.meta.glob<{ default: unknown }>('../data/bg/*.json', { eager: true });
function bgFile<T>(name: string, fallback: T): T {
  return (bgData[`../data/bg/${name}.json`]?.default as T) ?? fallback;
}

export type Book = typeof bookEn;
export type Part = Book['parts'][number];
export type Chapter = CollectionEntry<'chapters'> | CollectionEntry<'chaptersBg'>;
export type Section = CollectionEntry<'sections'> | CollectionEntry<'sectionsBg'>;
export type Page = CollectionEntry<'pages'> | CollectionEntry<'pagesBg'>;
export type OrderEntry = { url: string; title: string; kind: string; chapter?: number };
export type Flashcards = typeof flashcardsEn;
export type Practice = typeof practiceEn;
export type Sources = typeof sourcesEn;

type UpdateLink = { url: string; title: string };
export type EditionLink = { url: string; title: string; chapter: string };
export type EditionEntry = {
  edition: number;
  date: string;
  firstImported: string;
  baseline: boolean;
  chapters: number | null;
  newChapters: EditionLink[];
  newSections: EditionLink[];
  changed: EditionLink[];
};
export const updates = updatesJson as unknown as {
  edition: number | null;
  editionDate: string;
  previousEdition: number | null;
  new: UpdateLink[];
  changed: UpdateLink[];
  recent: (UpdateLink & { edition: number })[];
  editions: EditionEntry[];
};

/** Section URL (language-neutral) → related section URLs, computed by the importer. */
const related = relatedJson as Record<string, string[]>;

export const figures = figuresEn;

export function getBook(lang: Lang): Book {
  return lang === 'bg' ? bgFile('book', bookEn) : bookEn;
}
export function getRoadmap(lang: Lang): typeof roadmapEn {
  return lang === 'bg' ? bgFile('roadmap', roadmapEn) : roadmapEn;
}
export function getFlashcards(lang: Lang): Flashcards {
  return lang === 'bg' ? bgFile('flashcards', flashcardsEn) : flashcardsEn;
}
export function getPractice(lang: Lang): Practice {
  return lang === 'bg' ? bgFile('practice', practiceEn) : practiceEn;
}
export function getSources(lang: Lang): Sources {
  return lang === 'bg' ? bgFile('sources', sourcesEn) : sourcesEn;
}
/** True once the Bulgarian translation has been generated. */
export const hasBulgarian = Boolean(bgData['../data/bg/book.json']);

const cache = new Map<string, unknown>();
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, await fn());
  return cache.get(key) as T;
}

/** Merge translated entries over the English ones, falling back per entry. */
async function merged<T extends { id: string }>(en: T[], bg: T[], lang: Lang): Promise<T[]> {
  if (lang === 'en') return en;
  const byId = new Map(bg.map((e) => [e.id, e]));
  return en.map((e) => byId.get(e.id) ?? e);
}

export async function getChapters(lang: Lang = 'en'): Promise<Chapter[]> {
  return memo(`chapters:${lang}`, async () => {
    const en = (await getCollection('chapters')).sort((a, b) => a.data.number - b.data.number);
    const bg = lang === 'bg' ? await getCollection('chaptersBg') : [];
    return merged<Chapter>(en, bg, lang);
  });
}

export async function getSections(lang: Lang = 'en'): Promise<Section[]> {
  return memo(`sections:${lang}`, async () => {
    const en = (await getCollection('sections')).sort(
      (a, b) => a.data.chapter - b.data.chapter || a.data.order - b.data.order,
    );
    const bg = lang === 'bg' ? await getCollection('sectionsBg') : [];
    return merged<Section>(en, bg, lang);
  });
}

export async function getPage(slug: string, lang: Lang): Promise<Page | undefined> {
  const en = await getCollection('pages');
  const bg = lang === 'bg' ? await getCollection('pagesBg') : [];
  return (bg as Page[]).find((p) => p.data.slug === slug) ?? (en as Page[]).find((p) => p.data.slug === slug);
}

export async function sectionsOf(chapterNumber: number, lang: Lang = 'en'): Promise<Section[]> {
  return (await getSections(lang)).filter((s) => s.data.chapter === chapterNumber);
}

/** Whether an entry is a machine translation (came from a *Bg collection). */
export function isTranslated(entry: { collection: string }): boolean {
  return entry.collection.endsWith('Bg');
}

export function partByNumber(n: number | null | undefined, lang: Lang = 'en'): Part | undefined {
  return getBook(lang).parts.find((p) => p.number === n);
}

export function chapterUrl(c: Chapter, lang: Lang = 'en') {
  return localize(`/${c.data.slug}/`, lang);
}

export function sectionUrl(s: Section, lang: Lang = 'en') {
  return localize(`/${s.data.chapterSlug}/${s.data.slug}/`, lang);
}

/** Previous / next page in book order, crossing chapter boundaries. */
export function neighbours(url: string, lang: Lang): { prev?: OrderEntry; next?: OrderEntry } {
  const order = getBook(lang).readingOrder as OrderEntry[];
  const plain = url.replace(/^\/bg(?=\/)/, '');
  const i = order.findIndex((e) => e.url === plain);
  if (i === -1) return {};
  const loc = (e?: OrderEntry) => (e ? { ...e, url: localize(e.url, lang) } : undefined);
  return { prev: loc(order[i - 1]), next: loc(order[i + 1]) };
}

export const SPECIAL_TYPES = ['summary', 'practice', 'flashcards', 'sources'] as const;

export function excerpt(text: string, max = 150) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '').replace(/[,;:—–-]$/, '') + '…';
}

/** A page's title and chapter in the given language, looked up by its language-neutral URL. */
export async function pageInfo(url: string, lang: Lang): Promise<
  { url: string; title: string; chapterLabel: string; chapterTitle: string; part: number | null } | undefined> {
  const index = await memo(`pageIndex:${lang}`, async () => {
    const m = new Map<string, { title: string; chapterLabel: string; chapterTitle: string; part: number | null }>();
    for (const c of await getChapters(lang))
      m.set(`/${c.data.slug}/`, { title: c.data.title, chapterLabel: c.data.label, chapterTitle: c.data.title, part: c.data.part });
    for (const s of await getSections(lang))
      m.set(`/${s.data.chapterSlug}/${s.data.slug}/`,
        { title: s.data.title, chapterLabel: s.data.chapterLabel, chapterTitle: s.data.chapterTitle, part: s.data.part });
    return m;
  });
  const hit = index.get(url);
  return hit && { url: localize(url, lang), ...hit };
}

/** Related sections for a section page, localized. */
export async function relatedTo(url: string, lang: Lang) {
  const plain = url.replace(/^\/bg(?=\/)/, '');
  const found = await Promise.all((related[plain] ?? []).map((u) => pageInfo(u, lang)));
  return found.filter((x): x is NonNullable<typeof x> => Boolean(x));
}

// getStaticPaths helpers shared by the English (/...) and Bulgarian (/bg/...) routes.
import type { Lang } from '../i18n/ui';
import { getBook, getChapters, getSections } from './book';

export async function slugPaths(lang: Lang) {
  const book = getBook(lang);
  const chapters = await getChapters(lang);
  return [
    ...book.parts.map((part) => ({ params: { slug: part.slug }, props: { kind: 'part' as const, part } })),
    ...chapters.map((chapter) => ({ params: { slug: chapter.data.slug }, props: { kind: 'chapter' as const, chapter } })),
  ];
}

export async function sectionPaths(lang: Lang) {
  const sections = await getSections(lang);
  return sections.map((section) => ({
    params: { chapter: section.data.chapterSlug, section: section.data.slug },
    props: { section },
  }));
}

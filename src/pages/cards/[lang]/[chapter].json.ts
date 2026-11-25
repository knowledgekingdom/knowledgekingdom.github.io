// /cards/en/003.json: one chapter's flashcards for the daily review (fetched only for the
// chapters a reader reviews).
import type { APIRoute, GetStaticPaths } from 'astro';
import { getFlashcards } from '../../../lib/book';
import type { Lang } from '../../../i18n/ui';

export const getStaticPaths = (() => {
  const chapters = Object.keys(getFlashcards('en').chapters);
  return (['en', 'bg'] as Lang[]).flatMap((lang) => chapters.map((chapter) => ({ params: { lang, chapter } })));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const deck = getFlashcards(params.lang as Lang).chapters[params.chapter as keyof ReturnType<typeof getFlashcards>['chapters']];
  const cards = (deck?.cards ?? []).map((c) => ({ id: `${params.chapter}-${c.id}`, front: c.front, back: c.back }));
  return new Response(JSON.stringify({ chapter: params.chapter, cards }), { headers: { 'Content-Type': 'application/json' } });
};

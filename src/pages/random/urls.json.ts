import type { APIRoute } from 'astro';
import { getSections } from '../../lib/book';

// Compact list of regular section URLs for /random/.
export const GET: APIRoute = async () => {
  const sections = (await getSections()).filter((s) => s.data.type === 'section');
  return new Response(JSON.stringify(sections.map((s) => `/${s.data.chapterSlug}/${s.data.slug}/`)), {
    headers: { 'Content-Type': 'application/json' },
  });
};

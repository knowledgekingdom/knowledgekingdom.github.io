import type { APIRoute } from 'astro';
import { getBook, getChapters, getSections } from '../lib/book';
import { localize } from '../i18n/ui';

// Every public page in both languages, each with its hreflang alternates.
export const GET: APIRoute = async ({ site }) => {
  const book = getBook('en');
  const chapters = await getChapters('en');
  const sections = await getSections('en');
  const paths = [
    '/', '/about/', '/roadmap/', '/updates/', '/timeline/',
    ...book.parts.map((p) => `/${p.slug}/`),
    ...chapters.map((c) => `/${c.data.slug}/`),
    ...sections.map((s) => `/${s.data.chapterSlug}/${s.data.slug}/`),
  ];
  const abs = (p: string) => new URL(p, site).href;
  const urls = paths.flatMap((p) => {
    const alts = `\n    <xhtml:link rel="alternate" hreflang="en" href="${abs(localize(p, 'en'))}"/>` +
      `\n    <xhtml:link rel="alternate" hreflang="bg" href="${abs(localize(p, 'bg'))}"/>` +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(localize(p, 'en'))}"/>`;
    return (['en', 'bg'] as const).map((lang) => `  <url>\n    <loc>${abs(localize(p, lang))}</loc>${alts}\n  </url>`);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};

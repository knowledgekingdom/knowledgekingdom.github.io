// RSS 2.0 feed of editions: one item per edition, listing what it added or revised.
// Built from the same edition history as /updates/, so the two always agree.
import { getBook, updates, pageInfo, type EditionLink } from './book';
import { t, localize, type Lang, type UIKey } from '../i18n/ui';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function rssFeed(lang: Lang, site: URL): Promise<Response> {
  const book = getBook(lang);
  const abs = (p: string) => new URL(localize(p, lang), site).href;
  const home = abs('/');
  const pageUrl = abs('/updates/');

  const list = async (heading: string, links: EditionLink[]) => {
    const items = (await Promise.all(links.map((l) => pageInfo(l.url, lang)))).filter((x) => x !== undefined);
    if (!items.length) return '';
    return `<h3>${esc(heading)}</h3><ul>${items.map((i) =>
      `<li><a href="${esc(new URL(i.url, site).href)}">${esc(i.chapterLabel)} · ${esc(i.title)}</a></li>`).join('')}</ul>`;
  };

  const items = await Promise.all((updates.editions ?? []).map(async (e) => {
    const title = t(lang, 'updates.itemTitle', { n: e.edition });
    const count = (n: number, one: UIKey, many: UIKey) => (n === 0 ? '' : t(lang, n === 1 ? one : many, { n }));
    const counts = [
      count(e.newChapters.length, 'updates.count.chapter', 'updates.count.chapters'),
      count(e.newSections.length, 'updates.count.section', 'updates.count.sections'),
      count(e.changed.length, 'updates.count.changedOne', 'updates.count.changed'),
    ].filter(Boolean).join(', ');
    const summary = e.baseline ? t(lang, 'updates.baseline', { n: e.chapters ?? '' }) : counts || t(lang, 'updates.nothing');
    const html = `<p>${esc(summary)}</p>` +
      (await list(t(lang, 'updates.newChapters'), e.newChapters)) +
      (await list(t(lang, 'updates.newSections'), e.newSections)) +
      (await list(t(lang, 'updates.changed'), e.changed));
    const date = e.firstImported ? new Date(`${e.firstImported}T12:00:00Z`).toUTCString() : '';
    return `    <item>
      <title>${esc(`${title}: ${summary}`)}</title>
      <link>${pageUrl}#edition-${e.edition}</link>
      <guid isPermaLink="false">${esc(`${home}#edition-${e.edition}`)}</guid>
      ${date ? `<pubDate>${date}</pubDate>` : ''}
      <description><![CDATA[${html}]]></description>
    </item>`;
  }));

  const latest = updates.editions?.[0]?.firstImported;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(t(lang, 'updates.feedTitle', { title: book.title }))}</title>
    <link>${home}</link>
    <atom:link href="${abs('/rss.xml')}" rel="self" type="application/rss+xml" />
    <description>${esc(t(lang, 'updates.lede'))}</description>
    <language>${lang === 'bg' ? 'bg' : 'en'}</language>
    ${latest ? `<lastBuildDate>${new Date(`${latest}T12:00:00Z`).toUTCString()}</lastBuildDate>` : ''}
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}

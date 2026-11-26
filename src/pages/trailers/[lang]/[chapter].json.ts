// /trailers/en/027.json: everything one chapter's trailer needs (Motion & Story, M1). Built from
// the book: the chapter's time span, its events, places, routes and empires from the knowledge
// layer (approved ones only on the live site), its key terms and its sections. Fetched only when a
// reader presses "Watch the trailer".
import type { APIRoute, GetStaticPaths } from 'astro';
import { getChapters, sectionsOf } from '../../../lib/book';
import { getTimeline } from '../../../lib/timeline';
import { formatDate } from '../../../lib/time-scale';
import { knowledge, tx } from '../../../lib/knowledge';
import { project } from '../../../atlas/projection';
import mapData from '../../../data/map.json';
import scripts from '../../../../content-meta/trailer-scripts.json';
import type { Lang } from '../../../i18n/ui';

export const getStaticPaths = (async () => {
  const chapters = await getChapters('en');
  return (['en', 'bg'] as Lang[]).flatMap((lang) => chapters.map((c) => ({ params: { lang, chapter: c.data.label } })));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const label = params.chapter!;
  const ch = (await getChapters(lang)).find((c) => c.data.label === label)!;
  const spans = getTimeline(lang).chapterSpans;
  const cites = (list: { id: string }[]) => list.some((s) => s.id.startsWith(`${label}/`));
  const town = (mapData as { towns: { label: string; emblem: string }[] }).towns.find((t) => t.label === label);
  const date = (a: number, b: number, approx = false) => formatDate({ start: a, end: b, approx }, lang);
  const placeById = new Map(knowledge.places.map((p) => [p.id, p]));
  const at = (id: string | null) => { const p = id ? placeById.get(id) : undefined; return p ? project(p.lat, p.lon) : null; };

  const places = knowledge.places.filter((p) => p.type !== 'empire' && cites(p.sections))
    .map((p) => ({ n: tx(p.name, lang), t: p.type, xy: project(p.lat, p.lon), k: p.sections.filter((s) => s.id.startsWith(`${label}/`)).length }));
  const events = knowledge.events.filter((e) => cites(e.sections))
    .map((e) => ({ y: Math.round((e.start + e.end) / 2), d: date(e.start, e.end, e.precision === 'approximate'), l: tx(e.label, lang), xy: at(e.place) }))
    .sort((a, b) => a.y - b.y);
  const routes = knowledge.routes.filter((r) => cites(r.sections))
    .map((r) => ({ n: tx(r.name, lang), from: r.active?.from ?? null, to: r.active?.to ?? null, pts: r.places.map((id) => at(id)).filter((p) => p !== null) }))
    .filter((r) => r.pts.length >= 2);
  const empires = knowledge.places.filter((p) => p.type === 'empire' && cites(p.sections))
    .map((p) => ({ n: tx(p.name, lang), from: p.active?.from ?? null, to: p.active?.to ?? null,
      pts: (p.extent ?? []).map((x) => { const [id, y] = x.split('@'); const xy = at(id); return xy ? [...xy, y ? Number(y) : null] : null; }).filter((q) => q !== null) }));
  const terms = knowledge.concepts.filter((c) => c.defined?.id.startsWith(`${label}/`)).slice(0, 6)
    .map((c) => ({ t: tx(c.term, lang), d: tx(c.definition, lang) }));
  const secs = (await sectionsOf(ch.data.number, lang)).filter((s) => s.data.type === 'section');

  const body = {
    label, title: ch.data.title, standfirst: ch.data.standfirst, part: ch.data.part, emblem: town?.emblem ?? 'banner',
    url: `${lang === 'bg' ? '/bg' : ''}/${ch.data.slug}/`,
    first: secs[0] ? `${lang === 'bg' ? '/bg' : ''}/${secs[0].data.chapterSlug}/${secs[0].data.slug}/` : null,
    span: spans[label] ?? null, spanText: spans[label] ? date(spans[label][0], spans[label][1]) : null,
    spans: Object.entries(spans).map(([l, [a, b]]) => [l, a, b]),
    sections: secs.map((s) => s.data.title), minutes: ch.data.readingTime,
    places, events, routes, empires, terms,
    // Narration (content-meta/trailer-scripts.json): [scene, text] lines, read aloud during the film.
    narration: ((scripts as unknown as Record<string, Record<string, [string, string][]>>)[lang] ?? {})[label] ?? [],
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

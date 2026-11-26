// The knowledge data layer for site features (timeline, games, atlas, term previews …).
// Source: content-meta/knowledge/*.yaml → scripts/knowledge.mjs → src/data/knowledge.json.
// The live site shows only entries Semir has approved; `npm run dev` also shows proposed
// ones so they can be checked in place.
import data from '../data/knowledge.json';
import type { Lang } from '../i18n/ui';

type Text = { en: string; bg: string | null };
type Cite = { id: string; url: string };
type Status = 'proposed' | 'approved';

export type KEvent = { id: string; label: Text; date: { en: string }; start: number; end: number;
  precision: 'day' | 'month' | 'year' | 'decade' | 'century' | 'millennium' | 'approximate';
  region: string; place: string | null; chapter: string | null; sections: Cite[]; status: Status };
export type KPlace = { id: string; name: Text; lat: number; lon: number; type: string; region: string | null;
  active: { from: number | null; to: number | null } | null; extent: string[] | null; chapter: string | null; sections: Cite[]; status: Status };
export type KRoute = { id: string; name: Text; places: string[]; active: KPlace['active']; chapter: string | null;
  sections: Cite[]; status: Status };
export type KConcept = { id: string; term: Text; definition: Text; defined: Cite; related: string[];
  link: 'everywhere' | 'chapter' | 'never';
  chapter: string | null; sections: Cite[]; status: Status };

const shown = <T extends { status: Status }>(list: T[]) =>
  import.meta.env.DEV ? list : list.filter((e) => e.status === 'approved');

export const knowledge = {
  events: shown(data.events as KEvent[]),
  places: shown(data.places as KPlace[]),
  routes: shown(data.routes as KRoute[]),
  concepts: shown(data.concepts as KConcept[]),
};

/** The text in the reader's language (English when the Bulgarian is missing). */
export const tx = (t: Text, lang: Lang) => (lang === 'bg' && t.bg) || t.en;
/** A section address in the reader's language. */
export const citeUrl = (c: Cite, lang: Lang) => (lang === 'bg' ? `/bg${c.url}` : c.url);

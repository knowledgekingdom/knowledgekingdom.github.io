// Key-term previews: which approved concepts a section mentions (first mention only, at most
// five per section, so the text never turns into a sea of links). Computed at build time and
// embedded in the page; src/scripts/previews.ts turns the first mention into a definition popover.
import { knowledge, tx, citeUrl, type KConcept } from './knowledge';
import type { Lang } from '../i18n/ui';

export const MAX_TERMS = 5;
export type PageTerm = { id: string; term: string; pattern: string; flags: string; definition: string; more: string; definedPath: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A pattern that finds the term in running text (plural / Bulgarian endings allowed). */
export function termPattern(term: string, lang: Lang): { pattern: string; flags: string } {
  const acronym = /^[A-Z]{2,}$/.test(term);
  const words = term.replace(/[’']/g, "['’]?").split(/\s+/).map((w) => (w.includes("['’]?") ? w : esc(w)));
  const tail = lang === 'bg' ? '\\p{L}{0,3}' : '(?:s|es)?';
  const body = words.join('[\\s\\u00a0-]+') + (acronym ? '' : tail);
  return { pattern: `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags: acronym ? 'u' : 'iu' };
}

/** Plain text of a section's Markdown body, roughly as readers see it. */
export function plainText(md: string): string {
  return md.replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\\(.)/g, '$1').replace(/[#*_>]/g, ' ');
}

export function termsFor(opts: { body: string; path: string; chapter: string; lang: Lang }): PageTerm[] {
  const text = plainText(opts.body);
  const found: { at: number; c: KConcept; term: string; p: ReturnType<typeof termPattern> }[] = [];
  for (const c of knowledge.concepts) {
    if (c.link === 'never' || (c.link === 'chapter' && c.chapter !== opts.chapter)) continue;
    if (c.defined.url === opts.path) continue; // the section that defines it already explains it
    const term = tx(c.term, opts.lang);
    const p = termPattern(term, opts.lang);
    const m = new RegExp(p.pattern, p.flags).exec(text);
    if (m) found.push({ at: m.index, c, term, p });
  }
  return found.sort((a, b) => a.at - b.at).slice(0, MAX_TERMS).map(({ c, term, p }) => ({
    id: c.id, term, ...p, definition: tx(c.definition, opts.lang), more: citeUrl(c.defined, opts.lang), definedPath: c.defined.url,
  }));
}

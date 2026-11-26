// The knowledge data layer: facts the features need (dates, places, routes, key terms)
// that the manuscript states but doesn't structure. Kept by hand in content-meta/knowledge/*.yaml.
//
//   node scripts/knowledge.mjs check          validate, then write src/data/knowledge.json
//                                              (runs before every build; errors stop the build)
//   node scripts/knowledge.mjs review         write docs/knowledge-review.md for Semir to skim
//   node scripts/knowledge.mjs approve 009 010   mark every proposed entry of those chapters approved
//   node scripts/knowledge.mjs changed        after an import: entries whose sections changed
//
// Every entry cites the section(s) where the book says it, as "NNN/section-slug" (the part of
// the address after the chapter). Entries start as `status: proposed`; the site shows only
// approved ones (a local `npm run dev` also shows proposed ones, so they can be checked).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parse, parseDocument } from 'yaml';

const ROOT = new URL('../', import.meta.url);
const KDIR = new URL('content-meta/knowledge/', ROOT);
const FILES = ['events', 'places', 'routes', 'concepts'];
// Timeline lanes (v2 plan, Phase 4), plus Southeast Asia and Oceania, which the book covers too.
export const REGIONS = ['africa', 'west-asia', 'mediterranean-europe', 'south-asia', 'east-asia', 'southeast-asia',
  'central-asia-steppe', 'americas', 'oceania', 'global'];
// empire: a power the book discusses, drawn on the Atlas as a soft, approximate area around the key
// cities it controlled (`extent`), never as a precise border.
const PLACE_TYPES = ['city', 'region', 'river', 'site', 'route-point', 'sea', 'mountain', 'empire'];
const PRECISIONS = ['day', 'month', 'year', 'decade', 'century', 'millennium', 'approximate'];
const STATUSES = ['proposed', 'approved'];

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));

// ---- dates ---------------------------------------------------------------------------
// Years are integers: 1453 is 1453 CE, -3100 is 3100 BCE (no year zero, as in the book).
// Deep time is stored as 2000 minus "years ago", like the timeline, so 3.3 million years
// ago is -3298000.
const ORD = String.raw`(\d+)(?:st|nd|rd|th)`;
const MONTHS = 'january february march april may june july august september october november december'.split(' ');
const num = (s) => Number(String(s).replace(/,/g, ''));

/** Parse a date as written in the book. Returns { start, end, approx } or null. */
export function parseDate(input) {
  if (typeof input === 'number' && Number.isInteger(input)) return { start: input, end: input, approx: false };
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/\s+/g, ' ').replace(/ ?[–—-] ?/g, '–');
  let approx = false;
  const pre = s.match(/^(c\.|ca\.|circa|around|about) ?/i);
  if (pre) { approx = true; s = s.slice(pre[0].length); }
  let m;

  // "3.3 million years ago", "2.5–1.7 million years ago", "300,000 years ago", "70,000–50,000 years ago"
  if ((m = s.match(/^([\d.,]+)(?:–([\d.,]+))? (million )?years ago$/i))) {
    const mult = m[3] ? 1e6 : 1;
    const a = num(m[1]) * mult, b = m[2] ? num(m[2]) * mult : a;
    if (!(a >= b) || !Number.isFinite(a)) return null;
    return { start: Math.round(2000 - a), end: Math.round(2000 - b), approx };
  }
  // "5th century BCE", "15th–16th centuries", "3rd millennium BCE"
  if ((m = s.match(new RegExp(`^${ORD}(?:–${ORD})? (century|centuries|millennium|millennia)(?: (BCE|BC|CE|AD))?$`, 'i')))) {
    const unit = /^mill/i.test(m[3]) ? 1000 : 100;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    const bce = /^BC/i.test(m[4] ?? '');
    if (bce) { if (b > a) return null; return { start: -a * unit, end: -(b - 1) * unit - 1, approx }; }
    if (b < a) return null;
    return { start: (a - 1) * unit + 1, end: b * unit, approx };
  }
  // "1450s"
  if ((m = s.match(/^(\d{3,4})s$/))) {
    const a = Number(m[1]);
    if (a % 10) return null;
    return { start: a, end: a + 9, approx };
  }
  // "29 May 1453", "May 1453"
  if ((m = s.match(/^(?:(\d{1,2}) )?([A-Za-z]+) (\d{1,4})(?: (CE|AD))?$/)) && MONTHS.includes(m[2].toLowerCase())) {
    const y = Number(m[3]);
    return { start: y, end: y, approx };
  }
  // "3100 BCE", "3500–3100 BCE", "27 BCE–14 CE", "1453", "1914–1918", "476 CE"
  if ((m = s.match(/^([\d,]+)(?: (BCE|BC|CE|AD))?(?:–([\d,]+)(?: (BCE|BC|CE|AD))?)?$/i))) {
    const e1 = m[2], e2 = m[4];
    const endBce = /^BC/i.test(e2 ?? e1 ?? '');
    const startBce = e1 ? /^BC/i.test(e1) : endBce;
    const a = num(m[1]) * (startBce ? -1 : 1);
    const b = m[3] ? num(m[3]) * (endBce ? -1 : 1) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || a === 0 || b === 0) return null;
    return { start: a, end: b, approx };
  }
  return null;
}

// ---- sections that exist -------------------------------------------------------------------
export function sectionIndex() {
  const slugs = readJson('content-meta/slugs.json');
  const ids = new Map(); // "009/the-hominin-family-tree" → url
  for (const [key, slug] of Object.entries(slugs.sections)) {
    const ch = key.slice(0, 3);
    const chSlug = slugs.chapters[ch];
    if (chSlug) ids.set(`${ch}/${slug}`, `/${chSlug}/${slug}/`);
  }
  for (const [ch, chSlug] of Object.entries(slugs.chapters)) ids.set(`${ch}/`, `/${chSlug}/`); // the chapter's opening
  const moved = {};
  for (const [from, to] of Object.entries(slugs.moved ?? {})) {
    const id = (url) => {
      const m = url.match(/^\/(\d{3})-[^/]+\/([^/]+)\/$/);
      return m ? `${m[1]}/${m[2]}` : null;
    };
    if (id(from) && id(to)) moved[id(from)] = id(to);
  }
  return { ids, moved };
}

// ---- load + validate --------------------------------------------------------------------
function load() {
  const data = {};
  for (const f of FILES) {
    const url = new URL(`${f}.yaml`, KDIR);
    data[f] = existsSync(url) ? (parse(readFileSync(url, 'utf8')) ?? []) : [];
    if (!Array.isArray(data[f])) throw new Error(`${f}.yaml must be a list of entries`);
  }
  return data;
}

export function validate(data, index = sectionIndex()) {
  const errors = [], warnings = [];
  const where = (file, e, i) => `${file}.yaml: ${e?.id ? `“${e.id}”` : `entry ${i + 1}`}`;
  const seen = new Map();
  const placeIds = new Set(data.places.map((p) => p?.id));
  const conceptIds = new Set(data.concepts.map((c) => c?.id));

  for (const file of FILES) {
    data[file].forEach((e, i) => {
      const at = where(file, e, i);
      if (!e || typeof e !== 'object') { errors.push(`${at}: not an entry`); return; }
      if (typeof e.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) errors.push(`${at}: id must be lowercase-with-dashes`);
      else if (seen.has(e.id)) errors.push(`${at}: id also used in ${seen.get(e.id)}.yaml`);
      else seen.set(e.id, file);
      if (!STATUSES.includes(e.status)) errors.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
      if (!e.bg) warnings.push(`${at}: no Bulgarian (bg) yet`);

      const cites = file === 'concepts' ? [e.defined, ...(e.sections ?? [])] : e.sections;
      if (!Array.isArray(cites) || !cites.filter(Boolean).length) errors.push(`${at}: must cite at least one section`);
      for (const s of (cites ?? []).filter(Boolean)) {
        if (!index.ids.has(s)) {
          errors.push(`${at}: section “${s}” doesn't exist${index.moved[s] ? ` (it moved to “${index.moved[s]}”; run \`node scripts/knowledge.mjs fix\`)` : ''}`);
        }
      }

      const dateField = (v, label) => {
        if (v === undefined) return null;
        const d = parseDate(v);
        if (!d) errors.push(`${at}: ${label} “${v}” isn't a date this script understands`);
        return d;
      };
      if (file === 'events') {
        if (!e.label) errors.push(`${at}: needs a label`);
        const d = dateField(e.date, 'date');
        if (e.date === undefined) errors.push(`${at}: needs a date`);
        if (!PRECISIONS.includes(e.precision)) errors.push(`${at}: precision must be one of ${PRECISIONS.join(', ')}`);
        else if (d?.approx && e.precision !== 'approximate') errors.push(`${at}: date says “c.” so precision must be approximate`);
        if (!REGIONS.includes(e.region)) errors.push(`${at}: region must be one of ${REGIONS.join(', ')}`);
        if (e.place && !placeIds.has(e.place)) errors.push(`${at}: place “${e.place}” isn't in places.yaml`);
      }
      if (file === 'places') {
        if (!e.name) errors.push(`${at}: needs a name`);
        if (!(typeof e.lat === 'number' && Math.abs(e.lat) <= 90)) errors.push(`${at}: lat must be a number between -90 and 90`);
        if (!(typeof e.lon === 'number' && Math.abs(e.lon) <= 180)) errors.push(`${at}: lon must be a number between -180 and 180`);
        if (!PLACE_TYPES.includes(e.type)) errors.push(`${at}: type must be one of ${PLACE_TYPES.join(', ')}`);
        if (!e.source) errors.push(`${at}: needs a source for its coordinates (e.g. wikidata:Q123)`);
        if (e.region && !REGIONS.includes(e.region)) errors.push(`${at}: region must be one of ${REGIONS.join(', ')}`);
        if (e.active) { dateField(e.active.from, 'active.from'); dateField(e.active.to, 'active.to'); }
        if (e.type === 'empire') {
          // extent: place ids, optionally "id@year" for a city the book says came under it in that year.
          if (!Array.isArray(e.extent) || !e.extent.length) errors.push(`${at}: an empire needs extent: the key cities it controlled (place ids)`);
          for (const x of e.extent ?? []) {
            const [p, y] = String(x).split('@');
            if (!placeIds.has(p)) errors.push(`${at}: extent place “${p}” isn't in places.yaml`);
            if (y !== undefined && !parseDate(y)) errors.push(`${at}: “${x}”: the year after @ isn't a date this script understands`);
          }
          if (!e.active?.from) errors.push(`${at}: an empire needs active.from, as the book dates it`);
        } else if (e.extent) errors.push(`${at}: only an empire has an extent`);
      }
      if (file === 'routes') {
        if (!e.name) errors.push(`${at}: needs a name`);
        if (!Array.isArray(e.places) || e.places.length < 2) errors.push(`${at}: needs at least two places in order`);
        for (const p of e.places ?? []) if (!placeIds.has(p)) errors.push(`${at}: place “${p}” isn't in places.yaml`);
        if (e.active) { dateField(e.active.from, 'active.from'); dateField(e.active.to, 'active.to'); }
      }
      if (file === 'concepts') {
        if (!e.term) errors.push(`${at}: needs a term`);
        if (!e.definition) errors.push(`${at}: needs a definition`);
        if (!e.defined) errors.push(`${at}: needs “defined”, the section where the book defines it`);
        if (e.bg && !e.definitionBg) warnings.push(`${at}: no Bulgarian definition (definitionBg) yet`);
        for (const r of e.related ?? []) if (!conceptIds.has(r)) errors.push(`${at}: related concept “${r}” isn't in concepts.yaml`);
        if (e.link !== undefined && e.link !== 'chapter' && e.link !== false) errors.push(`${at}: link must be "chapter" or false (or left out)`);
      }
    });
  }
  return { errors, warnings };
}

// ---- compile for the site -----------------------------------------------------------------
function compile(data, index) {
  const sec = (ids) => (ids ?? []).filter(Boolean).map((id) => ({ id, url: index.ids.get(id) }));
  const chapterOf = (ids) => (ids ?? []).find(Boolean)?.slice(0, 3) ?? null;
  const span = (a) => {
    if (!a) return null;
    const f = a.from !== undefined ? parseDate(a.from) : null, t = a.to !== undefined ? parseDate(a.to) : null;
    return { from: f?.start ?? null, to: t?.end ?? null };
  };
  return {
    _generated: 'by scripts/knowledge.mjs from content-meta/knowledge/*.yaml. Edit those, not this.',
    events: data.events.map((e) => {
      const d = parseDate(e.date);
      return { id: e.id, label: { en: e.label, bg: e.bg ?? null }, date: { en: String(e.date) }, start: d.start, end: d.end,
        precision: e.precision, region: e.region, place: e.place ?? null, chapter: chapterOf(e.sections),
        sections: sec(e.sections), status: e.status };
    }),
    places: data.places.map((p) => ({ id: p.id, name: { en: p.name, bg: p.bg ?? null }, lat: p.lat, lon: p.lon, type: p.type,
      region: p.region ?? null, active: span(p.active),
      // "city@year" as written (e.g. "sardis@546 BCE") becomes "city@-546" for the site.
      extent: p.extent?.map((x) => { const [id, y] = String(x).split('@'); return y === undefined ? id : `${id}@${parseDate(y).start}`; }) ?? null, chapter: chapterOf(p.sections), sections: sec(p.sections), status: p.status })),
    routes: data.routes.map((r) => ({ id: r.id, name: { en: r.name, bg: r.bg ?? null }, places: r.places, active: span(r.active),
      chapter: chapterOf(r.sections), sections: sec(r.sections), status: r.status })),
    concepts: data.concepts.map((c) => ({ id: c.id, term: { en: c.term, bg: c.bg ?? null },
      definition: { en: c.definition, bg: c.definitionBg ?? null }, defined: sec([c.defined])[0], related: c.related ?? [],
      link: c.link === false ? 'never' : c.link === 'chapter' ? 'chapter' : 'everywhere',
      chapter: chapterOf([c.defined]), sections: sec(c.sections), status: c.status })),
  };
}

// ---- review file --------------------------------------------------------------------------
function review(data, index) {
  const byCh = new Map();
  const add = (kind, e, cites) => {
    const ch = (cites ?? []).find(Boolean)?.slice(0, 3) ?? '???';
    if (!byCh.has(ch)) byCh.set(ch, []);
    byCh.get(ch).push({ kind, e });
  };
  data.events.forEach((e) => add('Event', e, e.sections));
  data.places.forEach((e) => add('Place', e, e.sections));
  data.routes.forEach((e) => add('Route', e, e.sections));
  data.concepts.forEach((e) => add('Concept', e, [e.defined]));
  const link = (id) => `[${id}](https://knowledgekingdom.github.io${index.ids.get(id) ?? '/'})`;
  const out = [
    '# Knowledge review',
    '',
    '*GENERATED by `node scripts/knowledge.mjs review`. Edit the YAML files in `content-meta/knowledge/`, not this page.*',
    '',
    'Each entry below was proposed from the book. Skim a chapter, fix or delete anything wrong in the YAML',
    '(or tell Claude), then approve the whole chapter with `node scripts/knowledge.mjs approve 009`.',
    'Only approved entries appear on the live site.',
    '',
  ];
  const counts = { proposed: 0, approved: 0 };
  for (const ch of [...byCh.keys()].sort()) {
    const items = byCh.get(ch);
    const p = items.filter((x) => x.e.status === 'proposed').length;
    out.push(`## Chapter ${ch} — ${p ? `${p} to review` : 'all approved'} (${items.length} entries)`, '');
    for (const kind of ['Event', 'Place', 'Route', 'Concept']) {
      const list = items.filter((x) => x.kind === kind);
      if (!list.length) continue;
      out.push(`### ${kind}s`, '');
      for (const { e } of list) {
        counts[e.status] = (counts[e.status] ?? 0) + 1;
        const mark = e.status === 'approved' ? '✅' : '⬜';
        if (kind === 'Event') out.push(`- ${mark} **${e.date}** · ${e.label} — *${e.bg ?? 'BG missing'}* · ${e.region}, ${e.precision} · ${e.sections.map(link).join(', ')}`);
        if (kind === 'Place') out.push(`- ${mark} **${e.name}** (*${e.bg ?? 'BG missing'}*) · ${e.type} · ${e.type === 'empire' ? `around ${e.extent.join(', ')}` : `${e.lat}, ${e.lon} · ${e.source}`}${e.active ? ` · active ${e.active.from ?? '?'} – ${e.active.to ?? 'open'}` : ''} · ${e.sections.map(link).join(', ')}`);
        if (kind === 'Route') out.push(`- ${mark} **${e.name}** (*${e.bg ?? 'BG missing'}*) · ${e.places.join(' → ')} · ${e.sections.map(link).join(', ')}`);
        if (kind === 'Concept') out.push(`- ${mark} **${e.term}** (*${e.bg ?? 'BG missing'}*): ${e.definition}${e.definitionBg ? `<br>*${e.definitionBg}*` : ''} · defined in ${link(e.defined)}${e.related?.length ? ` · related: ${e.related.join(', ')}` : ''}`);
      }
      out.push('');
    }
  }
  out.splice(8, 0, `**${counts.proposed} proposed, ${counts.approved} approved.**`, '');
  mkdirSync(new URL('docs/', ROOT), { recursive: true });
  writeFileSync(new URL('docs/knowledge-review.md', ROOT), out.join('\n').trimEnd() + '\n');
  return counts;
}

// ---- editing helpers (keep comments and layout in the YAML) ----------------------------------
function editFiles(fn) {
  let changed = 0;
  for (const f of FILES) {
    const url = new URL(`${f}.yaml`, KDIR);
    if (!existsSync(url)) continue;
    const doc = parseDocument(readFileSync(url, 'utf8'));
    let n = 0;
    for (const item of doc.contents?.items ?? []) n += fn(f, item) ? 1 : 0;
    if (n) { writeFileSync(url, doc.toString({ lineWidth: 0 })); changed += n; }
  }
  return changed;
}

// ---- command line -------------------------------------------------------------------------
if (import.meta.main) {
  const [cmd = 'check', ...args] = process.argv.slice(2);
  const index = sectionIndex();

  if (cmd === 'check') {
    const data = load();
    const { errors, warnings } = validate(data, index);
    if (warnings.length && args.includes('--verbose')) warnings.forEach((w) => console.log(`  note: ${w}`));
    if (errors.length) {
      console.error(`Knowledge data has ${errors.length} problem${errors.length > 1 ? 's' : ''}:`);
      errors.forEach((e) => console.error(`  ✗ ${e}`));
      process.exit(1);
    }
    const out = compile(data, index);
    writeFileSync(new URL('src/data/knowledge.json', ROOT), JSON.stringify(out, null, 2) + '\n');
    const n = (k) => out[k].length;
    const approved = ['events', 'places', 'routes', 'concepts'].reduce((s, k) => s + out[k].filter((e) => e.status === 'approved').length, 0);
    console.log(`Knowledge data OK: ${n('events')} events, ${n('places')} places, ${n('routes')} routes, ${n('concepts')} concepts (${approved} approved)${warnings.length ? `, ${warnings.length} notes (--verbose)` : ''}.`);
  } else if (cmd === 'review') {
    const c = review(load(), index);
    console.log(`Wrote docs/knowledge-review.md (${c.proposed} proposed, ${c.approved} approved).`);
  } else if (cmd === 'approve') {
    const chapters = new Set(args.map((a) => a.padStart(3, '0')));
    if (!chapters.size) { console.error('Say which chapters, e.g. node scripts/knowledge.mjs approve 009 010'); process.exit(1); }
    const n = editFiles((f, item) => {
      const cites = f === 'concepts' ? [item.get('defined')] : item.get('sections')?.toJSON?.() ?? [];
      const ch = cites.find(Boolean)?.slice(0, 3);
      if (chapters.has(ch) && item.get('status') === 'proposed') { item.set('status', 'approved'); return true; }
      return false;
    });
    console.log(`Approved ${n} entries.`);
  } else if (cmd === 'fix') {
    // Point citations of renamed sections at their new addresses.
    const n = editFiles((f, item) => {
      let hit = false;
      const fixList = (key) => {
        const seq = item.get(key);
        seq?.items?.forEach((node, i) => { const v = node.value ?? node; if (index.moved[v]) { seq.set(i, index.moved[v]); hit = true; } });
      };
      fixList('sections');
      const d = item.get('defined');
      if (d && index.moved[d]) { item.set('defined', index.moved[d]); hit = true; }
      return hit;
    });
    console.log(`Updated ${n} entries.`);
  } else if (cmd === 'changed') {
    // Sections revised in the latest edition that knowledge entries cite: worth a re-check.
    const manifest = readJson('content-meta/manifest.json');
    const book = readJson('src/data/book.json');
    const data = load();
    const urlToId = new Map([...index.ids].map(([id, url]) => [url, id]));
    const changed = new Set(Object.values(manifest.sections)
      .filter((s) => s.lastChanged === book.edition && s.firstSeen !== book.edition)
      .map((s) => urlToId.get(s.url)).filter(Boolean));
    const hits = [];
    for (const f of FILES) for (const e of data[f]) {
      const cites = f === 'concepts' ? [e.defined, ...(e.sections ?? [])] : e.sections ?? [];
      const c = cites.filter((s) => changed.has(s));
      if (c.length) hits.push(`  ${f}.yaml “${e.id}”: ${c.join(', ')}`);
    }
    console.log(hits.length ? `Edition ${book.edition} revised sections that ${hits.length} knowledge entries cite. Re-check them:\n${hits.join('\n')}`
      : `No knowledge entries cite sections revised in Edition ${book.edition}.`);
  } else {
    console.error(`Unknown command “${cmd}”. Use check, review, approve, fix or changed.`);
    process.exit(1);
  }
}

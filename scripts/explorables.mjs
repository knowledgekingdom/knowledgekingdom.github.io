// Explorable diagrams: content-meta/explorables.yaml → src/data/explorables.json (v2 Phase 3).
// `node scripts/explorables.mjs check` runs before every build and stops it if an entry points
// to a section, figure or component that doesn't exist.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { sectionIndex } from './knowledge.mjs';

const ROOT = new URL('../', import.meta.url);

export function validateExplorables(list, index, sectionBody, components) {
  const errors = [];
  const seen = new Set();
  for (const [i, e] of (list ?? []).entries()) {
    const at = `explorable “${e?.id ?? i + 1}”`;
    if (!e?.id || seen.has(e.id)) errors.push(`${at}: missing or duplicate id`);
    seen.add(e?.id);
    if (!components.has(e?.id)) errors.push(`${at}: no component src/explorables/${e?.id}.ts`);
    if (!index.ids.has(e?.section)) { errors.push(`${at}: section “${e?.section}” doesn't exist`); continue; }
    for (const k of ['title', 'instruction', 'notice']) if (!e?.[k]?.en || !e?.[k]?.bg) errors.push(`${at}: needs ${k} in en and bg`);
    const body = sectionBody(e.section);
    const a = String(e.anchor ?? '');
    if (/^figure-\d+-\d+$/.test(a)) {
      if (!body.includes(`id="${a}"`)) errors.push(`${at}: ${a} isn't in ${e.section}`);
    } else if (/^paragraph \d+$/.test(a)) {
      const n = Number(a.split(' ')[1]);
      const paras = body.split(/\n{2,}/).filter((b) => b.trim() && !/^\s*(#|!\[|<|\|)/.test(b)).length;
      if (n < 1 || n > paras) errors.push(`${at}: ${e.section} has only ${paras} paragraphs`);
    } else if (a !== 'end') errors.push(`${at}: anchor must be figure-N-M, "paragraph N" or "end"`);
  }
  return errors;
}

if (import.meta.main) {
  const index = sectionIndex();
  const list = parse(readFileSync(new URL('content-meta/explorables.yaml', ROOT), 'utf8')) ?? [];
  const components = new Set(readdirSync(new URL('src/explorables/', ROOT)).filter((f) => f.endsWith('.ts') && f !== 'kit.ts').map((f) => f.slice(0, -3)));
  const sectionBody = (id) => {
    const url = index.ids.get(id);
    const file = new URL(`src/content/sections${url.replace(/\/$/, '')}.md`, ROOT);
    return existsSync(file) ? readFileSync(file, 'utf8').split('---').slice(2).join('---') : '';
  };
  const errors = validateExplorables(list, index, sectionBody, components);
  if (errors.length) { console.error(`Explorables have ${errors.length} problem(s):`); errors.forEach((e) => console.error(`  ✗ ${e}`)); process.exit(1); }
  const out = list.map((e) => ({ ...e, url: index.ids.get(e.section) }));
  writeFileSync(new URL('src/data/explorables.json', ROOT), JSON.stringify(out, null, 2) + '\n');
  console.log(`Explorables OK: ${out.length}.`);
}

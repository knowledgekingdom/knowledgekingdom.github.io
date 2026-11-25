// `npm run audit` — Lighthouse scores (mobile) for key pages of a running site.
// Start the site first:  npm run build && npm run preview
// Usage: npm run audit [-- http://localhost:4321]
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const base = process.argv[2] || 'http://localhost:4321';
const pages = [
  '/',
  '/001-how-to-know-what-is-true/',
  '/001-how-to-know-what-is-true/following-a-claim-upstream/',
  '/001-how-to-know-what-is-true/flashcards/',
  '/timeline/',
  '/bg/timeline/',
  '/003-probability-risk-and-everyday-numbers/the-fraud-alarm-counted-properly/',
  '/009-human-evolution-and-the-first-migrations/a-timeline-that-changes-the-scale-of-everything/',
  '/play/which-came-first/',
  '/review/',
  '/bg/011-mesopotamia-and-the-first-states/the-canal-and-the-argument-over-water/',
];
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
let failed = false;
try {
  for (const p of pages) {
    const r = await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: categories });
    const { categories: c, audits: a } = r.lhr;
    const scores = categories.map((k) => `${k.slice(0, 4)} ${Math.round(c[k].score * 100)}`).join('  ');
    if (categories.some((k) => c[k].score < 0.9)) failed = true;
    console.log(`${p}\n  ${scores}   LCP ${a['largest-contentful-paint'].displayValue}  CLS ${a['cumulative-layout-shift'].displayValue}  TBT ${a['total-blocking-time'].displayValue}`);
    // List anything below full marks so it can be fixed.
    for (const k of categories) {
      for (const ref of c[k].auditRefs) {
        const au = a[ref.id];
        if (ref.weight > 0 && au.score !== null && au.score < 0.9) console.log(`    - [${k}] ${au.title}${au.displayValue ? ` (${au.displayValue})` : ''}`);
      }
    }
  }
} finally {
  await chrome.kill();
}
process.exitCode = failed ? 1 : 0;

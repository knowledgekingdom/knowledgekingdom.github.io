// Timeline helpers: data, date labels in both languages, and the compressed time scale.
import timelineEn from '../data/timeline.json';
import type { Lang } from '../i18n/ui';

export type TimelineEvent = {
  id: string; chapter: string; url: string; start: number; end: number;
  approx?: boolean; qual?: 'before' | 'after' | 'by'; text: string; source: string;
};
type TimelineData = { chapterSpans: Record<string, [number, number]>; events: TimelineEvent[] };

const bg = import.meta.glob<{ default: TimelineData }>('../data/bg/timeline.json', { eager: true });
export function getTimeline(lang: Lang): TimelineData {
  const data = lang === 'bg' ? bg['../data/bg/timeline.json']?.default : undefined;
  return (data ?? timelineEn) as TimelineData;
}

// ---- Dates --------------------------------------------------------------------------
const DEEP = -10000; // before this, dates read as "years ago"
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Whole centuries: 1401..1500 is the 15th century; -2700..-2101 is 27th–22nd centuries BCE. */
function centuries(start: number, end: number): [number, number] | null {
  if (start > 0 && start % 100 === 1 && end % 100 === 0) return [(start + 99) / 100, end / 100];
  if (end < 0 && start % 100 === 0 && (end - 1) % 100 === 0) return [-start / 100, (-end + 99) / 100];
  return null;
}

export function formatDate(e: Pick<TimelineEvent, 'start' | 'end' | 'approx' | 'qual'>, lang: Lang): string {
  const bgL = lang === 'bg';
  const c = e.approx ? (bgL ? 'ок. ' : 'c. ') : '';
  const qual = e.qual ? { en: { before: 'before ', after: 'after ', by: 'by ' }, bg: { before: 'преди ', after: 'след ', by: 'до ' } }[lang][e.qual] : '';
  const num = (n: number) => new Intl.NumberFormat(bgL ? 'bg-BG' : 'en-GB').format(n);

  if (e.start < DEEP) {
    const ago = (y: number) => 2000 - y;
    const a = ago(e.start), b = ago(e.end);
    const millions = a >= 1e6;
    const fmt = (n: number) => millions
      ? String(Math.round((n / 1e6) * 100) / 100).replace('.', bgL ? ',' : '.')
      : num(Math.round(n / 100) * 100);
    const range = a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`;
    const unit = millions ? (bgL ? ' млн.' : ' million') : '';
    // "c. 3.9–2.9 million years ago" / "преди ок. 3,9–2,9 млн. години"
    return bgL ? `${qual}преди ${c}${range}${unit} години` : `${qual}${c}${range}${unit} years ago`;
  }

  const bce = e.end < 0;
  // Whole millennia: -3000..-2001 is the 3rd millennium BCE.
  const mil = bce && e.start % 1000 === 0 && (e.end - 1) % 1000 === 0 ? [-e.start / 1000, (-e.end + 999) / 1000]
    : !bce && e.start > 0 && e.start % 1000 === 1 && e.end % 1000 === 0 ? [(e.start + 999) / 1000, e.end / 1000] : null;
  if (mil) {
    const [a, b] = mil;
    if (bgL) return `${qual}${a === b ? roman(a) : `${roman(a)}–${roman(b)}`} хил.${bce ? ' пр.н.е.' : ''}`;
    return `${qual}${a === b ? `${ordinal(a)} millennium` : `${ordinal(a)}–${ordinal(b)} millennia`}${bce ? ' BCE' : ''}`;
  }
  const cent = centuries(e.start, e.end);
  if (cent) {
    const [a, b] = cent;
    if (bgL) return `${qual}${a === b ? roman(a) : `${roman(a)}–${roman(b)}`} в.${bce ? ' пр.н.е.' : ''}`;
    return `${qual}${a === b ? `${ordinal(a)} century` : `${ordinal(a)}–${ordinal(b)} centuries`}${bce ? ' BCE' : ''}`;
  }
  const decade = e.start > 0 && e.start % 10 === 0 && e.end === e.start + 9;
  if (decade) return bgL ? `${qual}${c}${e.start}-те г.` : `${qual}${c}${e.start}s`;

  const y = (n: number) => String(Math.abs(n));
  let core: string;
  if (e.start === e.end) core = y(e.start);
  else if ((e.start < 0) === (e.end < 0)) core = `${y(e.start)}–${y(e.end)}`;
  else core = bgL ? `${y(e.start)} г. пр.н.е. – ${y(e.end)}` : `${y(e.start)} BCE – ${y(e.end)}`;
  const era = bce ? (bgL ? ' г. пр.н.е.' : ' BCE') : e.end < 1000 ? (bgL ? ' г.' : ' CE') : (bgL ? ' г.' : '');
  return `${qual}${c}${core}${era}`;
}

// ---- Compressed time scale ------------------------------------------------------------
// Equal-ish screen space for very unequal stretches of time.
export const SEGMENTS: { from: number; to: number; share: number }[] = [
  { from: -4_000_000, to: -10_000, share: 17 },
  { from: -10_000, to: -3000, share: 10 },
  { from: -3000, to: -500, share: 15 },
  { from: -500, to: 500, share: 12 },
  { from: 500, to: 1500, share: 18 },
  { from: 1500, to: 1925, share: 28 },
];
const TOTAL = SEGMENTS.reduce((n, s) => n + s.share, 0);

/** Position of a year along the overview, 0–100 (%). Deep time uses a log scale. */
export function position(year: number): number {
  let acc = 0;
  for (const s of SEGMENTS) {
    if (year <= s.to) {
      const y = Math.max(year, s.from);
      const f = s.from === SEGMENTS[0].from
        ? 1 - Math.log10(1 + (s.to - y) / 1000) / Math.log10(1 + (s.to - s.from) / 1000)
        : (y - s.from) / (s.to - s.from);
      return ((acc + f * s.share) / TOTAL) * 100;
    }
    acc += s.share;
  }
  return 100;
}

/** Eras for grouping the list (start year inclusive). */
export const ERAS = [-Infinity, -10000, -3000, -1000, 1, 500, 1000, 1400, 1600, 1800, 1870];

const ERA_LABELS: Record<Lang, string[]> = {
  en: ['Before 10,000 BCE', '10,000–3000 BCE', '3000–1000 BCE', '1000–1 BCE', '1–500 CE', '500–1000 CE',
    '1000–1400', '1400–1600', '1600–1800', '1800–1870', 'From 1870'],
  bg: ['Преди 10 000 г. пр.н.е.', '10 000 – 3000 г. пр.н.е.', '3000–1000 г. пр.н.е.', '1000–1 г. пр.н.е.', '1–500 г.',
    '500–1000 г.', '1000–1400 г.', '1400–1600 г.', '1600–1800 г.', '1800–1870 г.', 'След 1870 г.'],
};
export function eraLabel(i: number, lang: Lang): string {
  return ERA_LABELS[lang][i];
}

export function eraOf(year: number): number {
  let i = 0;
  while (i + 1 < ERAS.length && year >= ERAS[i + 1]) i++;
  return i;
}

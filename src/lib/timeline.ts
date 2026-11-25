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

export { formatDate, position, yearAt, SEGMENTS } from './time-scale';

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

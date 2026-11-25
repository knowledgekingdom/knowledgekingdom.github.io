// Ch. 009, Figure 9.5: three million years as a 30-day month, one day = 100,000 years (book).
// Anchors are the chapter's own: early Homo beyond Africa (~1.8 million), our species (~300,000),
// Sahul (~50,000), White Sands (~21,000–23,000), food production (~12,000), writing (~5,000).
import { T, num, slider, readout, layout, svg, s, h, type Explorable } from './kit';

const YEARS = 3_000_000, DAYS = 30, PER_DAY = 100_000;
const ANCHORS: { ago: number; en: string; bg: string }[] = [
  { ago: 1_800_000, en: 'Early Homo beyond Africa', bg: 'Ранни Homo извън Африка' },
  { ago: 300_000, en: 'Early Homo sapiens', bg: 'Ранни Homo sapiens' },
  { ago: 50_000, en: 'People in Sahul', bg: 'Хора в Сахул' },
  { ago: 22_000, en: 'White Sands footprints', bg: 'Следите при Уайт Сендс' },
  { ago: 12_000, en: 'Food production begins in several regions', bg: 'Производството на храна започва в няколко региона' },
  { ago: 5_000, en: 'Writing (in some regions)', bg: 'Писмеността (в някои региони)' },
];
/** "Day 28, 00:00" for a number of years ago. */
export function clockOf(ago: number) {
  const t = (YEARS - ago) / PER_DAY; // days elapsed since the start of the month
  const day = Math.min(DAYS, Math.floor(t) + 1), mins = Math.round((t - Math.floor(t)) * 24 * 60);
  return { day: mins === 1440 ? day + 1 : day, h: Math.floor((mins % 1440) / 60), m: mins % 60, left: (ago / PER_DAY) * 24 * 60 };
}
const two = (n: number) => String(n).padStart(2, '0');

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let at = 0; // days into the month
  const rWhen = readout(T({ en: 'on the compressed calendar', bg: 'в сгъстения календар' }), 'is-key');
  const rReal = readout(T({ en: 'in real time: years ago', bg: 'в реално време: преди години' }));
  readouts.append(rWhen.el, rReal.el);
  const W = 560, H = 170;
  const g = svg(W, H, T({ en: 'A 30-day month with anchors from the chapter; the lower strip enlarges the last day', bg: 'Месец от 30 дни с опорни дати от главата; долната лента увеличава последния ден' }));
  const X = (d: number) => 20 + (d / DAYS) * (W - 40);
  for (let d = 0; d <= DAYS; d++) g.append(s('line', { x1: X(d), x2: X(d), y1: 40, y2: d % 5 ? 52 : 58, class: 'ex-grid' }));
  for (let d = 0; d < DAYS; d += 5) g.append(s('text', { x: X(d) + 2, y: 70, class: 'ex-tick' }, T({ en: `day ${d + 1}`, bg: `ден ${d + 1}` })));
  g.append(s('rect', { x: X(0), y: 40, width: X(DAYS) - X(0), height: 12, class: 'ex-month' }));
  // Last day, enlarged (24 hours).
  const XL = (hours: number) => 20 + (hours / 24) * (W - 40);
  g.append(s('text', { x: 20, y: 118, class: 'ex-tick' }, T({ en: 'Day 30, enlarged (24 hours)', bg: 'Ден 30, увеличен (24 часа)' })));
  g.append(s('rect', { x: XL(0), y: 126, width: XL(24) - XL(0), height: 12, class: 'ex-month' }));
  for (let hr = 0; hr <= 24; hr += 6) g.append(s('text', { x: XL(hr), y: 156, class: 'ex-tick', 'text-anchor': 'middle' }, `${two(hr)}:00`));
  g.append(s('path', { d: `M${X(29)},52 L${XL(0)},126 M${X(30)},52 L${XL(24)},126`, class: 'ex-grid' }));
  ANCHORS.forEach((a, i) => {
    const t = (YEARS - a.ago) / PER_DAY, inLastDay = t >= 29;
    const x = inLastDay ? XL((t - 29) * 24) : X(t), y = inLastDay ? 132 : 46;
    g.append(s('circle', { cx: x, cy: y, r: 9, class: 'ex-point is-main' }));
    g.append(s('text', { x, y: y + 4, class: 'ex-anchor', 'text-anchor': 'middle' }, String(i + 1)));
  });
  const cursor = s('line', { y1: 34, y2: 62, class: 'ex-cursor' });
  g.append(cursor);
  stage.append(g, h('ol', { class: 'ex-anchors' }, ...ANCHORS.map((a) => {
    const c = clockOf(a.ago);
    return h('li', {}, `${T(a)}: ${T({ en: `day ${c.day}, ${two(c.h)}:${two(c.m)}`, bg: `ден ${c.day}, ${two(c.h)}:${two(c.m)}` })}`);
  })));
  const draw = () => {
    cursor.setAttribute('x1', String(X(at))); cursor.setAttribute('x2', String(X(at)));
    const ago = YEARS - at * PER_DAY;
    const c = clockOf(ago);
    rWhen.set(at >= DAYS ? T({ en: 'midnight, end of the month: today', bg: 'полунощ, краят на месеца: днес' })
      : T({ en: `day ${c.day}, ${two(c.h)}:${two(c.m)}`, bg: `ден ${c.day}, ${two(c.h)}:${two(c.m)}` }));
    rReal.set(num(Math.round(ago / 1000) * 1000));
  };
  const sAt = slider({ label: T({ en: 'Move through the month', bg: 'Движете се през месеца' }), min: 0, max: DAYS, step: 0.1, value: at,
    format: (v) => T({ en: `day ${num(Math.min(DAYS, Math.floor(v) + 1))}`, bg: `ден ${num(Math.min(DAYS, Math.floor(v) + 1))}` }), onInput: (v) => { at = v; draw(); } });
  controls.append(sAt.el, h('p', { class: 'ex-fixed' }, T({ en: 'One day = 100,000 years. One hour ≈ 4,200 years. One minute ≈ 70 years.',
    bg: 'Един ден = 100 000 години. Един час ≈ 4200 години. Една минута ≈ 70 години.' })));
  draw();
  return { reset() { at = 0; sAt.set(at); draw(); } };
}

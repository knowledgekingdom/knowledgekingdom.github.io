// Shared toolkit for explorable diagrams (v2 Phase 3): accessible, touch-friendly controls
// (native range inputs with labels and live readouts, radio-style toggles, buttons) and a tiny
// SVG line/bar chart helper. No dependencies, so each explorable stays a few KB.
export type Lang = 'en' | 'bg';
export const lang: Lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
export const T = <V,>(o: { en: V; bg: V }): V => o[lang];
const locale = lang === 'bg' ? 'bg-BG' : 'en-GB';
export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const pct = (n: number, digits = 1) => `${num(n * 100, digits)}%`;
export const money = (n: number, digits = 2) => `${n < 0 ? '−' : ''}€${num(Math.abs(n), digits)}`;
export const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

export interface Explorable { reset(): void }
export type Mount = (root: HTMLElement) => Explorable;

let uid = 0;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/** A labelled slider with a live, screen-reader-friendly value. */
export function slider(o: { label: string; min: number; max: number; step: number; value: number;
  format: (v: number) => string; onInput: (v: number) => void }) {
  const id = `ex-${++uid}`;
  const input = h('input', { type: 'range', id, min: String(o.min), max: String(o.max), step: String(o.step), value: String(o.value) });
  const out = h('output', { for: id });
  const sync = () => {
    const v = Number(input.value);
    out.textContent = o.format(v);
    input.setAttribute('aria-valuetext', o.format(v));
  };
  input.addEventListener('input', () => { sync(); o.onInput(Number(input.value)); });
  sync();
  const el = h('div', { class: 'ex-slider' }, h('label', { for: id }, o.label), out, input);
  return { el, get value() { return Number(input.value); }, set(v: number) { input.value = String(v); sync(); } };
}

/** A small set of mutually exclusive choices (radio buttons styled as a segmented control). */
export function toggle<V extends string>(o: { label: string; options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const name = `ex-${++uid}`;
  const fs = h('fieldset', { class: 'ex-toggle' }, h('legend', {}, o.label));
  const inputs = o.options.map((opt) => {
    const input = h('input', { type: 'radio', name, value: opt.value });
    if (opt.value === o.value) input.checked = true;
    input.addEventListener('change', () => input.checked && o.onChange(opt.value));
    fs.append(h('label', {}, input, h('span', {}, opt.label)));
    return input;
  });
  return { el: fs, set(v: V) { inputs.forEach((i) => { i.checked = i.value === v; }); } };
}

export function button(label: string, onClick: () => void, cls = 'btn') {
  const b = h('button', { type: 'button', class: cls }, label);
  b.addEventListener('click', onClick);
  return b;
}

/** A labelled big number. */
export function readout(label: string, cls = '') {
  const value = h('strong', {});
  const el = h('div', { class: `ex-readout ${cls}` }, value, h('span', {}, label));
  return { el, set(text: string) { value.textContent = text; } };
}

/** Standard layout: controls on one side, picture and readouts on the other. */
export function layout(root: HTMLElement) {
  const controls = h('div', { class: 'ex-controls' });
  const stage = h('div', { class: 'ex-stage' });
  const readouts = h('div', { class: 'ex-readouts', 'aria-live': 'polite' });
  root.append(controls, h('div', { class: 'ex-main' }, stage, readouts));
  return { controls, stage, readouts };
}

// ---- SVG -----------------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (Node | string)[]) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}
export function svg(w: number, hgt: number, label: string) {
  return s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'ex-svg', role: 'img', 'aria-label': label });
}

export type Series = { points: [number, number][]; cls: string; label?: string; dash?: boolean };
/** A simple line chart: axes, gridlines, labelled ticks, one or more series. */
export function lineChart(o: { width?: number; height?: number; series: Series[]; x: [number, number]; y: [number, number];
  xTicks: number[]; yTicks: number[]; xFmt: (v: number) => string; yFmt: (v: number) => string; label: string; xLabel?: string }) {
  const W = o.width ?? 560, H = o.height ?? 300, m = { l: 58, r: 14, t: 12, b: o.xLabel ? 44 : 30 };
  const X = (v: number) => m.l + ((v - o.x[0]) / (o.x[1] - o.x[0] || 1)) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - ((v - o.y[0]) / (o.y[1] - o.y[0] || 1)) * (H - m.t - m.b);
  const g = svg(W, H, o.label);
  for (const t of o.yTicks) {
    g.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'ex-grid' }));
    g.append(s('text', { x: m.l - 8, y: Y(t) + 4, class: 'ex-tick', 'text-anchor': 'end' }, o.yFmt(t)));
  }
  for (const t of o.xTicks) g.append(s('text', { x: X(t), y: H - m.b + 18, class: 'ex-tick', 'text-anchor': 'middle' }, o.xFmt(t)));
  if (o.xLabel) g.append(s('text', { x: (m.l + W - m.r) / 2, y: H - 6, class: 'ex-tick', 'text-anchor': 'middle' }, o.xLabel));
  g.append(s('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'ex-axis' }));
  for (const se of o.series) {
    const d = se.points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Math.max(o.y[0], Math.min(o.y[1], y))).toFixed(1)}`).join('');
    g.append(s('path', { d, class: `ex-line ${se.cls}`, ...(se.dash ? { 'stroke-dasharray': '6 5' } : {}) }));
  }
  return { el: g, X, Y };
}

/** Nice round ticks for a range. */
export function ticks(max: number, n = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / n, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= raw)!;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** A data table alternative for a chart (screen readers, and anyone who prefers numbers). */
export function table(caption: string, head: string[], rows: (string | number)[][]) {
  const t = h('table', { class: 'ex-table' }, h('caption', {}, caption),
    h('thead', {}, h('tr', {}, ...head.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, String(c)))))));
  return h('details', { class: 'ex-data' }, h('summary', {}, T({ en: 'Show the numbers', bg: 'Покажи числата' })), t);
}

// Ch. 006, Figure 6.5: two invented groups (as in the book's figure). Within each group the
// relationship slopes down; the gap between the groups can make the pooled data slope up.
import { T, num, slider, toggle, readout, layout, svg, s, type Explorable } from './kit';

const D = { gap: 4, show: 'pooled' as 'pooled' | 'groups' };
// Invented, fixed points (a seeded generator, so every reader sees the same picture).
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const base = (() => { const r = rng(7); return Array.from({ length: 30 }, () => { const x = r() * 4; return [x, 5 - 0.7 * x + (r() - 0.5) * 1.6]; }); })();

function corr(pts: number[][]) {
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx, mx, my };
}

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let gap = D.gap, show = D.show;
  const rAll = readout(T({ en: 'correlation, everyone together', bg: 'корелация, всички заедно' }), 'is-key');
  const rIn = readout(T({ en: 'correlation within each group', bg: 'корелация във всяка група' }));
  readouts.append(rAll.el, rIn.el);
  const draw = () => {
    const g1 = base.map(([x, y]) => [x, y]), g2 = base.map(([x, y]) => [x + gap, y + gap * 1.2]);
    const all = [...g1, ...g2];
    const W = 460, H = 320, m = 34, maxX = 4 + 8, maxY = 6 + 8 * 1.2;
    const X = (v: number) => m + (v / maxX) * (W - 2 * m), Y = (v: number) => H - m - (v / maxY) * (H - 2 * m);
    const g = svg(W, H, T({ en: 'Scatterplot of two invented groups', bg: 'Точкова диаграма на две измислени групи' }));
    g.append(s('line', { x1: m, x2: W - m, y1: H - m, y2: H - m, class: 'ex-axis' }), s('line', { x1: m, x2: m, y1: m, y2: H - m, class: 'ex-axis' }));
    const fit = (pts: number[][], cls: string) => {
      const c = corr(pts), xs = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
      g.append(s('path', { d: xs.map((x, i) => `${i ? 'L' : 'M'}${X(x)},${Y(c.my + c.slope * (x - c.mx))}`).join(''), class: `ex-line ${cls}` }));
      return c.r;
    };
    for (const [pts, cls] of [[g1, 'is-a'], [g2, 'is-b']] as const) {
      for (const [x, y] of pts) g.append(s('circle', { cx: X(x), cy: Y(y), r: 4.5, class: `ex-point ${show === 'groups' ? cls : ''}` }));
    }
    const rAllV = fit(all, show === 'groups' ? 'is-muted' : 'is-main');
    let rInV = corr(g1).r;
    if (show === 'groups') { rInV = fit(g1, 'is-a'); fit(g2, 'is-b'); }
    stage.replaceChildren(g);
    rAll.set(num(rAllV, 2));
    rIn.set(num(rInV, 2));
  };
  const sGap = slider({ label: T({ en: 'How far apart the groups sit', bg: 'Колко отдалечени са групите' }), min: 0, max: 8, step: 0.5, value: gap,
    format: (v) => num(v, 1), onInput: (v) => { gap = v; draw(); } });
  const tShow = toggle({ label: T({ en: 'Show', bg: 'Покажи' }), value: show,
    options: [{ value: 'pooled', label: T({ en: 'Everyone together', bg: 'Всички заедно' }) }, { value: 'groups', label: T({ en: 'The two groups', bg: 'Двете групи' }) }],
    onChange: (v) => { show = v; draw(); } });
  controls.append(sGap.el, tShow.el);
  draw();
  return { reset() { gap = D.gap; show = D.show; sGap.set(gap); tShow.set(show); draw(); } };
}

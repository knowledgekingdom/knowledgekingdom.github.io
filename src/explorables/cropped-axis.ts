// Ch. 006, Figure 6.3: two values, 95 and 100 (book). Move the axis start; bars or a line.
import { T, num, pct, slider, toggle, readout, layout, svg, s, type Explorable } from './kit';

const A = 95, B = 100, D = { start: 0, kind: 'bar' as 'bar' | 'line' };

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let start = D.start, kind = D.kind;
  const rReal = readout(T({ en: 'real difference', bg: 'реална разлика' }));
  const rSeen = readout(T({ en: 'how much taller B looks', bg: 'колко по-висок изглежда Б' }), 'is-key');
  readouts.append(rSeen.el, rReal.el);
  const draw = () => {
    const W = 420, H = 300, m = { l: 48, b: 34, t: 14 }, top = 101;
    const Y = (v: number) => H - m.b - ((v - start) / (top - start)) * (H - m.b - m.t);
    const g = svg(W, H, T({ en: `Values ${A} and ${B}, axis starting at ${start}`, bg: `Стойности ${A} и ${B}, оста започва от ${start}` }));
    for (const v of [start, ...[25, 50, 75, 95, 100].filter((x) => x > start)]) {
      g.append(s('line', { x1: m.l, x2: W - 10, y1: Y(v), y2: Y(v), class: 'ex-grid' }));
      g.append(s('text', { x: m.l - 8, y: Y(v) + 4, class: 'ex-tick', 'text-anchor': 'end' }, num(v)));
    }
    const xs = [m.l + 70, m.l + 230];
    if (kind === 'bar') {
      [A, B].forEach((v, i) => g.append(s('rect', { x: xs[i], y: Y(v), width: 90, height: Y(start) - Y(v), class: i ? 'ex-bar is-main' : 'ex-bar' })));
    } else {
      g.append(s('path', { d: `M${xs[0] + 45},${Y(A)} L${xs[1] + 45},${Y(B)}`, class: 'ex-line is-main' }));
      [A, B].forEach((v, i) => g.append(s('circle', { cx: xs[i] + 45, cy: Y(v), r: 6, class: 'ex-point' })));
    }
    ['A', 'B'].forEach((l, i) => g.append(s('text', { x: xs[i] + 45, y: H - 10, class: 'ex-tick', 'text-anchor': 'middle' }, `${l}: ${[A, B][i]}`)));
    g.append(s('line', { x1: m.l, x2: W - 10, y1: Y(start), y2: Y(start), class: 'ex-axis' }));
    stage.replaceChildren(g);
    rReal.set(`+${pct(B / A - 1)}`);
    rSeen.set(kind === 'bar' ? `${num((B - start) / (A - start), 1)}×` : T({ en: 'steep rise', bg: 'стръмен ръст' }));
    if (kind === 'line') rSeen.set(`${num((B - start) / (A - start), 1)}×`);
  };
  const sStart = slider({ label: T({ en: 'Vertical axis starts at', bg: 'Вертикалната ос започва от' }), min: 0, max: 94, step: 1, value: start,
    format: (v) => num(v), onInput: (v) => { start = v; draw(); } });
  const tKind = toggle({ label: T({ en: 'Chart type', bg: 'Вид графика' }), value: kind,
    options: [{ value: 'bar', label: T({ en: 'Bars', bg: 'Стълбове' }) }, { value: 'line', label: T({ en: 'Line', bg: 'Линия' }) }],
    onChange: (v) => { kind = v; draw(); } });
  controls.append(sStart.el, tKind.el);
  draw();
  return { reset() { start = D.start; kind = D.kind; sStart.set(start); tKind.set(kind); draw(); } };
}

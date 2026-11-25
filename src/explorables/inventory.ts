// Ch. 007, Figure 7.4: the book's fictional shop (target 100 boxes, starts with 50, five-day
// delivery delay, orders the whole gap each day). Sales per day are an illustrative choice: the
// book only says "after some sales". Step-by-step simulation over 60 days.
import { T, num, slider, toggle, readout, layout, lineChart, ticks, table, h, type Explorable } from './kit';

const TARGET = 100, START = 50, DAYS = 60;
const D = { delay: 5, strength: 100, count: 'no' as 'no' | 'yes', sales: 10 };

export function simulate(delay: number, k: number, countPipeline: boolean, sales: number) {
  let stock = START;
  const pipeline: number[] = new Array(DAYS + delay + 1).fill(0);
  const out: { day: number; stock: number; onOrder: number; order: number }[] = [];
  for (let d = 0; d < DAYS; d++) {
    stock += pipeline[d];
    stock -= Math.min(stock, sales);
    const onOrder = pipeline.slice(d + 1).reduce((a, b) => a + b, 0);
    const gap = TARGET - stock - (countPipeline ? onOrder : 0);
    const order = Math.max(0, Math.round(gap * k));
    pipeline[d + delay] += order;
    out.push({ day: d, stock, onOrder: onOrder + order, order });
  }
  return out;
}

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let { delay, strength, count, sales } = D;
  const rHi = readout(T({ en: 'most boxes in stock', bg: 'най-много кашони на склад' }), 'is-key');
  const rLo = readout(T({ en: 'fewest boxes in stock', bg: 'най-малко кашони на склад' }));
  const rPipe = readout(T({ en: 'most boxes on their way', bg: 'най-много кашони на път' }));
  const data = h('div');
  readouts.append(rHi.el, rLo.el, rPipe.el, data);
  const draw = () => {
    const sim = simulate(delay, strength / 100, count === 'yes', sales);
    const max = Math.max(TARGET, ...sim.map((x) => x.stock)) * 1.1;
    const c = lineChart({ series: [{ points: [[0, TARGET], [DAYS - 1, TARGET]], cls: 'is-muted', dash: true },
      { points: sim.map((x) => [x.day, x.stock]), cls: 'is-main' }], x: [0, DAYS - 1], y: [0, max],
      xTicks: ticks(DAYS, 6), yTicks: ticks(max, 4), xFmt: (v) => num(v), yFmt: (v) => num(v),
      label: T({ en: 'Boxes in stock each day; the dashed line is the target of 100', bg: 'Кашони на склад всеки ден; пунктирът е целта от 100' }),
      xLabel: T({ en: 'days', bg: 'дни' }) });
    stage.replaceChildren(c.el);
    rHi.set(num(Math.max(...sim.map((x) => x.stock))));
    rLo.set(num(Math.min(...sim.slice(1).map((x) => x.stock))));
    rPipe.set(num(Math.max(...sim.map((x) => x.onOrder))));
    data.replaceChildren(table(T({ en: 'First 20 days', bg: 'Първите 20 дни' }),
      [T({ en: 'day', bg: 'ден' }), T({ en: 'in stock', bg: 'на склад' }), T({ en: 'ordered', bg: 'поръчани' }), T({ en: 'on the way', bg: 'на път' })],
      sim.slice(0, 20).map((x) => [x.day + 1, x.stock, x.order, x.onOrder])));
  };
  const sDelay = slider({ label: T({ en: 'Delivery delay', bg: 'Забавяне на доставката' }), min: 1, max: 10, step: 1, value: delay,
    format: (v) => `${num(v)} ${T({ en: v === 1 ? 'day' : 'days', bg: v === 1 ? 'ден' : 'дни' })}`, onInput: (v) => { delay = v; draw(); } });
  const sStr = slider({ label: T({ en: 'Share of the gap ordered each day', bg: 'Част от разликата, поръчвана всеки ден' }), min: 10, max: 100, step: 10, value: strength,
    format: (v) => `${num(v)}%`, onInput: (v) => { strength = v; draw(); } });
  const tCount = toggle({ label: T({ en: 'Counts boxes already ordered?', bg: 'Брои ли вече поръчаните?' }), value: count,
    options: [{ value: 'no', label: T({ en: 'No', bg: 'Не' }) }, { value: 'yes', label: T({ en: 'Yes', bg: 'Да' }) }],
    onChange: (v) => { count = v; draw(); } });
  const sSales = slider({ label: T({ en: 'Boxes sold per day (illustrative)', bg: 'Продадени кашони на ден (примерно)' }), min: 0, max: 30, step: 1, value: sales,
    format: (v) => num(v), onInput: (v) => { sales = v; draw(); } });
  controls.append(sDelay.el, sStr.el, tCount.el, sSales.el);
  draw();
  return { reset() { ({ delay, strength, count, sales } = D); sDelay.set(delay); sStr.set(strength); tCount.set(count); sSales.set(sales); draw(); } };
}

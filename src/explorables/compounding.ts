// Ch. 003, Figure 3.7: €1,000 at a yearly rate, compound vs the same rate applied to the start only.
// Book defaults: 5% for 10 years → about €1,628.89. Rule of 72 shown next to the exact doubling time.
import { T, num, money, slider, readout, layout, lineChart, ticks, table, h, type Explorable } from './kit';

const START = 1000, D = { rate: 5, years: 10, add: 0 };

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let rate = D.rate, years = D.years, add = D.add;
  const rC = readout(T({ en: 'with compounding', bg: 'със сложна лихва' }), 'is-key');
  const rS = readout(T({ en: 'rate on the start only', bg: 'процент само върху началото' }));
  const r72 = readout(T({ en: 'to double: rule of 72 (exact)', bg: 'за удвояване: правило на 72 (точно)' }));
  readouts.append(rC.el, rS.el, r72.el);
  const data = h('div');
  const draw = () => {
    const r = rate / 100;
    const comp: [number, number][] = [], simple: [number, number][] = [];
    let b = START;
    for (let y = 0; y <= years; y++) {
      if (y > 0) b = b * (1 + r) + add;
      comp.push([y, b]);
      simple.push([y, START + START * r * y + add * y]);
    }
    const max = Math.max(comp.at(-1)![1], simple.at(-1)![1]) * 1.05;
    const c = lineChart({ series: [{ points: simple, cls: 'is-muted', dash: true }, { points: comp, cls: 'is-main' }],
      x: [0, years], y: [0, max], xTicks: ticks(years, 5), yTicks: ticks(max, 4), xFmt: (v) => num(v), yFmt: (v) => `€${num(v)}`,
      label: T({ en: `Balance over ${years} years`, bg: `Салдо за ${years} години` }), xLabel: T({ en: 'years', bg: 'години' }) });
    stage.replaceChildren(c.el);
    rC.set(money(comp.at(-1)![1]));
    rS.set(money(simple.at(-1)![1]));
    r72.set(r > 0 ? `${num(72 / rate, 1)} (${num(Math.log(2) / Math.log(1 + r), 1)}) ${T({ en: 'yrs', bg: 'г.' })}` : '—');
    data.replaceChildren(table(T({ en: 'Balance by year', bg: 'Салдо по години' }), [T({ en: 'year', bg: 'година' }),
      T({ en: 'compound', bg: 'сложна' }), T({ en: 'start only', bg: 'само началото' })],
      comp.map(([y, v], i) => [y, money(v), money(simple[i][1])])));
  };
  readouts.append(data);
  const sR = slider({ label: T({ en: 'Yearly rate', bg: 'Годишен процент' }), min: 0, max: 12, step: 0.5, value: rate,
    format: (v) => `${num(v, 1)}%`, onInput: (v) => { rate = v; draw(); } });
  const sY = slider({ label: T({ en: 'Years', bg: 'Години' }), min: 1, max: 40, step: 1, value: years,
    format: (v) => num(v), onInput: (v) => { years = v; draw(); } });
  const sA = slider({ label: T({ en: 'Added each year', bg: 'Добавяни всяка година' }), min: 0, max: 500, step: 50, value: add,
    format: (v) => money(v, 0), onInput: (v) => { add = v; draw(); } });
  controls.append(h('p', { class: 'ex-fixed' }, T({ en: 'Start: €1,000', bg: 'Начало: 1000 €' })), sR.el, sY.el, sA.el);
  draw();
  return { reset() { rate = D.rate; years = D.years; add = D.add; sR.set(rate); sY.set(years); sA.set(add); draw(); } };
}

// Ch. 022, Figure 22.4: 8,000 riders × 3 horses = 24,000 horses; at 7 kg of forage each, 168 tonnes
// a day (book's hypothetical arithmetic, not a reconstruction of a specific army).
import { T, num, slider, readout, layout, svg, s, type Explorable } from './kit';

const D = { riders: 8000, horses: 3, kg: 7, days: 1 };
const MAX_SQUARES = 600;

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let { riders, horses, kg, days } = D;
  const rH = readout(T({ en: 'horses', bg: 'коня' }));
  const rDay = readout(T({ en: 'tonnes of forage a day', bg: 'тона фураж на ден' }), 'is-key');
  const rAll = readout(T({ en: 'tonnes over the whole period', bg: 'тона за целия период' }));
  readouts.append(rDay.el, rH.el, rAll.el);
  const draw = () => {
    const n = riders * horses, perDay = (n * kg) / 1000, total = perDay * days;
    rH.set(num(n)); rDay.set(num(perDay, perDay % 1 ? 1 : 0)); rAll.set(num(total));
    // One square per tonne needed each day.
    const sq = Math.min(Math.round(perDay), MAX_SQUARES), cols = 30, size = 16;
    const g = svg(cols * size, Math.max(1, Math.ceil(sq / cols)) * size + (perDay > MAX_SQUARES ? 22 : 0),
      T({ en: `${num(perDay)} squares, one per tonne of forage needed each day`, bg: `${num(perDay)} квадрата, по един за всеки тон фураж на ден` }));
    for (let i = 0; i < sq; i++) g.append(s('rect', { x: (i % cols) * size + 1, y: Math.floor(i / cols) * size + 1, width: size - 3, height: size - 3, rx: 2, class: 'ex-ton' }));
    if (perDay > MAX_SQUARES) g.append(s('text', { x: 0, y: Math.ceil(sq / cols) * size + 16, class: 'ex-tick' }, `+ ${num(perDay - MAX_SQUARES)} …`));
    stage.replaceChildren(g);
  };
  const sR = slider({ label: T({ en: 'Riders', bg: 'Ездачи' }), min: 1000, max: 50000, step: 1000, value: riders, format: (v) => num(v), onInput: (v) => { riders = v; draw(); } });
  const sH = slider({ label: T({ en: 'Horses per rider', bg: 'Коне на ездач' }), min: 1, max: 6, step: 1, value: horses, format: (v) => num(v), onInput: (v) => { horses = v; draw(); } });
  const sK = slider({ label: T({ en: 'Forage per horse per day', bg: 'Фураж на кон на ден' }), min: 3, max: 12, step: 0.5, value: kg, format: (v) => `${num(v, 1)} kg`, onInput: (v) => { kg = v; draw(); } });
  const sD = slider({ label: T({ en: 'Days on the move', bg: 'Дни в поход' }), min: 1, max: 60, step: 1, value: days, format: (v) => num(v), onInput: (v) => { days = v; draw(); } });
  controls.append(sR.el, sH.el, sK.el, sD.el);
  draw();
  return { reset() { ({ riders, horses, kg, days } = D); sR.set(riders); sH.set(horses); sK.set(kg); sD.set(days); draw(); } };
}

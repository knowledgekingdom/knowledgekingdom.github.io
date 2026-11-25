// Ch. 021, Figure 21.13: a shipment bought for 200 units, 30 more in transport, a 10% chance of
// losing everything, a sale price of 280: expected gain 22 units (book). Plus the chance that at
// least one of several voyages ends in total loss.
import { T, num, pct, slider, readout, layout, h, type Explorable } from './kit';

const D = { buy: 200, costs: 30, price: 280, loss: 10, voyages: 1 };
const u = (v: number) => `${num(v)} ${T({ en: 'units', bg: 'ед.' })}`;

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let { buy, costs, price, loss, voyages } = D;
  const rGain = readout(T({ en: 'expected gain per voyage', bg: 'очаквана печалба на плаване' }), 'is-key');
  const rAll = readout(T({ en: 'expected over all voyages', bg: 'очаквано за всички плавания' }));
  const rRuin = readout(T({ en: 'chance of at least one total loss', bg: 'шанс поне веднъж да се загуби всичко' }));
  readouts.append(rGain.el, rAll.el, rRuin.el);
  const sum = h('p', { class: 'ex-calc' });
  stage.append(sum);
  const draw = () => {
    const paid = buy + costs, p = loss / 100, receipt = (1 - p) * price, gain = receipt - paid;
    sum.innerHTML = '';
    sum.append(T({ en: `Expected receipt: ${num(1 - p, 2)} × ${num(price)} = ${num(receipt, 1)}; paid: ${num(buy)} + ${num(costs)} = ${num(paid)}; worst case: lose ${num(paid)}.`,
      bg: `Очакван приход: ${num(1 - p, 2)} × ${num(price)} = ${num(receipt, 1)}; платено: ${num(buy)} + ${num(costs)} = ${num(paid)}; най-лошият случай: загуба на ${num(paid)}.` }));
    rGain.set(`${gain >= 0 ? '+' : '−'}${u(Math.abs(Math.round(gain * 10) / 10))}`);
    rAll.set(`${gain >= 0 ? '+' : '−'}${u(Math.abs(Math.round(gain * voyages)))}`);
    rRuin.set(pct(1 - (1 - p) ** voyages, 0));
  };
  const sl = (label: { en: string; bg: string }, min: number, max: number, step: number, value: number, fmt: (v: number) => string, set: (v: number) => void) =>
    slider({ label: T(label), min, max, step, value, format: fmt, onInput: (v) => { set(v); draw(); } });
  const sBuy = sl({ en: 'Purchase price', bg: 'Покупна цена' }, 100, 400, 10, buy, u, (v) => { buy = v; });
  const sCost = sl({ en: 'Transport, animals and tolls', bg: 'Транспорт, животни и мита' }, 0, 100, 5, costs, u, (v) => { costs = v; });
  const sPrice = sl({ en: 'Sale price if it arrives', bg: 'Продажна цена, ако пристигне' }, 150, 500, 10, price, u, (v) => { price = v; });
  const sLoss = sl({ en: 'Chance the whole shipment is lost', bg: 'Шанс цялата пратка да се загуби' }, 0, 50, 1, loss, (v) => pct(v / 100, 0), (v) => { loss = v; });
  const sVoy = sl({ en: 'Voyages', bg: 'Плавания' }, 1, 20, 1, voyages, (v) => num(v), (v) => { voyages = v; });
  controls.append(sBuy.el, sCost.el, sPrice.el, sLoss.el, sVoy.el);
  draw();
  return { reset() { ({ buy, costs, price, loss, voyages } = D); sBuy.set(buy); sCost.set(costs); sPrice.set(price); sLoss.set(loss); sVoy.set(voyages); draw(); } };
}

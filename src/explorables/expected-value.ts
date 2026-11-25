// Ch. 003, Figure 3.4: option A, a certain €6, against option B, 25% to gain €30 and 75% to lose €2
// (expected €6). Play B once or many times and watch the running average approach the expectation.
import { T, num, pct, money, slider, readout, layout, lineChart, ticks, button, h, type Explorable } from './kit';

const D = { p: 25, win: 30, loss: 2 };

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let p = D.p, win = D.win, loss = D.loss;
  let plays: number[] = [];
  const ev = () => (p / 100) * win - (1 - p / 100) * loss;
  const rEv = readout(T({ en: 'expected value of B (A: a certain €6)', bg: 'очаквана стойност на Б (А: сигурни 6 €)' }), 'is-key');
  const rAvg = readout(T({ en: 'your average so far', bg: 'вашето средно досега' }));
  const rLost = readout(T({ en: 'plays that lost money', bg: 'игри със загуба' }));
  const last = h('p', { class: 'ex-note', 'aria-live': 'polite' });
  readouts.append(rEv.el, rAvg.el, rLost.el, last);
  const draw = () => {
    rEv.set(money(ev()));
    const n = plays.length, total = plays.reduce((a, b) => a + b, 0);
    rAvg.set(n ? `${money(total / n)} (${num(n)}×)` : '—');
    rLost.set(n ? pct(plays.filter((x) => x < 0).length / n, 0) : '—');
    let run = 0;
    const pts: [number, number][] = plays.map((x, i) => { run += x; return [i + 1, run / (i + 1)]; });
    const lo = Math.min(-loss, ev(), 0) - 1, hi = Math.max(win, ev()) + 1;
    const c = lineChart({ series: [{ points: [[0, ev()], [Math.max(n, 10), ev()]], cls: 'is-muted', dash: true },
      { points: pts.length ? [[0, pts[0][1]], ...pts] : [], cls: 'is-main' }],
      x: [0, Math.max(n, 10)], y: [lo, hi], xTicks: ticks(Math.max(n, 10), 4), yTicks: [lo, 0, ev(), hi].map((v) => Math.round(v)),
      xFmt: (v) => num(v), yFmt: (v) => `€${num(v)}`, label: T({ en: 'Running average of your plays against the expected value',
        bg: 'Текущото средно на игрите ви спрямо очакваната стойност' }), xLabel: T({ en: 'plays', bg: 'игри' }) });
    stage.replaceChildren(c.el);
  };
  const play = (k: number) => {
    for (let i = 0; i < k; i++) plays.push(Math.random() < p / 100 ? win : -loss);
    const x = plays.at(-1)!;
    last.textContent = k === 1 ? T({ en: `This play: ${x > 0 ? '+' : ''}${money(x, 0)}`, bg: `Тази игра: ${x > 0 ? '+' : ''}${money(x, 0)}` }) : '';
    draw();
  };
  const sP = slider({ label: T({ en: 'Chance of the gain', bg: 'Шанс за печалбата' }), min: 5, max: 95, step: 5, value: p,
    format: (v) => pct(v / 100, 0), onInput: (v) => { p = v; plays = []; last.textContent = ''; draw(); } });
  const sW = slider({ label: T({ en: 'Gain', bg: 'Печалба' }), min: 0, max: 60, step: 1, value: win,
    format: (v) => money(v, 0), onInput: (v) => { win = v; plays = []; draw(); } });
  const sL = slider({ label: T({ en: 'Loss otherwise', bg: 'Загуба иначе' }), min: 0, max: 20, step: 1, value: loss,
    format: (v) => money(v, 0), onInput: (v) => { loss = v; plays = []; draw(); } });
  controls.append(sP.el, sW.el, sL.el, h('div', { class: 'ex-buttons' },
    button(T({ en: 'Play B once', bg: 'Изиграй Б веднъж' }), () => play(1), 'btn btn-primary'),
    button(T({ en: 'Play 100 times', bg: 'Изиграй 100 пъти' }), () => play(100))));
  draw();
  return { reset() { p = D.p; win = D.win; loss = D.loss; plays = []; last.textContent = ''; sP.set(p); sW.set(win); sL.set(loss); draw(); } };
}

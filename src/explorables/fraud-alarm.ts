// Ch. 003, Figure 3.2: 10,000 transactions as dots; base rate, detection rate and false-positive
// rate as sliders. Book defaults: 1% fraud, 90% caught, 5% of legitimate purchases flagged.
import { T, num, pct, slider, readout, layout, h, table, type Explorable } from './kit';

const N = 10_000, COLS = 100;
const D = { base: 1, sens: 90, fpr: 5 };

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let base = D.base, sens = D.sens, fpr = D.fpr;
  const canvas = h('canvas', { width: '600', height: '600', class: 'ex-dots', role: 'img' });
  const legend = h('ul', { class: 'ex-legend' });
  stage.append(canvas, legend);
  const rAlerts = readout(T({ en: 'transactions flagged', bg: 'маркирани трансакции' }));
  const rPpv = readout(T({ en: 'of alerts are real fraud', bg: 'от сигналите са истинска измама' }), 'is-key');
  const rCaught = readout(T({ en: 'frauds caught', bg: 'хванати измами' }));
  readouts.append(rPpv.el, rAlerts.el, rCaught.el);
  const data = h('div');
  readouts.append(data);

  const colors = () => {
    const cs = getComputedStyle(root);
    return { caught: cs.getPropertyValue('--accent').trim() || '#13707a', missed: cs.getPropertyValue('--ink').trim() || '#222',
      falseAlarm: '#d0782f', quiet: cs.getPropertyValue('--rule').trim() || '#ddd' };
  };
  const draw = () => {
    const frauds = Math.round(N * base / 100), legit = N - frauds;
    const caught = Math.round(frauds * sens / 100), missed = frauds - caught;
    const falseAlarms = Math.round(legit * fpr / 100), alerts = caught + falseAlarms;
    const c = canvas.getContext('2d')!, col = colors(), cell = 600 / COLS;
    c.clearRect(0, 0, 600, 600);
    // Order: caught frauds, missed frauds, false alarms, everyone else (blocks are easier to compare).
    const kinds: [number, string][] = [[caught, col.caught], [missed, col.missed], [falseAlarms, col.falseAlarm], [N - frauds - falseAlarms, col.quiet]];
    let i = 0;
    for (const [n, color] of kinds) {
      c.fillStyle = color;
      for (let k = 0; k < n; k++, i++) {
        const x = (i % COLS) * cell, y = Math.floor(i / COLS) * cell;
        c.beginPath(); c.arc(x + cell / 2, y + cell / 2, cell * 0.38, 0, Math.PI * 2); c.fill();
      }
    }
    const share = alerts ? caught / alerts : 0;
    rPpv.set(alerts ? pct(share) : '—');
    rAlerts.set(num(alerts));
    rCaught.set(`${num(caught)} / ${num(frauds)}`);
    canvas.setAttribute('aria-label', T({
      en: `${num(frauds)} frauds among 10,000 transactions; ${num(caught)} caught, ${num(falseAlarms)} legitimate purchases flagged. ${pct(share)} of alerts are fraud.`,
      bg: `${num(frauds)} измами сред 10 000 трансакции; хванати ${num(caught)}, маркирани ${num(falseAlarms)} законни покупки. ${pct(share)} от сигналите са измама.` }));
    legend.innerHTML = '';
    for (const [n, color, label] of [[caught, col.caught, T({ en: 'fraud, flagged', bg: 'измама, маркирана' })],
      [missed, col.missed, T({ en: 'fraud, missed', bg: 'измама, пропусната' })],
      [falseAlarms, col.falseAlarm, T({ en: 'legitimate, flagged by mistake', bg: 'законна, маркирана погрешно' })]] as const) {
      legend.append(h('li', {}, h('span', { class: 'ex-swatch', style: `background:${color}` }), `${label}: ${num(n)}`));
    }
    data.replaceChildren(table(T({ en: 'Counts out of 10,000 transactions', bg: 'Брой от 10 000 трансакции' }),
      ['', T({ en: 'flagged', bg: 'маркирани' }), T({ en: 'not flagged', bg: 'немаркирани' })],
      [[T({ en: 'fraud', bg: 'измама' }), num(caught), num(missed)], [T({ en: 'legitimate', bg: 'законни' }), num(falseAlarms), num(legit - falseAlarms)]]));
  };
  const sBase = slider({ label: T({ en: 'Fraud among all transactions (base rate)', bg: 'Измами сред всички трансакции (базова честота)' }),
    min: 0.1, max: 20, step: 0.1, value: base, format: (v) => pct(v / 100), onInput: (v) => { base = v; draw(); } });
  const sSens = slider({ label: T({ en: 'Frauds the detector catches', bg: 'Измами, които детекторът хваща' }),
    min: 50, max: 100, step: 1, value: sens, format: (v) => pct(v / 100, 0), onInput: (v) => { sens = v; draw(); } });
  const sFpr = slider({ label: T({ en: 'Legitimate purchases flagged by mistake', bg: 'Законни покупки, маркирани погрешно' }),
    min: 0, max: 20, step: 0.5, value: fpr, format: (v) => pct(v / 100), onInput: (v) => { fpr = v; draw(); } });
  controls.append(sBase.el, sSens.el, sFpr.el);
  draw();
  return { reset() { base = D.base; sens = D.sens; fpr = D.fpr; sBase.set(base); sSens.set(sens); sFpr.set(fpr); draw(); } };
}

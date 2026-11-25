// Ch. 015, Figure 15.7: a message over 750 km; a traveller at 30 km a day (25 days) against a relay
// network at 150 km a day (5 days). The book calls these a teaching calculation.
import { T, num, slider, readout, layout, button, svg, s, reducedMotion, h, type Explorable } from './kit';

const D = { dist: 750, walk: 30, relay: 150 };

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let { dist, walk, relay } = D;
  let timer = 0;
  const rW = readout(T({ en: 'days for a single traveller', bg: 'дни за един пътник' }));
  const rR = readout(T({ en: 'days for the relay', bg: 'дни за щафетата' }), 'is-key');
  const rD = readout(T({ en: 'days saved', bg: 'спестени дни' }));
  const day = h('p', { class: 'ex-note', 'aria-live': 'polite' });
  readouts.append(rR.el, rW.el, rD.el);
  const W = 520, Hh = 130, x0 = 20, x1 = W - 20;
  const g = svg(W, Hh, T({ en: 'Race between a traveller and a relay', bg: 'Надпревара между пътник и щафета' }));
  const lanes = [40, 95];
  for (const y of lanes) g.append(s('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'ex-grid' }));
  const labels = [s('text', { x: x0, y: 28, class: 'ex-tick' }, T({ en: 'Relay', bg: 'Щафета' })), s('text', { x: x0, y: 83, class: 'ex-tick' }, T({ en: 'Traveller', bg: 'Пътник' }))];
  const dots = lanes.map((y, i) => s('circle', { cx: x0, cy: y, r: 9, class: i ? 'ex-point' : 'ex-point is-main' }));
  g.append(...labels, ...dots, s('text', { x: x1, y: 122, class: 'ex-tick', 'text-anchor': 'end' }, ''));
  stage.append(g, day);
  const flag = g.lastElementChild!;
  const place = (d: number) => {
    const at = (speed: number) => x0 + Math.min(1, (speed * d) / dist) * (x1 - x0);
    dots[0].setAttribute('cx', String(at(relay)));
    dots[1].setAttribute('cx', String(at(walk)));
    day.textContent = T({ en: `Day ${num(Math.min(d, dist / walk), 0)}`, bg: `Ден ${num(Math.min(d, dist / walk), 0)}` });
  };
  const draw = () => {
    clearInterval(timer);
    const dw = dist / walk, dr = dist / relay;
    rW.set(num(dw, dw % 1 ? 1 : 0)); rR.set(num(dr, dr % 1 ? 1 : 0)); rD.set(num(dw - dr, (dw - dr) % 1 ? 1 : 0));
    flag.textContent = `${num(dist)} km`;
    place(0);
    day.textContent = '';
  };
  const race = () => {
    clearInterval(timer);
    const end = Math.ceil(dist / walk);
    if (reducedMotion()) { place(end); return; }
    let d = 0;
    timer = window.setInterval(() => { d += 0.25; place(d); if (d >= end) clearInterval(timer); }, 40);
  };
  const sDist = slider({ label: T({ en: 'Distance', bg: 'Разстояние' }), min: 100, max: 2000, step: 50, value: dist,
    format: (v) => `${num(v)} km`, onInput: (v) => { dist = v; draw(); } });
  const sWalk = slider({ label: T({ en: 'Traveller per day', bg: 'Пътник на ден' }), min: 10, max: 60, step: 5, value: walk,
    format: (v) => `${num(v)} km`, onInput: (v) => { walk = v; draw(); } });
  const sRelay = slider({ label: T({ en: 'Relay per day', bg: 'Щафета на ден' }), min: 50, max: 300, step: 10, value: relay,
    format: (v) => `${num(v)} km`, onInput: (v) => { relay = v; draw(); } });
  controls.append(sDist.el, sWalk.el, sRelay.el, h('div', { class: 'ex-buttons' }, button(T({ en: 'Start the race', bg: 'Пусни надпреварата' }), race, 'btn btn-primary')));
  draw();
  return { reset() { ({ dist, walk, relay } = D); sDist.set(dist); sWalk.set(walk); sRelay.set(relay); draw(); } };
}

// Ch. 007, Figure 7.3: a reinforcing loop (like interest added to a balance) against a balancing
// loop (closing part of the gap to a goal each step). Illustrative values, as in the figure.
import { T, num, slider, toggle, readout, layout, lineChart, ticks, svg, s, h, type Explorable } from './kit';

type Kind = 'R' | 'B';
const D = { kind: 'R' as Kind, strength: 10, goal: 100 };
const STEPS = 20;

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let kind = D.kind, strength = D.strength, goal = D.goal;
  const rEnd = readout(T({ en: 'after 20 steps', bg: 'след 20 стъпки' }), 'is-key');
  const rule = h('p', { class: 'ex-note' });
  readouts.append(rEnd.el, rule);
  const diagram = () => {
    const g = svg(220, 120, T({ en: kind === 'R' ? 'Reinforcing loop: two positive links' : 'Balancing loop: one negative link',
      bg: kind === 'R' ? 'Подсилващ кръг: две положителни връзки' : 'Балансиращ кръг: една отрицателна връзка' }));
    const a = kind === 'R' ? T({ en: 'balance', bg: 'салдо' }) : T({ en: 'level', bg: 'ниво' });
    const b = kind === 'R' ? T({ en: 'interest', bg: 'лихва' }) : T({ en: 'gap to goal', bg: 'разлика до целта' });
    g.append(s('text', { x: 40, y: 64, class: 'ex-node', 'text-anchor': 'middle' }, a), s('text', { x: 180, y: 64, class: 'ex-node', 'text-anchor': 'middle' }, b),
      s('path', { d: 'M70,40 C100,10 120,10 150,40', class: 'ex-arrow' }), s('path', { d: 'M150,84 C120,114 100,114 70,84', class: 'ex-arrow' }),
      s('text', { x: 110, y: 18, class: 'ex-sign', 'text-anchor': 'middle' }, '+'),
      s('text', { x: 110, y: 116, class: 'ex-sign', 'text-anchor': 'middle' }, kind === 'R' ? '+' : '−'),
      s('text', { x: 110, y: 68, class: 'ex-loop', 'text-anchor': 'middle' }, kind));
    return g;
  };
  const draw = () => {
    const k = strength / 100, pts: [number, number][] = [];
    let v = kind === 'R' ? 100 : 20;
    for (let t = 0; t <= STEPS; t++) { pts.push([t, v]); v = kind === 'R' ? v * (1 + k) : v + k * (goal - v); }
    const max = Math.max(...pts.map((p) => p[1]), goal) * 1.08;
    const c = lineChart({ series: [...(kind === 'B' ? [{ points: [[0, goal], [STEPS, goal]] as [number, number][], cls: 'is-muted', dash: true }] : []),
      { points: pts, cls: 'is-main' }], x: [0, STEPS], y: [0, max], xTicks: ticks(STEPS, 4), yTicks: ticks(max, 4),
      xFmt: (x) => num(x), yFmt: (y) => num(y), label: T({ en: 'Value over 20 steps', bg: 'Стойност за 20 стъпки' }), xLabel: T({ en: 'steps', bg: 'стъпки' }) });
    stage.replaceChildren(h('div', { class: 'ex-split' }, diagram(), c.el));
    rEnd.set(num(pts.at(-1)![1]));
    rule.textContent = kind === 'R'
      ? T({ en: 'Even number of negative links: reinforcing. Growth feeds more growth.', bg: 'Четен брой отрицателни връзки: подсилващ. Растежът храни още растеж.' })
      : T({ en: 'Odd number of negative links: balancing. Each step closes part of the gap to the goal.', bg: 'Нечетен брой отрицателни връзки: балансиращ. Всяка стъпка затваря част от разликата до целта.' });
    sGoal.el.hidden = kind === 'R';
  };
  const tKind = toggle({ label: T({ en: 'Loop', bg: 'Кръг' }), value: kind,
    options: [{ value: 'R', label: T({ en: 'Reinforcing', bg: 'Подсилващ' }) }, { value: 'B', label: T({ en: 'Balancing', bg: 'Балансиращ' }) }],
    onChange: (v) => { kind = v; draw(); } });
  const sStr = slider({ label: T({ en: 'Strength per step', bg: 'Сила на стъпка' }), min: 1, max: 60, step: 1, value: strength,
    format: (v) => `${num(v)}%`, onInput: (v) => { strength = v; draw(); } });
  const sGoal = slider({ label: T({ en: 'Goal', bg: 'Цел' }), min: 40, max: 160, step: 10, value: goal,
    format: (v) => num(v), onInput: (v) => { goal = v; draw(); } });
  controls.append(tKind.el, sStr.el, sGoal.el);
  draw();
  return { reset() { kind = D.kind; strength = D.strength; goal = D.goal; tKind.set(kind); sStr.set(strength); sGoal.set(goal); draw(); } };
}

// Ch. 003, small samples and streaks: a fair coin. Five heads in five flips has probability 1/32
// (book). How likely is a run of five or more heads somewhere in a longer sequence? Exact value by
// counting, plus your own flips.
import { T, num, pct, slider, readout, layout, button, h, type Explorable } from './kit';

const RUN = 5, D = { n: 5 };

/** Exact probability of at least one run of `k` heads in `n` fair flips. */
export function pRun(n: number, k: number): number {
  let st = new Array(k).fill(0); // st[j]: probability of no run yet and current run length j
  st[0] = 1;
  for (let i = 0; i < n; i++) {
    const next = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      next[0] += st[j] / 2;            // tails resets
      if (j + 1 < k) next[j + 1] += st[j] / 2; // heads extends (reaching k means a run happened)
    }
    st = next;
  }
  return 1 - st.reduce((a, b) => a + b, 0);
}

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let n = D.n, seqs = 0, withRun = 0;
  const rExact = readout(T({ en: `chance of ${RUN}+ heads in a row`, bg: `шанс за ${RUN}+ ези подред` }), 'is-key');
  const rMine = readout(T({ en: 'your sequences with such a run', bg: 'ваши поредици с такава серия' }));
  readouts.append(rExact.el, rMine.el);
  const flips = h('p', { class: 'ex-flips', 'aria-live': 'polite' });
  stage.append(flips);
  const draw = () => {
    rExact.set(`${pct(pRun(n, RUN))}${n === RUN ? ' (1/32)' : ''}`);
    rMine.set(seqs ? `${num(withRun)} / ${num(seqs)}` : '—');
  };
  const flip = (times: number) => {
    let last: boolean[] = [];
    for (let t = 0; t < times; t++) {
      last = Array.from({ length: n }, () => Math.random() < 0.5);
      let run = 0, best = 0;
      for (const hd of last) { run = hd ? run + 1 : 0; best = Math.max(best, run); }
      seqs++;
      if (best >= RUN) withRun++;
    }
    // Show the last sequence, marking runs of five or more.
    flips.replaceChildren();
    let i = 0;
    while (i < last.length) {
      let j = i;
      while (j < last.length && last[j] === last[i]) j++;
      const len = j - i, cls = last[i] && len >= RUN ? 'ex-coin is-run' : 'ex-coin';
      for (let k = i; k < j; k++) flips.append(h('span', { class: cls, 'aria-hidden': 'true' }, last[k] ? T({ en: 'H', bg: 'Е' }) : T({ en: 'T', bg: 'Т' })));
      i = j;
    }
    flips.setAttribute('aria-label', T({ en: `Last sequence of ${n} flips`, bg: `Последна поредица от ${n} хвърляния` }));
    draw();
  };
  const sN = slider({ label: T({ en: 'Flips in a sequence', bg: 'Хвърляния в поредица' }), min: 5, max: 200, step: 1, value: n,
    format: (v) => num(v), onInput: (v) => { n = v; seqs = 0; withRun = 0; flips.textContent = ''; draw(); } });
  controls.append(sN.el, h('div', { class: 'ex-buttons' },
    button(T({ en: 'Flip one sequence', bg: 'Хвърли една поредица' }), () => flip(1), 'btn btn-primary'),
    button(T({ en: 'Flip 1,000 sequences', bg: 'Хвърли 1000 поредици' }), () => flip(1000))));
  draw();
  return { reset() { n = D.n; seqs = 0; withRun = 0; flips.textContent = ''; sN.set(n); draw(); } };
}

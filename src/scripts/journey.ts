// Fills in /journey/ from the reader state (stats, best scores, earned seals).
import { store } from './reader';
import { progressFacts, type BookMeta } from '../lib/badges';

const root = document.querySelector<HTMLElement>('[data-journey]');
const metaEl = document.getElementById('kk-book');
if (root && metaEl) {
  const meta: BookMeta = JSON.parse(metaEl.textContent || '{"chapters":[]}');
  const S: Record<string, string> = JSON.parse(root.dataset.strings || '{}');
  const date = new Intl.DateTimeFormat(root.dataset.lang === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const render = () => {
    const s = store.state;
    const f = progressFacts(s, meta);
    const set = (k: string, v: number) => { root.querySelector(`[data-j="${k}"]`)!.textContent = v.toLocaleString(root.dataset.lang === 'bg' ? 'bg-BG' : 'en-GB'); };
    set('read', f.read); set('chapters', f.finished.length); set('reviews', f.reviews); set('mastered', f.mastered); set('streak', f.streak);
    const games = [['which-came-first', S.wf], ['five-in-order', `${S.wf}: ${S.order}`], ['fallacy-detective', S.fd]] as const;
    root.querySelector('[data-games]')!.innerHTML = games.filter(([id]) => s.games[id]?.played)
      .map(([id, name]) => `<li><span>${name}</span><strong>${s.games[id].best}</strong></li>`).join('') || '<li class="meta">—</li>';
    root.querySelectorAll<HTMLElement>('[data-badge]').forEach((li) => {
      const at = s.badges[li.dataset.badge!];
      li.classList.toggle('is-earned', Boolean(at));
      li.querySelector('[data-when]')!.textContent = at ? S.earned.replace('{date}', date.format(new Date(at * 1000))) : S.locked;
    });
  };
  render();
  store.subscribe(render);
}

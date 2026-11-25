// Fallacy Detective (v2 Phase 2.3): ten rounds, each a short argument with 3–4 named fallacies
// to choose from; feedback uses Chapter 002's own explanation and links to its section. At the
// end, a result card (drawn on a canvas) can be shared or saved.
import { store } from './reader';
import { bump } from '../lib/reader-state';
import { track } from '../lib/analytics';

type Round = { id: string; text: string; answer: string; options: string[]; fromBook: boolean };
type Fallacy = { name: string; explanation: string; url: string };
const root = document.querySelector<HTMLElement>('[data-fd]');
const ROUNDS = 10;

if (root && root.querySelector('[data-play]')) {
  const all: Round[] = JSON.parse(root.dataset.rounds || '[]');
  const F: Record<string, Fallacy> = JSON.parse(root.dataset.fallacies || '{}');
  const S: Record<string, string> = JSON.parse(root.dataset.strings || '{}');
  const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;

  let game: Round[] = [], i = 0, score = 0, answered = false;

  const start = () => {
    game = shuffle(all).slice(0, Math.min(ROUNDS, all.length));
    i = 0; score = 0;
    $('[data-result]').hidden = true;
    $('[data-play]').hidden = false;
    store.update((s) => bump(s, 'g'));
    track('game-play', 'fallacy-detective');
    show();
  };
  const show = () => {
    const r = game[i];
    answered = false;
    $('[data-progress]').textContent = fill(S.round, { i: i + 1, n: game.length });
    $('[data-argument]').textContent = r.text;
    $('[data-source]').hidden = !r.fromBook;
    $('[data-options]').innerHTML = shuffle([r.answer, ...r.options])
      .map((id) => `<button type="button" class="fd-option" data-option="${id}">${esc(F[id]?.name ?? id)}</button>`).join('');
    $('[data-feedback]').hidden = true;
    $<HTMLButtonElement>('[data-next]').hidden = true;
    $<HTMLButtonElement>('[data-option]').focus({ preventScroll: true });
  };
  $('[data-options]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-option]');
    if (!b || answered) return;
    answered = true;
    const r = game[i], right = b.dataset.option === r.answer, f = F[r.answer];
    if (right) score++;
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((x) => {
      x.disabled = true;
      if (x.dataset.option === r.answer) x.classList.add('is-right');
      else if (x === b) x.classList.add('is-wrong');
    });
    const fb = $('[data-feedback]');
    fb.innerHTML = `<p class="fd-verdict">${esc(fill(right ? S.right : S.wrong, { name: f.name }))}</p>`
      + `<p>${esc(f.explanation)}</p><p><a href="${esc(f.url)}">${esc(S.learn)}: ${esc(f.name)} →</a></p>`;
    fb.classList.toggle('is-right', right);
    fb.hidden = false;
    const next = $<HTMLButtonElement>('[data-next]');
    next.textContent = i + 1 < game.length ? S.next : S.finish;
    next.hidden = false;
    next.focus({ preventScroll: true });
  });
  $('[data-next]').addEventListener('click', () => {
    if (++i < game.length) { show(); return; }
    finish();
  });
  $('[data-again]').addEventListener('click', start);

  const finish = () => {
    $('[data-play]').hidden = true;
    $('[data-result]').hidden = false;
    $('[data-score]').textContent = fill(S.result, { n: score, total: game.length });
    store.update((s) => {
      const g = s.games['fallacy-detective'] ?? { played: 0, best: 0 };
      // Only full ten-round games count towards the best score (and the Detective seal).
      s.games['fallacy-detective'] = { played: g.played + 1, best: game.length >= ROUNDS ? Math.max(g.best, score) : g.best };
    });
    draw();
  };

  // ---- the result card -----------------------------------------------------------------------
  const canvas = $<HTMLCanvasElement>('[data-canvas]');
  const draw = async () => {
    await document.fonts.ready;
    const c = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--part-6').trim() || '#7b3a69';
    const serif = getComputedStyle(document.body).fontFamily;
    c.fillStyle = '#f7f3ea'; c.fillRect(0, 0, 1200, 630);
    c.fillStyle = accent; c.fillRect(0, 0, 1200, 12);
    c.fillStyle = accent; c.font = `600 26px ${serif}`; c.fillText(root.dataset.title!.toUpperCase(), 80, 110);
    c.fillStyle = '#1f2329'; c.font = `300 220px ${serif}`; c.fillText(`${score}/${game.length}`, 72, 360);
    c.font = `600 52px ${serif}`;
    const line = fill(S.result, { n: score, total: game.length });
    c.fillText(line.length > 40 ? line.slice(0, 40) + '…' : line, 80, 450);
    c.fillStyle = '#5f6369'; c.font = `600 30px ${serif}`; c.fillText('Knowledge Kingdom', 80, 560);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      $<HTMLAnchorElement>('[data-save]').href = url;
      const file = new File([blob], 'fallacy-detective.png', { type: 'image/png' });
      const shareBtn = $<HTMLButtonElement>('[data-share]');
      const text = `${fill(S.shareText, { n: score, total: game.length })} ${location.href}`;
      shareBtn.hidden = !('share' in navigator);
      shareBtn.onclick = () => {
        const data: ShareData = navigator.canShare?.({ files: [file] }) ? { files: [file], text } : { text, url: location.href };
        navigator.share(data).catch(() => {});
      };
    });
  };

  start();
}

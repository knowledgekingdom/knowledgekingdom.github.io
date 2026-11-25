// Listen mode (v2 Phase 1.5): reads the section aloud sentence by sentence, highlights the
// sentence being read (CSS Custom Highlight API, so the text itself is never changed), scrolls
// gently with it unless the reader is scrolling, and can carry on with the next section.
// Loaded only when the reader presses "Listen".
import { store } from './reader';
import { track } from '../lib/analytics';
import { webSpeech, type ListenEngine } from './listen-engine';

type Sentence = { range: Range; text: string };
const engine: ListenEngine = webSpeech;
const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
const S: Record<string, string> = JSON.parse(document.querySelector<HTMLElement>('[data-listen]')?.dataset.strings || '{}');
const RATES = [0.75, 1, 1.25, 1.5, 1.75];

/** Sentences of the section text, each with the Range it covers on the page. */
function sentences(): Sentence[] {
  const prose = document.querySelector<HTMLElement>('article .prose');
  if (!prose) return [];
  const title = document.querySelector<HTMLElement>('article h1');
  const blocks = [...(title ? [title] : []), ...prose.querySelectorAll<HTMLElement>(':scope > p, :scope > h2, :scope > h3, :scope > ul > li, :scope > ol > li, :scope > blockquote > p')];
  const seg = 'Segmenter' in Intl ? new Intl.Segmenter(lang, { granularity: 'sentence' }) : null;
  const out: Sentence[] = [];
  for (const block of blocks) {
    // Text nodes, skipping citation numbers and link buttons.
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('a.cite, .anchor-btn, .visually-hidden') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      nodes.push({ node: n, start: text.length });
      text += n.data;
    }
    const parts = seg ? [...seg.segment(text)].map((s) => ({ at: s.index, s: s.segment }))
      : text.split(/(?<=[.!?])\s+/).reduce<{ at: number; s: string }[]>((a, s) => {
        const at = a.length ? a[a.length - 1].at + a[a.length - 1].s.length : 0;
        a.push({ at: text.indexOf(s, at), s }); return a;
      }, []);
    for (const { at, s } of parts) {
      const spoken = s.replace(/\[\s*[\d,\s]*\]/g, '').replace(/\s+/g, ' ').trim();
      if (!/\p{L}/u.test(spoken)) continue;
      const lead = s.length - s.trimStart().length;
      const startAt = at + lead, endAt = at + s.trimEnd().length;
      const find = (pos: number) => {
        let i = nodes.length - 1;
        while (i > 0 && nodes[i].start > pos) i--;
        return { node: nodes[i].node, offset: Math.min(pos - nodes[i].start, nodes[i].node.length) };
      };
      const r = document.createRange();
      const a = find(startAt), b = find(endAt);
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      out.push({ range: r, text: spoken });
    }
  }
  return out;
}

const highlights = (CSS as any).highlights as Map<string, unknown> | undefined;
const Highlight = (window as any).Highlight;
const mark = (r: Range | null) => {
  if (!highlights || !Highlight) return;
  if (r) highlights.set('kk-listen', new Highlight(r)); else highlights.delete('kk-listen');
};

let userScrolledAt = 0;
for (const ev of ['wheel', 'touchmove', 'keydown']) addEventListener(ev, () => { userScrolledAt = performance.now(); }, { passive: true });
const follow = (r: Range) => {
  if (performance.now() - userScrolledAt < 4000) return; // the reader is looking elsewhere
  const rect = r.getBoundingClientRect();
  const bar = document.querySelector<HTMLElement>('.listen-bar')?.offsetHeight ?? 0;
  if (rect.top < 80 || rect.bottom > innerHeight - bar - 40) {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollBy({ top: rect.top - innerHeight * 0.35, behavior: calm ? 'instant' : 'smooth' });
  }
};

export async function openPlayer(autoplay: boolean) {
  if (document.querySelector('.listen-bar')) return;
  const list = sentences();
  const voices = await engine.voices(lang);
  if (!list.length || !voices.length) return;
  const settings = store.settings;
  let voice = voices.find((v) => v.id === settings.voice?.[lang])?.id ?? voices[0].id;
  let rate = settings.rate ?? 1;
  let i = 0, playing = false, run = 0;
  const nextHref = document.querySelector('link[rel="next"]')?.getAttribute('href');

  const bar = document.createElement('div');
  bar.className = 'listen-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', S.player ?? '');
  bar.innerHTML = `
    <button type="button" class="lb-play" data-act="play"></button>
    <span class="lb-status" aria-live="polite"></span>
    <label class="lb-field"><span>${S.speed ?? ''}</span>
      <select data-act="rate">${RATES.map((r) => `<option value="${r}">${String(r).replace('.', lang === 'bg' ? ',' : '.')}×</option>`).join('')}</select></label>
    <label class="lb-field lb-voice"><span>${S.voice ?? ''}</span>
      <select data-act="voice">${voices.map((v) => `<option value="${v.id.replace(/"/g, '&quot;')}">${v.name.replace(/</g, '&lt;')}</option>`).join('')}</select></label>
    ${nextHref ? `<label class="lb-check"><input type="checkbox" data-act="next"> <span>${S.next ?? ''}</span></label>` : ''}
    <button type="button" class="lb-close" data-act="close" aria-label="${S.close ?? ''}">×</button>`;
  document.body.append(bar);
  document.body.classList.add('is-listening');
  const play = bar.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const status = bar.querySelector<HTMLElement>('.lb-status')!;
  const rateSel = bar.querySelector<HTMLSelectElement>('[data-act="rate"]')!;
  const voiceSel = bar.querySelector<HTMLSelectElement>('[data-act="voice"]')!;
  const nextBox = bar.querySelector<HTMLInputElement>('[data-act="next"]');
  rateSel.value = String(RATES.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a)));
  voiceSel.value = voice;
  if (nextBox) nextBox.checked = Boolean(settings.autoNext);

  const render = () => {
    play.textContent = playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', playing ? S.pause ?? '' : S.play ?? '');
    status.textContent = (S.progress ?? '').replace('{i}', String(Math.min(i + 1, list.length))).replace('{n}', String(list.length));
  };

  const loop = async (token: number) => {
    while (token === run && i < list.length) {
      const s = list[i];
      mark(s.range);
      follow(s.range);
      render();
      try {
        await engine.speak(s.text, { voice, rate, lang });
      } catch (e) {
        if (token !== run) return;
        playing = false;
        render();
        if ((e as Error).message === 'not-allowed') { play.classList.add('is-waiting'); status.textContent = S.pressPlay ?? ''; }
        return;
      }
      if (token !== run) return;
      i++;
    }
    if (token !== run) return;
    playing = false;
    mark(null);
    render();
    if (i >= list.length && nextHref && nextBox?.checked) location.href = `${nextHref}#listen`;
  };
  const start = () => {
    play.classList.remove('is-waiting');
    if (i >= list.length) i = 0;
    playing = true;
    engine.stop();
    loop(++run);
    track('listen-start', lang);
  };
  const pauseNow = () => { playing = false; run++; engine.stop(); render(); };
  // A change of speed or voice applies from the current sentence.
  const restartIfPlaying = () => { if (playing) { run++; engine.stop(); playing = true; loop(++run); } };

  bar.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'play') (playing ? pauseNow() : start());
    if (act === 'close') { run++; engine.stop(); mark(null); bar.remove(); document.body.classList.remove('is-listening');
      document.querySelector<HTMLElement>('[data-listen]')?.focus(); }
  });
  rateSel.addEventListener('change', () => { rate = Number(rateSel.value); store.setSettings({ rate }); restartIfPlaying(); });
  voiceSel.addEventListener('change', () => {
    voice = voiceSel.value;
    store.setSettings({ voice: { ...store.settings.voice, [lang]: voice } });
    restartIfPlaying();
  });
  nextBox?.addEventListener('change', () => store.setSettings({ autoNext: nextBox.checked }));
  // Click a sentence while listening to jump there.
  document.querySelector('article .prose')?.addEventListener('dblclick', (e) => {
    const sel = document.caretRangeFromPoint?.((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    if (!sel) return;
    const j = list.findIndex((s) => s.range.comparePoint(sel.startContainer, sel.startOffset) === 0);
    if (j >= 0) { i = j; start(); }
  });
  addEventListener('pagehide', () => engine.stop());
  render();
  play.focus();
  if (autoplay) start();
}

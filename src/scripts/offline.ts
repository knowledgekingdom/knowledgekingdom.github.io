// Offline reading (v2 Phase 1.6): registers the service worker (public site only), and drives
// "Save this chapter for offline" on chapter pages and the saved list on the offline page.
const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';

const ask = <T = any>(msg: object, onProgress?: (d: any) => void): Promise<T> => new Promise((resolve, reject) => {
  const ctl = sw?.controller;
  if (!ctl) { reject(new Error('no worker')); return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    if (e.data.type === 'progress') onProgress?.(e.data);
    else if (e.data.type === 'error') reject(new Error(e.data.message));
    else resolve(e.data);
  };
  ctl.postMessage(msg, [ch.port2]);
});

sw?.register('/sw.js').catch(() => {}); // (no worker in `npm run dev`: that's fine)

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

// ---- Chapter page: save / remove ------------------------------------------------------------
const box = document.querySelector<HTMLElement>('[data-offline]');
if (box && sw) {
  const btn = box.querySelector<HTMLButtonElement>('button')!;
  const label = box.querySelector<HTMLElement>('[data-offline-label]')!;
  const S = box.dataset;
  const id = `${lang}:${S.chapter}`;
  const urls: string[] = JSON.parse(S.urls || '[]');
  let saved = false;
  const show = (text: string, busy = false) => { label.textContent = text; btn.disabled = busy; };
  const render = () => { btn.setAttribute('aria-pressed', String(saved)); show(saved ? S.labelSaved! : S.labelSave!); };
  sw.ready.then(async () => {
    box.hidden = false;
    // The worker controls the page only after its first load; wait for it if needed.
    if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
    const { list } = await ask<{ list: { id: string }[] }>({ type: 'saved-list' });
    saved = list.some((x) => x.id === id);
    render();
  });
  btn.addEventListener('click', async () => {
    try {
      if (saved) {
        await ask({ type: 'remove-chapter', id });
        saved = false;
      } else {
        show(fill(S.labelSaving!, { done: 0, total: urls.length }), true);
        await ask({ type: 'save-chapter', chapter: { id, urls, title: S.title } }, (d) => show(fill(S.labelSaving!, d), true));
        saved = true;
      }
      render();
    } catch {
      show(S.labelError!);
      btn.disabled = false;
    }
  });
}

// ---- Offline page: what's saved ------------------------------------------------------------
const list = document.querySelector<HTMLElement>('[data-offline-list]');
if (list && sw?.controller) {
  ask<{ list: { id: string; urls: string[]; title?: string }[] }>({ type: 'saved-list' }).then(({ list: saved }) => {
    const mine = saved.filter((x) => x.id.startsWith(`${lang}:`));
    const ul = list.querySelector('ul')!;
    for (const ch of mine) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = ch.urls[0];
      a.textContent = ch.title || ch.urls[0];
      li.append(a);
      ul.append(li);
    }
    list.hidden = mine.length === 0;
  }).catch(() => {});
}

export {};

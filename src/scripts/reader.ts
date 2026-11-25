// Connects the reader-state module to this browser. Import `store` from here in any
// client script; Astro bundles it once and shares it between scripts on the page.
import { createStore, STATE_KEY, SETTINGS_KEY, type KV } from '../lib/reader-state';
import redirects from '../data/redirects.json';

function browserStorage(): KV | null {
  try {
    const k = '__kk_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null; // private window or storage blocked: the site works, it just forgets
  }
}

const kv = browserStorage();

export const store = createStore(kv, {
  // Old addresses of renamed pages, so their read marks follow them.
  moved: Object.fromEntries((redirects as { from: string; to: string }[]).map((r) => [r.from, r.to])),
  keys: () => {
    const out: string[] = [];
    try { for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)!); } catch { /* ignore */ }
    return out;
  },
});

// Keep every open tab in step.
addEventListener('storage', (e) => {
  if (e.key === STATE_KEY || e.key === SETTINGS_KEY || e.key === null) store.reload();
});

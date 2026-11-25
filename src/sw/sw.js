// Knowledge Kingdom service worker (template: scripts/build-sw.mjs fills in the version and shell).
// - Pages: network first (always the latest edition when online), cached as they're read, so
//   recently read pages open offline. At most PAGE_LIMIT are kept; the oldest go first.
// - Styles, scripts, fonts, figures (/_astro/, content-hashed, never change): cache first.
// - "Save this chapter for offline": the chapter's pages and their figures go into a separate
//   cache that isn't trimmed. After a new edition is deployed, saved chapters are re-downloaded.
// - Search (Pagefind) needs the network.
const VERSION = '__VERSION__';
const SHELL = [/*__SHELL__*/];
const C = { shell: `kk-shell-${VERSION}`, pages: `kk-pages-${VERSION}`, assets: `kk-assets-${VERSION}`, saved: `kk-saved-${VERSION}` };
const PAGE_LIMIT = 150;
const ASSET_LIMIT = 500;
const SAVED_LIST = '/__kk-saved-chapters.json';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(C.shell).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Remember which chapters were saved under the previous edition, then drop old caches.
    let saved = [];
    for (const name of await caches.keys()) {
      if (name.startsWith('kk-saved-') && name !== C.saved) {
        const r = await (await caches.open(name)).match(SAVED_LIST);
        if (r) saved = saved.concat(await r.json());
      }
    }
    await Promise.all((await caches.keys()).filter((n) => n.startsWith('kk-') && !Object.values(C).includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
    // Bring saved chapters up to date with the new edition (in the background).
    for (const ch of saved) saveChapter(ch).catch(() => {});
  })());
});

async function trim(cacheName, limit) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - limit; i++) await c.delete(keys[i]);
}

async function fromCaches(req) {
  for (const name of [C.saved, C.pages, C.shell, C.assets]) {
    const hit = await (await caches.open(name)).match(req, { ignoreSearch: true });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/pagefind/') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
        if (res.ok && res.type === 'basic' && !res.redirected) {
          const c = await caches.open(C.pages);
          await c.put(url.pathname, res.clone());
          trim(C.pages, PAGE_LIMIT);
        }
        return res;
      } catch {
        return (await fromCaches(url.pathname)) ?? (await fromCaches(url.pathname.startsWith('/bg/') ? '/bg/offline/' : '/offline/'))
          ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/og/')) {
    e.respondWith((async () => {
      const hit = await fromCaches(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith('/_astro/')) {
        (await caches.open(C.assets)).put(req, res.clone()).then(() => trim(C.assets, ASSET_LIMIT));
      }
      return res;
    })());
    return;
  }

  // Preview data and anything else: network, falling back to a cached copy.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith('/previews/')) (await caches.open(C.pages)).put(req, res.clone());
      return res;
    } catch {
      return (await fromCaches(req)) ?? Response.error();
    }
  })());
});

// ---- Saving whole chapters --------------------------------------------------------------
async function savedList() {
  const r = await (await caches.open(C.saved)).match(SAVED_LIST);
  return r ? r.json() : [];
}
async function setSavedList(list) {
  await (await caches.open(C.saved)).put(SAVED_LIST, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
}

/** ch: { id: "en:001", urls: [...] }. Reports progress to `port` when given. */
async function saveChapter(ch, port) {
  const cache = await caches.open(C.saved);
  const assets = new Set();
  let done = 0;
  for (const u of ch.urls) {
    const res = await fetch(u, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${u}`);
    const html = await res.clone().text();
    await cache.put(u, res);
    // Figures, styles and scripts the page uses (only plain src/href: one size of each image).
    for (const m of html.matchAll(/(?:src|href)="(\/_astro\/[^"?#]+)"/g)) assets.add(m[1]);
    port?.postMessage({ type: 'progress', done: ++done, total: ch.urls.length });
  }
  for (const a of assets) {
    if (await cache.match(a)) continue;
    try { const r = await fetch(a); if (r.ok) await cache.put(a, r); } catch { /* skip one asset */ }
  }
  const list = (await savedList()).filter((x) => x.id !== ch.id);
  list.push({ id: ch.id, urls: ch.urls, title: ch.title, at: Date.now() });
  await setSavedList(list);
}

async function removeChapter(id) {
  const list = await savedList();
  const ch = list.find((x) => x.id === id);
  if (ch) {
    const cache = await caches.open(C.saved);
    for (const u of ch.urls) await cache.delete(u);
  }
  await setSavedList(list.filter((x) => x.id !== id));
}

self.addEventListener('message', (e) => {
  const { type } = e.data || {};
  const port = e.ports[0];
  if (type === 'save-chapter') {
    e.waitUntil(saveChapter(e.data.chapter, port).then(() => port?.postMessage({ type: 'saved' }), (err) => port?.postMessage({ type: 'error', message: String(err) })));
  } else if (type === 'remove-chapter') {
    e.waitUntil(removeChapter(e.data.id).then(() => port?.postMessage({ type: 'removed' })));
  } else if (type === 'saved-list') {
    e.waitUntil(savedList().then((list) => port?.postMessage({ type: 'list', list })));
  }
});

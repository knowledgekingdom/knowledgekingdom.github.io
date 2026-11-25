// Previews (v2 Phase 1.3).
// - Key terms: the first mention of up to five approved concepts per section becomes a small
//   button; tap, click or hover shows the book's short definition and a link to where it's explained.
// - Links within the book (related sections, previous/next, contents, citations …): hovering
//   (mouse), focusing (keyboard) or long-pressing (touch) shows the page's title, chapter and first
//   ~40 words, or the cited source. Data comes from /previews/{lang}/{chapter}.json, fetched lazily.
const S: Record<string, string> = JSON.parse(document.body.dataset.pv || '{}');
const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
const plain = (p: string) => p.replace(/^\/bg(?=\/)/, '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const LINKS = '.prose a.cite, .related a, .pager a, .contents ol a, .tl-source, .update-list a, .recent-list a, .bookmark-list a';

const box = document.createElement('div');
box.className = 'pv';
box.id = 'kk-preview';
box.hidden = true;
document.body.append(box);

let owner: HTMLElement | null = null;
let showTimer = 0, hideTimer = 0;

function place(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const w = Math.min(352, innerWidth - 32);
  box.style.width = `${w}px`;
  const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), innerWidth - w - 16);
  const below = r.bottom + 10 + box.offsetHeight < innerHeight || r.top < box.offsetHeight + 10;
  box.style.left = `${left + scrollX}px`;
  box.style.top = `${(below ? r.bottom + 8 : r.top - box.offsetHeight - 8) + scrollY}px`;
  box.dataset.side = below ? 'below' : 'above';
}

function show(el: HTMLElement, html: string, kind: 'term' | 'link') {
  clearTimeout(hideTimer);
  if (owner && owner !== el) hide();
  owner = el;
  box.innerHTML = html;
  box.setAttribute('role', kind === 'term' ? 'dialog' : 'tooltip');
  if (kind === 'term') { box.setAttribute('aria-label', S.term ?? ''); el.setAttribute('aria-expanded', 'true'); }
  else { box.removeAttribute('aria-label'); el.setAttribute('aria-describedby', box.id); }
  box.hidden = false;
  place(el);
  box.classList.remove('is-in');
  requestAnimationFrame(() => box.classList.add('is-in'));
}

function hide() {
  clearTimeout(showTimer);
  if (!owner) return;
  owner.removeAttribute('aria-describedby');
  if (owner.classList.contains('term')) owner.setAttribute('aria-expanded', 'false');
  owner = null;
  box.hidden = true;
  box.classList.remove('is-in');
}
const hideSoon = () => { clearTimeout(hideTimer); hideTimer = window.setTimeout(hide, 220); };
box.addEventListener('pointerenter', () => clearTimeout(hideTimer));
box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideSoon(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && owner) { const o = owner; hide(); o.focus(); }
});
document.addEventListener('pointerdown', (e) => {
  if (owner && !box.contains(e.target as Node) && !owner.contains(e.target as Node)) hide();
});
addEventListener('resize', () => owner && place(owner));

// ---- Key terms ----------------------------------------------------------------------
type Term = { term: string; pattern: string; flags: string; definition: string; more: string; moreTitle: string };
const termData = document.querySelector('script[data-terms]');
const prose = document.querySelector<HTMLElement>('article .prose');
if (termData && prose) {
  const terms: Term[] = JSON.parse(termData.textContent || '[]');
  const skip = 'a, h1, h2, h3, h4, h5, h6, figcaption, code, button, .term, .figure-label';
  terms.forEach((t, i) => {
    const re = new RegExp(t.pattern, t.flags);
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const m = re.exec(n.data);
      if (!m) continue;
      const rest = n.splitText(m.index);
      rest.splitText(m[0].length);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'term';
      b.dataset.term = String(i);
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', box.id);
      b.textContent = rest.data;
      rest.replaceWith(b);
      break;
    }
  });
  const html = (t: Term) => `<p class="pv-kicker">${esc(S.term ?? '')}</p><p class="pv-title">${esc(t.term)}</p>`
    + `<p>${esc(t.definition)}</p>`
    + (t.more ? `<a class="pv-more" href="${esc(t.more)}">${esc(S.readMore ?? '')}${t.moreTitle ? `: ${esc(t.moreTitle)}` : ''} →</a>` : '');
  prose.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.term');
    if (!b) return;
    if (owner === b) hide(); else show(b, html(terms[Number(b.dataset.term)]), 'term');
  });
  prose.addEventListener('pointerover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.term');
    if (!b || e.pointerType !== 'mouse') return;
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(b, html(terms[Number(b.dataset.term)]), 'term'), 300);
  });
  prose.addEventListener('pointerout', (e) => {
    const b = (e.target as HTMLElement).closest('button.term');
    if (b && e.pointerType === 'mouse') { clearTimeout(showTimer); if (owner === b) hideSoon(); }
  });
}

// ---- Links within the book ---------------------------------------------------------------
const cache = new Map<string, Promise<any>>();
const chapterData = (label: string) => {
  const key = `/previews/${lang}/${label}.json`;
  if (!cache.has(key)) cache.set(key, fetch(key).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(key)!;
};
async function linkHtml(a: HTMLAnchorElement): Promise<string | null> {
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin) return null;
  const path = plain(u.pathname);
  const label = path.match(/^\/(\d{3})-/)?.[1];
  if (!label) return null;
  const d = await chapterData(label);
  if (!d) return null;
  const src = u.hash.match(/^#source-(\d+)$/);
  if (src && path.endsWith('/sources/')) {
    const txt = d.sources?.[src[1]];
    return txt ? `<p class="pv-kicker">${esc(S.source ?? '')} ${src[1]}</p><p>${esc(txt)}</p>` : null;
  }
  const p = d.pages?.[path];
  return p ? `<p class="pv-kicker">${esc(p.c)}</p><p class="pv-title">${esc(p.t)}</p><p>${esc(p.x)}</p>` : null;
}
const open = async (a: HTMLAnchorElement) => {
  const html = await linkHtml(a);
  if (html && (owner === null || owner === a)) show(a, html, 'link');
};
const linkOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLAnchorElement>(LINKS) ?? null;

document.addEventListener('pointerover', (e) => {
  const a = linkOf(e.target);
  if (!a || e.pointerType !== 'mouse') return;
  clearTimeout(showTimer);
  showTimer = window.setTimeout(() => open(a), 400);
});
document.addEventListener('pointerout', (e) => {
  const a = linkOf(e.target);
  if (!a || e.pointerType !== 'mouse' || a.contains(e.relatedTarget as Node)) return;
  clearTimeout(showTimer);
  if (owner === a) hideSoon();
});
document.addEventListener('focusin', (e) => {
  const a = linkOf(e.target);
  if (a && a.matches(':focus-visible')) { clearTimeout(showTimer); showTimer = window.setTimeout(() => open(a), 600); }
});
document.addEventListener('focusout', (e) => { if (linkOf(e.target) === owner) hideSoon(); });

// Touch: press and hold a link to preview it (a normal tap still follows the link).
let press = 0, pressed: HTMLAnchorElement | null = null, x0 = 0, y0 = 0, suppress = false;
document.addEventListener('pointerdown', (e) => {
  suppress = false; // a long press may end without a click; never swallow the next real tap
  const a = linkOf(e.target);
  if (!a || e.pointerType === 'mouse') return;
  pressed = a; x0 = e.clientX; y0 = e.clientY;
  press = window.setTimeout(() => { suppress = true; open(a); }, 450);
});
document.addEventListener('pointermove', (e) => {
  if (pressed && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(press); pressed = null; }
});
document.addEventListener('pointerup', () => { clearTimeout(press); pressed = null; });
document.addEventListener('pointercancel', () => { clearTimeout(press); pressed = null; });
document.addEventListener('contextmenu', (e) => { if (suppress && linkOf(e.target)) e.preventDefault(); });
document.addEventListener('click', (e) => {
  if (suppress && linkOf(e.target)) { e.preventDefault(); suppress = false; }
}, true);

export {};

// "Copy link to this paragraph / heading" (v2 Phase 1.7). Paragraph ids come from the Markdown
// plugin src/lib/paragraph-ids.mjs, heading ids from the Markdown renderer. A small link button
// appears beside a paragraph or heading on hover or keyboard focus (and stays visible beside
// headings on touch screens); it copies the address and briefly says so.
const S: Record<string, string> = JSON.parse(document.body.dataset.pv || '{}');
const prose = document.querySelector<HTMLElement>('article .prose');

if (prose) {
  const status = document.createElement('p');
  status.className = 'copy-toast';
  status.setAttribute('role', 'status');
  document.body.append(status);
  let t = 0;
  const say = (msg: string) => {
    status.textContent = msg;
    status.classList.add('is-on');
    clearTimeout(t);
    t = window.setTimeout(() => status.classList.remove('is-on'), 1800);
  };

  for (const el of prose.querySelectorAll<HTMLElement>(':scope > p[id], :scope > h2[id], :scope > h3[id]')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'anchor-btn';
    b.setAttribute('aria-label', el.tagName === 'P' ? S.copyPara ?? '' : S.copyHeading ?? '');
    b.title = b.getAttribute('aria-label')!;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';
    b.addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#${el.id}`;
      history.replaceState(history.state, '', `#${el.id}`);
      try { await navigator.clipboard.writeText(url); say(S.copied ?? ''); }
      catch { say(url); } // no clipboard permission: show it so it can be copied by hand
    });
    el.classList.add('has-anchor');
    el.prepend(b);
  }
}

export {};

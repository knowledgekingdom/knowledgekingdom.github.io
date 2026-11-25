// Loads explorable diagrams (v2 Phase 3) when they scroll into view. Their placeholders are
// already in the page: a tiny inline script in SectionView.astro places them after their figure or
// paragraph while the page is still being read in, so nothing jumps once it has appeared.
const modules = import.meta.glob<{ mount: (root: HTMLElement) => { reset(): void } }>(['../explorables/*.ts', '!../explorables/kit.ts']);

for (const box of document.querySelectorAll<HTMLElement>('.explorable[data-ex-id]')) {
  const id = box.dataset.exId!;
  const load = async () => {
    const mod = await modules[`../explorables/${id}.ts`]?.();
    if (!mod) return;
    const body = box.querySelector<HTMLElement>('[data-ex-body]')!;
    body.replaceChildren();
    const inst = mod.mount(body);
    box.querySelector('[data-ex-reset]')!.addEventListener('click', () => inst.reset());
    box.classList.add('is-ready');
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '300px 0px' });
    io.observe(box);
  } else load();
}

export {};

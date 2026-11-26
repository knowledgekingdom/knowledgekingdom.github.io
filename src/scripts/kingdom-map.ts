// Starts the Kingdom Map once the homepage has painted, so the map never delays the first
// screen: after the load event, in idle time (or straight away if the reader scrolls to it).
// The map's own code (src/map/app.ts, with its data) is a separate download.
const root = document.querySelector<HTMLElement>('[data-kingdom-map]');
if (root) {
  let started = false;
  // Download the map's code right away (it's small and does nothing by itself)…
  const code = import('../map/app');
  code.catch(() => root.classList.add('is-failed'));
  // …but only draw it when the page is idle.
  const go = () => {
    if (started) return;
    started = true;
    code.then((m) => m.mount(root)).catch(() => root.classList.add('is-failed'));
  };
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 120));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
  // Reaching the map before then (e.g. a quick scroll) starts it at once.
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && document.readyState === 'complete') { io.disconnect(); go(); } });
  io.observe(root);
}

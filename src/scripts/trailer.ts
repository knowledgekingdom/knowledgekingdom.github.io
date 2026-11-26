// "Watch the trailer" on chapter pages (Motion & Story, M1). The player and its data are a
// separate download, fetched only when the button is pressed (a hover warms it up).
const btn = document.querySelector<HTMLButtonElement>('[data-trailer]');
if (btn) {
  const strings = JSON.parse(btn.dataset.strings ?? '{}');
  const load = () => import('../trailer/player');
  btn.addEventListener('pointerenter', () => { load(); }, { once: true });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const { openTrailer } = await load();
      await openTrailer({ label: btn.dataset.trailer!, lang: document.documentElement.lang === 'bg' ? 'bg' : 'en', strings });
    } finally { btn.disabled = false; }
  });
}

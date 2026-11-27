// Zoom and pan inside the figure lightbox (Motion & Story, M4). Wheel or pinch to zoom around the
// pointer, double-click or double-tap to zoom in and out, drag to move a zoomed figure, and keys:
// + and − zoom, 0 fits, arrows move. Only the image's transform changes (translate + scale).
export type Zoom = { reset: (instant?: boolean) => void; zoomBy: (f: number) => void; handleKey: (e: KeyboardEvent) => boolean };

export function zoomable(stage: HTMLElement, img: HTMLImageElement, onChange: (scale: number) => void): Zoom {
  let s = 1, x = 0, y = 0;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const max = () => Math.max(3, Math.min(6, (img.naturalWidth / Math.max(1, img.offsetWidth)) * 1.6));
  const clampPan = () => {
    const ox = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2), oy = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
    x = Math.min(ox, Math.max(-ox, x)); y = Math.min(oy, Math.max(-oy, y));
  };
  const apply = (smooth: boolean) => {
    clampPan();
    img.style.transition = smooth && !calm() ? 'transform .28s cubic-bezier(.2, .8, .2, 1)' : 'none';
    img.style.transform = s === 1 && !x && !y ? '' : `translate(${x}px, ${y}px) scale(${s})`;
    stage.classList.toggle('is-zoomed', s > 1.01);
    onChange(s);
  };
  /** Zoom to `to`, keeping the screen point (px, py) still (the stage's centre if not given). */
  const zoomAt = (to: number, px?: number, py?: number, smooth = true) => {
    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    px ??= cx; py ??= cy;
    to = Math.min(max(), Math.max(1, to));
    // A point u from the image's centre is drawn at centre + pan + s·u; keep it where it is.
    const ux = (px - cx - x) / s, uy = (py - cy - y) / s;
    x = px - cx - to * ux; y = py - cy - to * uy; s = to;
    if (s === 1) { x = 0; y = 0; }
    apply(smooth);
  };
  const toggleAt = (px: number, py: number) => (s > 1.05 ? zoomAt(1) : zoomAt(Math.min(max(), 2.5), px, py));

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(s * Math.exp(-d * 0.0016), e.clientX, e.clientY, false);
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => { e.preventDefault(); toggleAt(e.clientX, e.clientY); });

  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; s: number; mx: number; my: number } | null = null;
  let drag: { px: number; py: number; x: number; y: number } | null = null;
  let tap = { at: 0, x: 0, y: 0 }, moved = false;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (pts.size === 2) { const m = mid(); pinch = { d: dist(), s, mx: m.x, my: m.y }; drag = null; }
    else if (pts.size === 1 && s > 1.01) drag = { px: e.clientX, py: e.clientY, x, y };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const m = mid();
      zoomAt(pinch.s * (dist() / pinch.d), m.x, m.y, false);
      x += m.x - pinch.mx; y += m.y - pinch.my; pinch.mx = m.x; pinch.my = m.y; apply(false);
      moved = true;
    } else if (drag) {
      const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      x = drag.x + dx; y = drag.y + dy; apply(false);
      stage.classList.add('is-dragging');
    }
  });
  const up = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch = null;
    if (!pts.size) {
      drag = null; stage.classList.remove('is-dragging');
      // Double-tap on touch screens (a mouse has dblclick).
      if (e.pointerType === 'touch' && !moved) {
        const now = performance.now();
        if (now - tap.at < 320 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) { toggleAt(e.clientX, e.clientY); tap.at = 0; }
        else tap = { at: now, x: e.clientX, y: e.clientY };
      }
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  return {
    reset: (instant = false) => { s = 1; x = 0; y = 0; apply(!instant); },
    zoomBy: (f: number) => zoomAt(s * f),
    handleKey: (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomAt(s * 1.5);
      else if (e.key === '-' || e.key === '_') zoomAt(s / 1.5);
      else if (e.key === '0') zoomAt(1);
      else if (s > 1.01 && e.key.startsWith('Arrow')) {
        const step = 80;
        if (e.key === 'ArrowLeft') x += step; else if (e.key === 'ArrowRight') x -= step;
        else if (e.key === 'ArrowUp') y += step; else y -= step;
        apply(true);
      } else return false;
      return true;
    },
  };
}

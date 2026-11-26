// Soft textures for the Kingdom Map, painted on small canvases and stretched over the map:
// watercolour mottling for the sea (below the drawing) and drifting cloud for the fog of war
// (above it, with clear patches where the reader has been). Canvases, not SVG images, so the
// browser never mistakes the map for the page's main image. Browser only.
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Fractal value noise in [0, 1] on a w × h grid. */
export function noise(w: number, h: number, seed: number, octaves = 5, base = 6): Float32Array {
  const out = new Float32Array(w * h);
  const rand = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base * 2 ** o, gw = cells + 1, gh = Math.ceil(cells * (h / w)) + 2;
    const grid = new Float32Array(gw * gh).map(() => rand());
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * (gh - 2), y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * (gw - 1), x0 = Math.min(Math.floor(gx), gw - 2), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
        const i = y0 * gw + x0;
        const a = grid[i], b = grid[i + 1], c = grid[i + gw], d = grid[i + gw + 1];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const RES = 16; // one texture pixel per 16 map units (the canvas is smoothed when stretched)
const cache: Record<string, Float32Array> = {};
function field(key: string, w: number, h: number, seed: number, octaves: number, base: number) {
  return (cache[key] ??= noise(w, h, seed, octaves, base));
}

function tint(ctx: CanvasRenderingContext2D, n: Float32Array, w: number, h: number, px: (v: number) => [number, number, number, number]) {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < n.length; i++) { const [r, g, b, a] = px(n[i]); const j = i * 4; img.data[j] = r; img.data[j + 1] = g; img.data[j + 2] = b; img.data[j + 3] = a; }
  ctx.putImageData(img, 0, 0);
}

/** The sea: its colour with a faint watercolour mottle. */
export function paintSea(canvas: HTMLCanvasElement, W: number, H: number, colour: string, dark: boolean) {
  const w = Math.ceil(W / RES), h = Math.ceil(H / RES);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const n = field('sea', w, h, 23, 5, 4);
  tint(ctx, n, w, h, (v) => { const k = Math.max(0, Math.min(1, (v - 0.38) * 2)); return dark ? [150, 190, 255, k * 20] : [30, 80, 110, k * 34]; });
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
}

export type Hole = { label: string; x: number; y: number; r: number };

/**
 * The fog of war. paint() redraws it with the given clear patches; patches listed in `fresh`
 * open up gradually (the fog clearing), unless motion is reduced.
 */
export function createFog(canvas: HTMLCanvasElement, W: number, H: number) {
  const w = Math.ceil(W / RES), h = Math.ceil(H / RES);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  let raf = 0;
  const draw = (holes: Hole[], grow: (h: Hole) => number) => {
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    for (const hole of holes) {
      const r = (hole.r * grow(hole)) / RES;
      if (r < 1) continue;
      const g = ctx.createRadialGradient(hole.x / RES, hole.y / RES, 0, hole.x / RES, hole.y / RES, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,.96)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hole.x / RES - r, hole.y / RES - r, r * 2, r * 2);
    }
  };
  return {
    /** Re-colour the fog (light parchment mist or night murk). */
    colour(rgb: [number, number, number], strength: number) {
      const bctx = base.getContext('2d');
      if (!bctx) return;
      const n = field('fog', w, h, 37, 6, 3);
      tint(bctx, n, w, h, (v) => { const k = Math.max(0, Math.min(1, (v - 0.22) * 1.6)); return [rgb[0], rgb[1], rgb[2], Math.round(255 * strength * (0.5 + 0.5 * k))]; });
    },
    paint(holes: Hole[], fresh: Set<string> = new Set(), animate = true) {
      cancelAnimationFrame(raf);
      if (!fresh.size || !animate) { draw(holes, () => 1); return; }
      const start = performance.now(), dur = 2200;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur), e = 1 - (1 - t) ** 3;
        draw(holes, (hole) => (fresh.has(hole.label) ? e : 1));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
  };
}

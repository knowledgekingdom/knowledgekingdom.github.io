// A living Kingdom Map (Motion & Story, M3). One canvas above the tilted map draws the life on
// it, positioned through the same view and tilt as the map itself:
// - the time of day from the reader's own clock: dawn blush, day, golden dusk, blue night, with
//   the sun (or moon) crossing the sky and lanterns glowing in the towns the reader has reached;
// - mist drifting over Part I's highlands, sand haze over Part II, smoke from Part III's chimneys,
//   flocks of birds over the land, gulls circling the coasts, glints on the water.
// It pauses when the map is off screen or the tab is hidden, thins itself out on slow devices, and
// for "reduce motion" keeps only the still light of the hour.
import type { MapData } from './render';

export type View = { cx: number; cy: number; s: number; fw: number; fh: number; m: DOMMatrix };
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
type Opts = {
  frame: HTMLElement; data: MapData; view: () => View; lit: () => { x: number; y: number }[];
  calm: () => boolean; dark: () => boolean; strings: Record<string, string>; lang: 'en' | 'bg';
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Where the day stands at this hour (local time). */
export function phaseOf(date: Date): { phase: Phase; sun: number } {
  const h = date.getHours() + date.getMinutes() / 60;
  const phase: Phase = h >= 5 && h < 7.5 ? 'dawn' : h >= 7.5 && h < 17 ? 'day' : h >= 17 && h < 20.5 ? 'dusk' : 'night';
  return { phase, sun: clamp((h - 5) / 15.5) }; // 0 at 5:00 (sunrise side) → 1 at 20:30
}

export function startAtmosphere(o: Opts) {
  const { frame, data } = o;
  const canvas = document.createElement('canvas');
  canvas.className = 'km-atmo';
  canvas.setAttribute('aria-hidden', 'true');
  const tint = document.createElement('div');
  tint.className = 'km-tint';
  tint.setAttribute('aria-hidden', 'true');
  const tilt = frame.querySelector('.km-tilt')!;
  tilt.after(tint, canvas);
  const ctx = canvas.getContext('2d')!;
  // The clock chip: what hour it is in the Kingdom; tapping it previews the others.
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'km-clock';
  frame.querySelector('.km-ui')?.before(chip);
  let override: Phase | null = null;
  const ORDER: (Phase | null)[] = [null, 'dawn', 'day', 'dusk', 'night'];
  chip.addEventListener('click', (e) => { e.stopPropagation(); override = ORDER[(ORDER.indexOf(override) + 1) % ORDER.length]; applyPhase(); });

  const rand = rng(99);
  const regionBox = (n: number) => {
    const r = data.regions.find((q) => q.known && q.number === n);
    if (!r) return null;
    const xs = r.outline.map((p) => p[0]), ys = r.outline.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const b1 = regionBox(1), b2 = regionBox(2), b3 = regionBox(3);
  const land = data.regions.filter((r) => r.known).flatMap((r) => r.outline);
  const lx = land.map((p) => p[0]), ly = land.map((p) => p[1]);
  const landBox = { x0: Math.min(...lx), x1: Math.max(...lx), y0: Math.min(...ly), y1: Math.max(...ly) };

  // ---- the actors ----
  const mist = b1 ? Array.from({ length: 16 }, () => ({ x: b1.x0 + rand() * (b1.x1 - b1.x0), y: b1.y0 + rand() * (b1.y1 - b1.y0), r: 120 + rand() * 160, ph: rand() * 6.28, v: 6 + rand() * 8 })) : [];
  const dust = b2 ? Array.from({ length: 70 }, () => ({ x: b2.x0 + rand() * (b2.x1 - b2.x0), y: b2.y0 + rand() * (b2.y1 - b2.y0), v: 14 + rand() * 22, ph: rand() * 6.28 })) : [];
  const chimneys = data.decor.filter((d) => d.kind === 'chimney');
  const smoke: { x: number; y: number; t: number }[] = [];
  let smokeClock = 0;
  const mkFlock = (n: number, seed: number) => { const r = rng(seed); const x = landBox.x0 + r() * (landBox.x1 - landBox.x0), y = landBox.y0 + r() * (landBox.y1 - landBox.y0); return { birds: Array.from({ length: n }, () => ({ x: x + (r() - 0.5) * 120, y: y + (r() - 0.5) * 80, vx: 30, vy: 0, ph: r() * 6.28 })), target: [x, y] as [number, number], until: 0 }; };
  const flocks = [mkFlock(9, 3), mkFlock(7, 7)];
  const sea = data.waves.filter(([x, y]) => land.some(([lx2, ly2]) => Math.hypot(lx2 - x, ly2 - y) < 260));
  const gulls = Array.from({ length: 6 }, (_, i) => { const c = sea[(i * 7) % Math.max(1, sea.length)] ?? [landBox.x0, landBox.y1]; return { cx: c[0], cy: c[1], r: 50 + rand() * 70, a: rand() * 6.28, w: (0.25 + rand() * 0.3) * (i % 2 ? 1 : -1), ph: rand() * 6.28 }; });
  const glints: { x: number; y: number; t: number }[] = [];
  let quality = 1;

  // Soft blob sprite for mist and smoke.
  const blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  { const g = blob.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }

  // ---- the light of the hour ----
  let current: { phase: Phase; sun: number } = phaseOf(new Date());
  function applyPhase() {
    const real = phaseOf(new Date());
    current = override ? { phase: override, sun: override === 'dawn' ? 0.08 : override === 'day' ? 0.45 : override === 'dusk' ? 0.86 : 0.5 } : real;
    frame.dataset.phase = current.phase;
    const now = new Date();
    const time = new Intl.DateTimeFormat(o.lang === 'bg' ? 'bg-BG' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(now);
    chip.innerHTML = `<span class="km-clock-icon km-clock-${current.phase}" aria-hidden="true"></span><span>${o.strings[`time_${current.phase}`] ?? current.phase}${override ? '' : ` · ${time}`}</span>`;
    chip.setAttribute('aria-label', `${o.strings.timeLabel ?? 'Time of day'}: ${o.strings[`time_${current.phase}`] ?? current.phase}. ${o.strings.timeHint ?? ''}`);
    draw(0);
  }
  setInterval(() => { if (!override) applyPhase(); }, 60_000);

  // ---- drawing ----
  let W = 1, H = 1, dpr = 1;
  const resize = () => { const r = frame.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  new ResizeObserver(resize).observe(frame);
  resize();
  let last = performance.now(), running = true, visible = true;
  function project(v: View, x: number, y: number): [number, number, number] {
    const fx = v.fw / 2 + (x - v.cx) * v.s, fy = v.fh / 2 + (y - v.cy) * v.s, m = v.m;
    const X = m.m11 * fx + m.m21 * fy + m.m41, Y = m.m12 * fx + m.m22 * fy + m.m42, w = m.m14 * fx + m.m24 * fy + m.m44;
    return [X / w, Y / w, (v.s * 1.07) / w];
  }
  function draw(dt: number) {
    const v = o.view(), calm = o.calm(), dark = o.dark(), t = performance.now() / 1000;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { phase, sun } = current;
    const nightish = phase === 'night' || phase === 'dusk' || dark;
    // The sun (or moon) on its arc across the sky above the map.
    {
      const isMoon = phase === 'night';
      const p = isMoon ? 0.5 + Math.sin(t / 300) * 0.02 : sun;
      const x = W * (0.08 + p * 0.84), y = 26 + (1 - Math.sin(Math.PI * p)) * H * 0.18;
      const g = ctx.createRadialGradient(x, y, 0, x, y, isMoon ? 90 : 150);
      const c = isMoon ? '210,225,255' : phase === 'dusk' ? '255,150,70' : phase === 'dawn' ? '255,180,150' : '255,236,180';
      g.addColorStop(0, `rgba(${c},${isMoon ? 0.5 : 0.55})`); g.addColorStop(0.18, `rgba(${c},.22)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - 160, y - 160, 320, 320);
      ctx.fillStyle = `rgba(${c},${isMoon ? 0.95 : 0.9})`; ctx.beginPath(); ctx.arc(x, y, isMoon ? 9 : 12, 0, Math.PI * 2); ctx.fill();
      if (isMoon) { ctx.fillStyle = dark ? '#0f1822' : 'rgba(30,40,80,.9)'; ctx.beginPath(); ctx.arc(x + 4, y - 3, 8, 0, Math.PI * 2); ctx.fill(); }
    }
    // Lanterns in the towns the reader has reached, from dusk to dawn.
    if (nightish) {
      ctx.globalCompositeOperation = 'lighter';
      for (const tw of o.lit()) {
        const [x, y, k] = project(v, tw.x, tw.y);
        if (x < -80 || y < -80 || x > W + 80 || y > H + 80) continue;
        const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 6 + tw.x * 0.37) * Math.sin(t * 3.3 + tw.y);
        const r = 70 * k * fl;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,190,90,${(phase === 'dusk' ? 0.35 : 0.5) * fl})`); g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (calm) return;
    // Mist over the highlands.
    ctx.globalAlpha = 1;
    for (const m of mist.slice(0, Math.ceil(mist.length * quality))) {
      m.x += m.v * dt; if (b1 && m.x > b1.x1 + 100) m.x = b1.x0 - 100;
      const [x, y, k] = project(v, m.x, m.y + Math.sin(t * 0.2 + m.ph) * 20);
      const r = m.r * k;
      if (x < -r || y < -r || x > W + r || y > H + r) continue;
      ctx.globalAlpha = (dark ? 0.06 : 0.16) * (0.6 + 0.4 * Math.sin(t * 0.3 + m.ph));
      ctx.drawImage(blob, x - r, y - r * 0.55, r * 2, r * 1.1);
    }
    // Sand haze over the river valleys.
    ctx.fillStyle = dark ? 'rgba(230,200,140,1)' : 'rgba(170,120,50,1)';
    for (const d of dust.slice(0, Math.ceil(dust.length * quality))) {
      d.x += d.v * dt; d.y += Math.sin(t + d.ph) * 4 * dt; if (b2 && d.x > b2.x1) d.x = b2.x0;
      const [x, y, k] = project(v, d.x, d.y);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + d.ph);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, 2.2 * k), 0, Math.PI * 2); ctx.fill();
    }
    // Smoke from the chimneys of Part III.
    smokeClock += dt;
    if (smokeClock > 0.5 / Math.max(0.3, quality)) { smokeClock = 0; const c = chimneys[Math.floor(rand() * chimneys.length)]; if (c) smoke.push({ x: c.x + 5 * c.s, y: c.y - 26 * c.s, t: 0 }); }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i]; p.t += dt;
      if (p.t > 5) { smoke.splice(i, 1); continue; }
      const [x, y, k] = project(v, p.x + p.t * 9, p.y - p.t * 14);
      const r = (6 + p.t * 7) * k;
      if (x < -r || y < -r || x > W + r || y > H + r) continue;
      ctx.globalAlpha = (dark ? 0.25 : 0.32) * (1 - p.t / 5);
      ctx.drawImage(blob, x - r, y - r, r * 2, r * 2);
    }
    // Glints on the water (by day, or by the moon).
    // (a glint is only struck on water that is on screen: the sea is far larger than the view)
    if (glints.length < 14 * quality && rand() < 0.25) {
      const w = data.waves[Math.floor(rand() * data.waves.length)];
      const [x, y] = w ? project(v, w[0], w[1]) : [-1, -1];
      if (w && x > 0 && y > 0 && x < W && y < H) glints.push({ x: w[0] + (rand() - 0.5) * 80, y: w[1] + (rand() - 0.5) * 40, t: 0 });
    }
    ctx.strokeStyle = phase === 'night' || dark ? 'rgba(210,225,255,1)' : 'rgba(255,255,255,1)'; ctx.lineCap = 'round';
    for (let i = glints.length - 1; i >= 0; i--) {
      const g = glints[i]; g.t += dt;
      if (g.t > 1.6) { glints.splice(i, 1); continue; }
      const [x, y, k] = project(v, g.x, g.y);
      ctx.globalAlpha = Math.sin((g.t / 1.6) * Math.PI) * 0.8; ctx.lineWidth = Math.max(1, 2 * k);
      ctx.beginPath(); ctx.moveTo(x - 7 * k, y); ctx.lineTo(x + 7 * k, y); ctx.stroke();
    }
    // Birds: small flocks that wander between towns.
    ctx.strokeStyle = dark || phase === 'night' ? 'rgba(235,225,200,.85)' : 'rgba(40,30,20,.75)'; ctx.lineWidth = 1.4;
    for (const f of flocks.slice(0, quality < 0.6 ? 1 : 2)) {
      if (t > f.until) { const tw = data.towns[Math.floor(rand() * data.towns.length)]; f.target = [tw.x, tw.y - 120]; f.until = t + 10 + rand() * 8; }
      const ax = f.birds.reduce((a, b) => a + b.x, 0) / f.birds.length, ay = f.birds.reduce((a, b) => a + b.y, 0) / f.birds.length;
      for (const b of f.birds) {
        let fx = (f.target[0] - b.x) * 0.02 + (ax - b.x) * 0.03, fy = (f.target[1] - b.y) * 0.02 + (ay - b.y) * 0.03;
        for (const o2 of f.birds) { const dx = b.x - o2.x, dy = b.y - o2.y, d = Math.hypot(dx, dy); if (o2 !== b && d < 26) { fx += (dx / (d || 1)) * 6; fy += (dy / (d || 1)) * 6; } }
        b.vx += fx * dt * 4; b.vy += fy * dt * 4;
        const sp = Math.hypot(b.vx, b.vy) || 1, max = 70;
        if (sp > max) { b.vx = (b.vx / sp) * max; b.vy = (b.vy / sp) * max; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        const [x, y, k] = project(v, b.x, b.y);
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        const span = Math.max(3, 7 * k), flap = Math.sin(t * 9 + b.ph) * span * 0.6;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(x - span, y - flap); ctx.quadraticCurveTo(x - span * 0.4, y - flap * 0.2, x, y); ctx.quadraticCurveTo(x + span * 0.4, y - flap * 0.2, x + span, y - flap); ctx.stroke();
      }
    }
    // Gulls circling the coasts.
    ctx.strokeStyle = dark || phase === 'night' ? 'rgba(240,240,255,.8)' : 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6;
    for (const g of gulls.slice(0, Math.ceil(gulls.length * quality))) {
      g.a += g.w * dt;
      const [x, y, k] = project(v, g.cx + Math.cos(g.a) * g.r, g.cy + Math.sin(g.a) * g.r * 0.6);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const span = Math.max(4, 9 * k), flap = Math.sin(t * 4 + g.ph) * span * 0.45;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(x - span, y - flap); ctx.quadraticCurveTo(x - span * 0.5, y - span * 0.35, x, y); ctx.quadraticCurveTo(x + span * 0.5, y - span * 0.35, x + span, y - flap); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Thin out on slow devices.
    const cost = performance.now() - t0;
    if (cost > 6) quality = Math.max(0.3, quality - 0.1); else if (cost < 2.5 && quality < 1) quality = Math.min(1, quality + 0.02);
    frame.dataset.atmoMs = cost.toFixed(1);
    frame.dataset.atmoFrames = String(Number(frame.dataset.atmoFrames ?? 0) + 1);
  }
  function loop(now: number) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (visible && !document.hidden) draw(o.calm() ? 0 : dt);
    requestAnimationFrame(o.calm() ? () => setTimeout(() => loop(performance.now()), 500) : loop);
  }
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(frame);
  applyPhase();
  requestAnimationFrame(loop);
  return {
    redraw: () => draw(0),
    phase: () => current.phase,
    setPhase: (p: Phase | null) => { override = p; applyPhase(); },
    stop: () => { running = false; canvas.remove(); tint.remove(); chip.remove(); },
  };
}

// Celebrations (Motion & Story, M2), loaded only when a reader finishes something.
// - A chapter: a wax seal stamped with the chapter's emblem drops onto the page; on impact the
//   page jolts, a shockwave spreads and wax and gold sparks fly. Then "Chapter 027 complete".
// - A Part: a short film. The region of the Kingdom Map is traced in gold ink, a banner rises
//   over each of its towns, and the Part's crest is forged and catches the light.
// Reduced motion: the same messages, faded in, nothing flies.
import { EMBLEMS } from '../map/emblems';

type Ch = { path: string; label: string; part: number | null; total: number; t: string; e: string };
type Part = { n: number; roman: string; t: string };
type Strings = Record<string, string>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const prefix = () => (document.documentElement.lang === 'bg' ? '/bg' : '');

export async function celebrate(o: { chapter: Ch; part: Part | null; strings: Strings; journey: string }) {
  await seal(o.chapter, o.strings, o.journey);
  if (o.part) await partFilm(o.part, o.strings, o.journey);
}

/** A soft lumpy circle: the edge of a pool of wax. */
function waxPath(r: number, seed: number) {
  let d = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const k = r * (1 + 0.05 * Math.sin(5 * a + seed) + 0.035 * Math.sin(9 * a + seed * 2) + 0.02 * Math.sin(17 * a));
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * k).toFixed(1)} ${(Math.sin(a) * k).toFixed(1)}`;
  }
  return d + 'Z';
}

function overlay(cls: string) {
  const el = document.createElement('div');
  el.className = `cel ${cls}`;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  return el;
}
function dismissable(el: HTMLElement, ms: number): Promise<void> {
  return new Promise((done) => {
    let gone = false;
    const close = () => {
      if (gone) return; gone = true;
      removeEventListener('keydown', key);
      el.classList.add('is-leaving');
      setTimeout(() => { el.remove(); done(); }, calm() ? 10 : 450);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', key);
    el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('a')) close(); });
    el.querySelector('[data-cel-close]')?.addEventListener('click', close);
    setTimeout(close, ms);
  });
}

// Wax and gold sparks flying from the point of impact.
function burst(canvas: HTMLCanvasElement, x: number, y: number) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  const bits = Array.from({ length: 64 }, (_, i) => {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9, wax = i < 40;
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, r: wax ? 2 + Math.random() * 5 : 1 + Math.random() * 2, wax, life: 1 };
  });
  const t0 = performance.now();
  const step = (now: number) => {
    const t = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.life = 1 - t / (b.wax ? 1.3 : 0.9);
      if (b.life <= 0) continue;
      ctx.globalAlpha = b.life;
      ctx.fillStyle = b.wax ? '#a3242a' : '#ffd27a';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (b.wax ? 1 : b.life + 0.3), 0, Math.PI * 2); ctx.fill();
    }
    if (t < 1.4) requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  requestAnimationFrame(step);
}

async function seal(ch: Ch, S: Strings, journey: string) {
  const el = overlay('cel-seal-o');
  const glyph = EMBLEMS[ch.e] ?? EMBLEMS.banner;
  const nextLabel = String(Number(ch.label) + 1).padStart(3, '0');
  const nextCh = (JSON.parse(document.getElementById('kk-book')?.textContent || '{"chapters":[]}') as { chapters: Ch[] }).chapters.find((c) => c.label === nextLabel);
  el.innerHTML = `
    <canvas class="cel-fx" aria-hidden="true"></canvas>
    <div class="cel-card">
      <div class="cel-ring" aria-hidden="true"></div>
      <svg class="cel-wax" viewBox="-64 -64 128 128" aria-hidden="true">
        <defs><radialGradient id="cel-g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#d4473f"/><stop offset=".55" stop-color="#a3242a"/><stop offset="1" stop-color="#6e1218"/></radialGradient></defs>
        <path d="${waxPath(56, 1.7)}" fill="url(#cel-g)"/>
        <path d="${waxPath(44, 3.1)}" fill="none" stroke="#6e1218" stroke-width="3" opacity=".6"/>
        <circle r="38" fill="none" stroke="#f0a99a" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"/>
        <g transform="translate(-24 -23) scale(2)" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <g transform="translate(.6 .9)" stroke="#5a0e13" stroke-width="1.9" opacity=".7">${glyph}</g>
          <g stroke="#f6c0b2" stroke-width="1.7">${glyph}</g>
        </g>
      </svg>
      <p class="cel-kicker">${esc(fill(S.chapter ?? 'Chapter {n} complete', { n: ch.label }))}</p>
      <p class="cel-title">${esc(ch.t)}</p>
      <p class="cel-actions"><a class="btn btn-primary" href="${esc(journey)}">${esc(S.journey ?? 'See your journey')}</a>${nextCh ? ` <a class="btn" href="${esc(prefix() + nextCh.path)}">${esc(S.next ?? 'Next chapter')} →</a>` : ''}
        <button type="button" class="cel-close" data-cel-close aria-label="${esc(S.close ?? 'Close')}">×</button></p>
    </div>`;
  el.querySelectorAll('.cel-wax g g').forEach((g) => g.querySelectorAll('.f').forEach((f) => f.setAttribute('fill', g.getAttribute('stroke') ?? '#f6c0b2')));
  requestAnimationFrame(() => el.classList.add('is-on'));
  if (!calm()) {
    const wax = el.querySelector<SVGElement>('.cel-wax')!;
    wax.animate([
      { transform: 'translateY(-55vh) scale(2.8) rotate(-32deg)', opacity: 0 },
      { offset: 0.55, transform: 'translateY(0) scale(.9, .82) rotate(5deg)', opacity: 1 },
      { offset: 0.72, transform: 'translateY(-2%) scale(1.07, 1.03) rotate(-2deg)' },
      { transform: 'none', opacity: 1 },
    ], { duration: 950, easing: 'cubic-bezier(.35, 0, .2, 1)', fill: 'both' });
    setTimeout(() => {
      const r = wax.getBoundingClientRect();
      burst(el.querySelector('canvas')!, r.left + r.width / 2, r.top + r.height / 2);
      el.querySelector('.cel-card')!.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px, 4px)' }, { transform: 'translate(5px, -3px)' }, { transform: 'translate(-2px, 1px)' }, { transform: 'none' }], { duration: 320 });
      el.querySelector('.cel-ring')!.animate([{ transform: 'scale(.5)', opacity: 0.9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }, 520);
  }
  return dismissable(el, 6500);
}

async function partFilm(part: Part, S: Strings, journey: string) {
  const map = (await import('../data/map.json')).default as unknown as { regions: { number: number; outline: [number, number][]; known: boolean }[]; towns: { part: number; x: number; y: number; planned: boolean }[] };
  const region = map.regions.find((r) => r.known && r.number === part.n);
  const towns = map.towns.filter((t) => t.part === part.n && !t.planned);
  const el = overlay('cel-part-o');
  el.innerHTML = `<canvas class="cel-film" aria-hidden="true"></canvas>
    <div class="cel-part-text"><p class="cel-kicker">${esc(fill(S.part ?? 'Part {n} complete', { n: part.roman }))}</p><p class="cel-title">${esc(part.t)}</p>
    <p class="cel-actions"><a class="btn btn-primary" href="${esc(journey)}">${esc(S.journey ?? 'See your journey')}</a> <button type="button" class="cel-close" data-cel-close aria-label="${esc(S.close ?? 'Close')}">×</button></p></div>`;
  requestAnimationFrame(() => el.classList.add('is-on'));
  const canvas = el.querySelector<HTMLCanvasElement>('canvas')!, ctx = canvas.getContext('2d')!;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  if (region) {
    const xs = region.outline.map((p) => p[0]), ys = region.outline.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W * 0.7) / (x1 - x0), (H * 0.42) / (y1 - y0));
    const P = (x: number, y: number): [number, number] => [W / 2 + (x - (x0 + x1) / 2) * k, H * 0.46 + (y - (y0 + y1) / 2) * k];
    const outline = region.outline.map(([x, y]) => P(x, y));
    const crestY = H * 0.46 - ((y1 - y0) / 2) * k - 54;
    const sparks = Array.from({ length: 40 }, () => ({ a: Math.random() * Math.PI * 2, s: 40 + Math.random() * 120, r: 1 + Math.random() * 2 }));
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = calm() ? 9 : (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // The coast traced in gold ink.
      const upto = clamp(t / 1.8) * outline.length;
      ctx.strokeStyle = '#d9c38f'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.fillStyle = `rgba(217,195,143,${0.08 * clamp((t - 1.6) / 0.8)})`;
      ctx.beginPath();
      for (let i = 0; i < Math.floor(upto); i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, outline[i][0], outline[i][1]);
      if (upto >= outline.length) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      // A banner rises over each town in turn.
      towns.forEach((tw, i) => {
        const p = easeOut((t - 1.6 - i * 0.16) / 0.5);
        if (p <= 0) return;
        const [x, y] = P(tw.x, tw.y);
        ctx.fillStyle = '#ffc65a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#efe4c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26 * p); ctx.stroke();
        ctx.fillStyle = '#c23b2a'; ctx.beginPath(); ctx.moveTo(x, y - 26 * p); ctx.lineTo(x + 15 * p, y - 22 * p); ctx.lineTo(x + 10 * p, y - 18 * p); ctx.lineTo(x + 15 * p, y - 14 * p); ctx.lineTo(x, y - 14 * p); ctx.fill();
      });
      // The crest: forged, then the light runs across it.
      const cp = easeOut((t - 1.6 - towns.length * 0.16 - 0.2) / 0.7);
      if (cp > 0) {
        ctx.save(); ctx.translate(W / 2, crestY); ctx.scale(cp * 2.4, cp * 2.4);
        const shield = new Path2D('M-17-20H17V-2C17 10 8 17 0 21C-8 17-17 10-17-2z');
        const sweep = ((t - 2.6) % 2.4) / 2.4;
        const g = ctx.createLinearGradient(-30, -20, 30, 20);
        g.addColorStop(0, '#b07a1e'); g.addColorStop(clamp(sweep - 0.08), '#e9b24a'); g.addColorStop(clamp(sweep), '#fff1c4'); g.addColorStop(clamp(sweep + 0.08), '#e9b24a'); g.addColorStop(1, '#8a5d14');
        ctx.fillStyle = g; ctx.fill(shield); ctx.strokeStyle = '#5a3c0c'; ctx.lineWidth = 1.2; ctx.stroke(shield);
        ctx.fillStyle = '#3b2708'; ctx.font = `700 14px ${getComputedStyle(document.documentElement).getPropertyValue('--font-serif') || 'serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(part.roman, 0, 2);
        ctx.restore();
        if (!calm()) for (const sp of sparks) {
          const life = clamp(1 - (t - 2.4) / 1.4);
          if (life <= 0) break;
          const d = sp.s * easeOut((t - 2.4) / 1.2);
          ctx.globalAlpha = life; ctx.fillStyle = '#ffd27a';
          ctx.beginPath(); ctx.arc(W / 2 + Math.cos(sp.a) * d, crestY + Math.sin(sp.a) * d, sp.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!el.isConnected) return;
      if (t < 12) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  return dismissable(el, 10000);
}

// Ch. 005, Figure 5.2: a patch of land with a fixed real size, dragged across a Mercator grid.
// Mercator stretches lengths by 1/cos(latitude), so areas by 1/cos²(latitude).
import { T, num, slider, readout, layout, svg, s, type Explorable } from './kit';

const D = { lat: 0 };
const W = 420, H = 360, MAXLAT = 80;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const Y = (lat: number) => H / 2 - (merc(lat) / merc(MAXLAT)) * (H / 2 - 10);
export const areaFactor = (lat: number) => 1 / Math.cos((lat * Math.PI) / 180) ** 2;

export function mount(root: HTMLElement): Explorable {
  const { controls, stage, readouts } = layout(root);
  let lat = D.lat;
  const rF = readout(T({ en: 'drawn larger in area than at the Equator', bg: 'нарисувана по-голяма по площ, отколкото на екватора' }), 'is-key');
  const rG = readout(T({ en: 'Greenland (about 72° N) is drawn this much too large', bg: 'толкова прекалено голяма е нарисувана Гренландия (около 72° с.ш.)' }));
  readouts.append(rF.el, rG.el);
  rG.set(`${num(areaFactor(72), 1)}×`);
  const g = svg(W, H, '');
  const grid = s('g');
  for (let l = -75; l <= 75; l += 15) {
    grid.append(s('line', { x1: 0, x2: W, y1: Y(l), y2: Y(l), class: l === 0 ? 'ex-axis' : 'ex-grid' }));
    grid.append(s('text', { x: 6, y: Y(l) - 3, class: 'ex-tick' }, `${Math.abs(l)}°${l > 0 ? T({ en: 'N', bg: 'с' }) : l < 0 ? T({ en: 'S', bg: 'ю' }) : ''}`));
  }
  for (let x = 0; x <= W; x += W / 12) grid.append(s('line', { x1: x, x2: x, y1: 0, y2: H, class: 'ex-grid' }));
  const shape = s('ellipse', { class: 'ex-patch', tabindex: '0' });
  const ghost = s('circle', { class: 'ex-ghost' });
  g.append(grid, ghost, shape);
  stage.append(g);
  // The patch: a circle about 24° across in reality, stretched by Mercator at its latitude; the
  // dashed circle is the same patch drawn at the Equator.
  const R0 = Y(0) - Y(12);
  ghost.setAttribute('cx', String(W / 2)); ghost.setAttribute('cy', String(Y(0))); ghost.setAttribute('r', String(R0));
  const draw = () => {
    const k = 1 / Math.cos((lat * Math.PI) / 180);
    shape.setAttribute('cx', String(W / 2));
    shape.setAttribute('cy', String(Y(lat)));
    shape.setAttribute('rx', String(R0 * k));
    shape.setAttribute('ry', String(R0 * k));
    rF.set(`${num(areaFactor(lat), 1)}×`);
    g.setAttribute('aria-label', T({ en: `Mercator grid; the patch at ${Math.round(lat)}° is drawn ${num(areaFactor(lat), 1)} times its equator size`,
      bg: `Мрежа на Меркатор; парчето на ${Math.round(lat)}° е нарисувано ${num(areaFactor(lat), 1)} пъти по-голямо от размера си на екватора` }));
  };
  // Drag the patch (mouse or touch); the slider does the same from the keyboard.
  let dragging = false;
  const toLat = (clientY: number) => {
    const r = g.getBoundingClientRect(), y = ((clientY - r.top) / r.height) * H;
    const m = ((H / 2 - y) / (H / 2 - 10)) * merc(MAXLAT);
    return Math.max(-75, Math.min(75, (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI)));
  };
  shape.addEventListener('pointerdown', (e) => { dragging = true; shape.setPointerCapture(e.pointerId); });
  shape.addEventListener('pointermove', (e) => { if (dragging) { lat = toLat(e.clientY); sLat.set(Math.round(lat)); draw(); } });
  shape.addEventListener('pointerup', () => { dragging = false; });
  const sLat = slider({ label: T({ en: 'Latitude of the patch', bg: 'Ширина на парчето' }), min: -75, max: 75, step: 1, value: lat,
    format: (v) => `${Math.abs(v)}° ${v > 0 ? T({ en: 'N', bg: 'с.ш.' }) : v < 0 ? T({ en: 'S', bg: 'ю.ш.' }) : ''}`, onInput: (v) => { lat = v; draw(); } });
  controls.append(sLat.el);
  draw();
  return { reset() { lat = D.lat; sLat.set(lat); draw(); } };
}

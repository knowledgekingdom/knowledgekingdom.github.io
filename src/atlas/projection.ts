// The Atlas's map projection: Natural Earth I (Šavrič, Patterson, Jenny), a pleasing compromise
// for world maps. Output is in "atlas units": the whole world is about 5480 × 2860, y downwards.
// Shared by the build script (scripts/atlas-geo.mjs) and the page.
export const ATLAS_W = 5480;
export const ATLAS_H = 2860;
const RAD = Math.PI / 180;

export function project(lat: number, lon: number): [number, number] {
  const p = lat * RAD, l = lon * RAD, p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [Math.round((x + 2.74) * 1000), Math.round((1.43 - y) * 1000)];
}

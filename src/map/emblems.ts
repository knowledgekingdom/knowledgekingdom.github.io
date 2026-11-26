// Town emblems for the Kingdom Map: original line drawings on a 24 × 24 grid, drawn with the
// current colour (stroke), round caps. class="f" marks solid dots. One per chapter, chosen in
// content-meta/map-layout.json ("emblems"); "banner" is the placeholder for a new chapter and
// "scaffold" marks a planned one.
export const EMBLEMS: Record<string, string> = {
  banner: '<path d="M7 21V3M7 4h10l-3 4l3 4H7"/>',
  scaffold: '<path d="M5 21V6M19 21V6M5 6h14M5 11h14M5 16h14M5 6l14 5M5 11l14 5M3 21h18"/>',
  lantern: '<path d="M9 4h6M12 2v2M8 6h8l-1 13H9zM10 21h4"/><path d="M12 10.5c1.6 1.6 1.6 3.2 0 4.8c-1.6-1.6-1.6-3.2 0-4.8z"/>',
  scales: '<path d="M12 3v17M7 20.5h10M4 7h16M6 7l-3 6M6 7l3 6M18 7l-3 6M18 7l3 6M3 13a3 2 0 0 0 6 0M15 13a3 2 0 0 0 6 0"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle class="f" cx="8.6" cy="8.6" r="1.4"/><circle class="f" cx="12" cy="12" r="1.4"/><circle class="f" cx="15.4" cy="15.4" r="1.4"/>',
  hourglass: '<path d="M6 3h12M6 21h12M8 3v2.5c0 3 8 3.5 8 6.5s-8 3.5-8 6.5V21M16 3v2.5c0 3-8 3.5-8 6.5s8 3.5 8 6.5V21M10 18.5h4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M12 5l2.4 7L12 19l-2.4-7z"/><path class="f" d="M12 5l2.4 7H9.6z"/>',
  chart: '<path d="M4 20h16M4 4v16"/><path d="M8 20v-6M12 20V9M16 20v-9M20 20V6" stroke-width="2.6"/>',
  loop: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 3.5V8h-4.5"/><path class="f" d="M12 10.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 0 1 0-3.6z"/>',
  book: '<path d="M3 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0zM21 6c-3-1.5-6-1.5-9 0v13c3-1.5 6-1.5 9 0z"/>',
  footprints: '<ellipse cx="8.5" cy="15.5" rx="2.4" ry="4"/><ellipse cx="15.5" cy="8.5" rx="2.4" ry="4"/><circle class="f" cx="7.2" cy="9.8" r="1"/><circle class="f" cx="9.8" cy="10" r="1"/><circle class="f" cx="14.2" cy="2.9" r="1"/><circle class="f" cx="16.8" cy="3.1" r="1"/>',
  wheat: '<path d="M12 22V5"/><path d="M12 9c-3-.6-4.2-2.6-4.2-4.8c2.8.6 4.2 2.6 4.2 4.8zM12 9c3-.6 4.2-2.6 4.2-4.8c-2.8.6-4.2 2.6-4.2 4.8zM12 14c-3-.6-4.2-2.6-4.2-4.8c2.8.6 4.2 2.6 4.2 4.8zM12 14c3-.6 4.2-2.6 4.2-4.8c-2.8.6-4.2 2.6-4.2 4.8zM12 19c-3-.6-4.2-2.6-4.2-4.8c2.8.6 4.2 2.6 4.2 4.8zM12 19c3-.6 4.2-2.6 4.2-4.8c-2.8.6-4.2 2.6-4.2 4.8z"/>',
  ziggurat: '<path d="M2 20h20M4 20v-4h16v4M6.5 16v-4h11v4M9 12V8h6v4M11 8V5h2v3M12 20v-4"/>',
  pyramid: '<path d="M2 20h20M4 20l8-15l8 15M12 5l2.5 15"/><circle cx="19" cy="5" r="2"/>',
  seal: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 15.5c.5-2.5 2.5-3.5 5-3.5h2.5l1-2M9 15.5v2M14.5 15v2.5M15.5 10l2-3M7.5 8h3"/>',
  pagoda: '<path d="M12 2v2M5 8.5c3 0 5-2 7-4.5c2 2.5 4 4.5 7 4.5M7 8.5V12M17 8.5V12M4 13.5c3 0 5.5-1 8-2.5c2.5 1.5 5 2.5 8 2.5M7 13.5V20M17 13.5V20M10.5 20v-3h3v3M4 20h16"/>',
  crown: '<path d="M4 18h16M4.5 18L3 7l5 4l4-6l4 6l5-4l-1.5 11M4 21h16"/><circle class="f" cx="12" cy="14" r="1.2"/>',
  temple: '<path d="M3 9l9-5l9 5zM5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 18.5h18M2 21h20"/>',
  arch: '<path d="M4 21V9.5a8 8 0 0 1 16 0V21M8 21V11a4 4 0 0 1 8 0v10M2 21h20M4 9h16"/>',
  baobab: '<path d="M9.5 21c1-3.5 1.2-7 .3-10.5M14.5 21c-1-3.5-1.2-7-.3-10.5M9.8 10.5C7 10 5 8 4.5 5.5M14.2 10.5c2.8-.5 4.8-2.5 5.3-5M12 10V5M3 21h18"/><circle cx="4.5" cy="4.5" r="1.8"/><circle cx="12" cy="3.8" r="1.8"/><circle cx="19.5" cy="4.5" r="1.8"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  dome: '<path d="M5 20v-6.5a7 7 0 0 1 14 0V20M3 20h18M12 6.5V3.5M8 20v-4M16 20v-4M10.5 20v-3a1.5 1.5 0 0 1 3 0v3"/>',
  camel: '<path d="M3 13.5c0-2 1-3 2.5-3l1 1.5c1-3.5 3.5-3.5 4.5-.5c1-2.5 3.5-2.5 4.5.5l1.5-3.5c.5-1 1.5-1.2 2.5-.6l1.5 1.1l-2 .5l-1.5 4.5c-.5 2-2 3-4 3H8c-2 0-3.5-1-4-2.5M7 16.5V21M10 16.8V21M14 16.8V21M17 16V21"/>',
  yurt: '<path d="M3 20v-6.5c3-3.5 15-3.5 18 0V20zM3 13.5L12 7l9 6.5M12 7V5M10 20v-4h4v4M3 20h18"/>',
  tower: '<path d="M4 21V8h3v2h2.5V8h5v2H17V8h3v13M10 21v-4a2 2 0 0 1 4 0v4M3 21h18M8 13h1M15 13h1"/>',
  press: '<path d="M5 21V4h14v17M5 4h14M8 4v3h8V4M12 7v4M8 11h8v3H8zM3 21h18M7 17.5h10"/>',
  candle: '<path d="M9.5 21V10h5v11M7 21h10M12 10V8M12 3c1.6 2 1.6 3.5 0 5c-1.6-1.5-1.6-3 0-5z"/>',
  dhow: '<path d="M3 16.5h18l-3 4H6zM11 16.5V3M11 3.5c3 4 6 8 8.5 11H11"/><path d="M2 22c2 0 2-1 4-1s2 1 4 1s2-1 4-1s2 1 4 1s2-1 4-1"/>',
  ship: '<path d="M3 16.5h18l-3 4H6zM12 16.5V2.5M7 4.5h10c.6 1.6.6 3.4 0 5H7c-.6-1.6-.6-3.4 0-5zM8 11h8c.5 1.3.5 2.7 0 4H8c-.5-1.3-.5-2.7 0-4zM12 2.5l3 1"/>',
  maize: '<path d="M12 22v-8M12 22c-4-2-6-6-6-11M12 22c4-2 6-6 6-11M12 3c2 0 3 2.5 3 5.5s-1 6-3 6s-3-3-3-6s1-5.5 3-5.5zM10 7h4M9.6 10h4.8"/>',
  chain: '<path d="M9 15.5H6.5a3.5 3.5 0 0 1 0-7H10a3.5 3.5 0 0 1 2.5 1M15 8.5h2.5a3.5 3.5 0 0 1 0 7H14a3.5 3.5 0 0 1-2.5-1M11.5 5.5l.8-2.3M8 5.3l1.2 2M12.5 18.5l-.8 2.3M16 18.7l-1.2-2"/>',
  palace: '<path d="M2 20h20M3.5 20v-6h17v6M5 14a2 2 0 0 1 4 0M15 14a2 2 0 0 1 4 0M9 14v-3.5a3 3 0 0 1 6 0V14M12 7.5V5M11 20v-3h2v3"/>',
  telescope: '<path d="M3.5 12.5l13-5.5l2 4.2l-13 5.5zM16.5 7l2.2-1l2 4.2l-2.2 1M10.5 13.8L8 21M10.5 13.8l4 7.2M6 21h11"/>',
  torch: '<path d="M10 12h4l-1 9h-2zM8.5 12h7M12 2.5c2.2 2 3.2 4.2 2.2 6.3c-.9 1.3-3.5 1.3-4.4 0c-1-2.1 0-4.3 2.2-6.3z"/>',
  star: '<path d="M12 3l2.6 5.6l6 .7l-4.5 4.1l1.2 6L12 16.4l-5.3 3l1.2-6L3.4 9.3l6-.7z"/>',
  factory: '<path d="M3 21V11.5l5 3v-3l5 3v-3l5 3V4h3v17zM3 21h18M7 18h1.5M11.5 18H13M16 18h1.5"/><path d="M19.5 3c0-1 1-1.5 2-1.2"/>',
  map: '<path d="M3 6.5l6-2.5l6 2.5l6-2.5v13.5l-6 2.5l-6-2.5l-6 2.5zM9 4v13.5M15 6.5V20"/>',
  flag: '<path d="M5 21V3M5 4h13l-2.5 4l2.5 4H5"/><circle class="f" cx="10.5" cy="8" r="1.4"/>',
  bridge: '<path d="M2 15.5h20M2 15.5C5 9.5 8.5 7.5 12 7.5s7 2 10 8M6 15.5v-4.3M12 15.5v-8M18 15.5v-4.3"/><path d="M2 20c2 0 2-1 4-1s2 1 4 1s2-1 4-1s2 1 4 1s2-1 4-1"/>',
  poppy: '<path d="M12 21v-8M12 17.5c-1.6-1.4-3.2-1.6-4.6-.6"/><path d="M12 13c-3.8 0-6-2-6-4.4S8 4 10 5c1-2 3-2 4 0c2-1 4 1.2 4 3.6S15.8 13 12 13z"/><circle class="f" cx="12" cy="8.8" r="1.6"/>',
  radio: '<rect x="3" y="9" width="18" height="11.5" rx="2"/><path d="M7.5 9l8-6M6 13.5h5M6 16.5h5"/><circle cx="16" cy="15" r="3"/><path d="M16 15l1.6-1.6"/>',
  memorial: '<path d="M8 21V11.5h8V21M5.5 21h13M10.5 14.5h3M10.5 17.5h3"/><path d="M12 3c1.8 2.2 1.8 4 0 5.6c-1.8-1.6-1.8-3.4 0-5.6z"/>',
  wall: '<path d="M2 20V8h8.5v12M13.5 20V8H22v12M2 12h8.5M13.5 12H22M2 16h8.5M13.5 16H22M6 8v4M6 16v4M4 12v4M8.5 12v4M17.5 8v4M17.5 16v4M15.5 12v4M20 12v4M1 20.5h22"/>',
  swords: '<path d="M4 4l11 11M13 17l4-4M15 15l3.6 3.6M20 4L9 15M11 17l-4-4M9 15l-3.6 3.6"/><circle class="f" cx="19.4" cy="19.4" r="1.3"/><circle class="f" cx="4.6" cy="19.4" r="1.3"/>',
  pass: '<path d="M2 20l6.5-12l3.5 5.5l3-4.5l7 11zM8.5 8l1.8 3M15 9l1.4 2.2M12.5 14c-.4 2.2-1.6 4.4-3.5 6M2 20h20"/>',
  crates: '<rect x="3" y="12" width="8" height="8"/><rect x="13" y="12" width="8" height="8"/><rect x="8" y="4" width="8" height="8"/><path d="M3 12l8 8M13 12l8 8M8 4l8 8M2 20.5h20"/>',
  handshake: '<path d="M2 9h3.5v8H2M22 9h-3.5v8H22M5.5 10.5c2-1.6 4.2-1.8 6.5-.3l3.2 2.6c.8.7.1 2-1 1.6l-3.2-1.9M18.5 10.5c-1.6-.3-3.2.2-4.8 1.2M5.5 15.5l3.6 3c.7.6 1.7.5 2.2-.2M8.6 14.8l3.1 2.6c.7.6 1.7.4 2.1-.4M11.4 13.6l2.9 2.4c.8.6 1.8.3 2.1-.6l2.1-.9"/>',
  gavel: '<path d="M10 7.5l4.5-4.5l6.5 6.5l-4.5 4.5zM12.7 11.3L4 20M3 21.5h9"/>',
  atom: '<ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)"/><circle class="f" cx="12" cy="12" r="1.7"/>',
  rift: '<path d="M3 11l9-7l9 7M5 9.5V20h14V9.5M12 4l-1.2 4l2.2 3l-2.2 3l2.2 3l-1 3M2 20h20"/>',
};

/**
 * How each emblem moves when it comes alive (src/styles/emblems.css): the scales tip, the dice
 * tumble, the hourglass turns over, ships rock on the swell, wheat sways, flames flicker…
 */
export const EMBLEM_MOTION: Record<string, string> = {
  banner: 'wave', scaffold: 'rise', lantern: 'flicker', scales: 'tilt', dice: 'tumble', hourglass: 'flip', compass: 'swing',
  chart: 'grow', loop: 'spin', book: 'open', footprints: 'step', wheat: 'sway', ziggurat: 'rise', pyramid: 'glint', seal: 'stamp',
  pagoda: 'bob', crown: 'glint', temple: 'rise', arch: 'rise', baobab: 'sway', sun: 'spin', dome: 'glint', camel: 'walk', yurt: 'bob',
  tower: 'rise', press: 'stamp', candle: 'flicker', dhow: 'rock', ship: 'rock', maize: 'sway', chain: 'shake', palace: 'glint',
  telescope: 'sweep', torch: 'flicker', star: 'twinkle', factory: 'puff', map: 'open', flag: 'wave', bridge: 'bob', poppy: 'sway',
  radio: 'shake', memorial: 'flicker', wall: 'shake', swords: 'tilt', pass: 'rise', crates: 'bob', handshake: 'shake', gavel: 'stamp', atom: 'spin', rift: 'shake',
};

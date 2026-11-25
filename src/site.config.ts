// Hand-maintained site settings. Everything about the book itself comes from
// the manuscript import (src/data/book.json).
export const site = {
  /** Canonical origin, used for sitemap / Open Graph. Change this if you add your own domain. */
  url: 'https://knowledgekingdom.github.io',
  /**
   * GoatCounter site code (https://semirk24.goatcounter.com) for privacy-friendly
   * visitor counts: no cookies, no personal data. Set to '' to turn analytics off.
   * Visits from localhost are never counted.
   */
  goatcounter: 'semirk24',
  /** Footer line. `{year}` is replaced with the current year at build time. */
  footer: '© {year} Semir. Written with AI assistance',
  /** Short description used on the homepage and as the default meta description. */
  description:
    'An illustrated guide to understanding the world: reasoning tools and connected world history, free to read online.',
  /** Default colour palette (see src/styles/palettes.css). */
  palette: 'tidewater' as PaletteId,
  /** Let readers choose a colour palette from the header (remembered per browser). */
  paletteSwitcher: true,
};

export const palettes = [
  { id: 'tidewater', name: 'Tidewater', note: 'Warm paper · teal & terracotta', swatches: ['#f7f3ea', '#13707a', '#a0472a'] },
  { id: 'atlas', name: 'Atlas', note: 'Parchment · forest & oxblood', swatches: ['#f1eee4', '#2c6649', '#8c2c38'] },
  { id: 'encyclopedia', name: 'Encyclopedia', note: 'Cream · navy & gold', swatches: ['#f5f0e4', '#284a86', '#8a5d06'] },
  { id: 'museum', name: 'Museum', note: 'Gallery white · cobalt & vermilion', swatches: ['#fbfaf7', '#2443b0', '#bb3720'] },
] as const;

export type PaletteId = (typeof palettes)[number]['id'];

export function footerText(): string {
  return site.footer.replace('{year}', String(new Date().getFullYear()));
}

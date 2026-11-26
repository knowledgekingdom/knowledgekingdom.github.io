// Switch whole features on or off in one place. A feature that breaks can be turned off
// here (set it to false, commit, push) without blocking the rest of the site.
// Features that aren't built yet are listed as false so their place is reserved.
export const features = {
  /** Reading progress, "Continue reading", ticks on read sections. */
  progress: true,
  /** Export / import my progress as a file. */
  progressTransfer: true,
  /** Count feature use (flashcards, games, map, listen) in GoatCounter. No cookies. */
  analyticsEvents: true,
  /** Timeline page. */
  timeline: true,

  // v2 phases, switched on as they're built
  pageTransitions: true,
  previews: true,
  listen: true,
  offline: true,
  review: true,
  games: true,
  explorables: true,
  kingdomMap: true,
  /** Motion & Story, M1: a short generated film for each chapter ("Watch the trailer"). */
  trailers: true,
  atlas: true,
  constellation: false,
} as const;

export type Feature = keyof typeof features;
export const enabled = (f: Feature): boolean => features[f];

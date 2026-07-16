/**
 * The file extensions ember source can be authored in.
 *
 * Mirrors embroider's canonical list, which is only exported from
 * `@embroider/vite` (its `src/ember.ts`) — copied rather than depended on so
 * this shared tooling stays bundler-agnostic. Keep in sync.
 */
export const extensions = [
  ".mjs",
  ".gjs",
  ".js",
  ".mts",
  ".gts",
  ".ts",
  ".hbs",
  ".hbs.js",
  ".json",
];

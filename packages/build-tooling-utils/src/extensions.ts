/**
 * The file extensions ember source can be authored in.
 *
 * This mirrors embroider's canonical list, which today is only exported from
 * `@embroider/vite` (see its `src/ember.ts`: `export let extensions = [...]`).
 * We intentionally copy it rather than depend on `@embroider/vite`, so this
 * shared tooling stays bundler-agnostic (usable from both the vite and
 * rolldown/tsdown meta-plugins). Keep in sync if embroider's list changes
 * (it rarely does).
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

import type { Plugin } from "rolldown";

import { emberBabel, type BabelOptions } from "./src/babel.ts";
import { emberExternals } from "./src/externals.ts";
import { emberIsolatedDeclarations } from "./src/isolated-declarations.ts";
import { emberTransform } from "./src/transform.ts";

export { defineConfig } from "./src/define-config.ts";

interface Config {
  /**
   * Options for the babel step (see `BabelOptions`):
   *
   * - `configFile`: which babel config file to use. By default the library's
   *   own `babel.config.{js,mjs,cjs,json}` is auto-detected and used when
   *   present; otherwise a built-in default config (TypeScript stripping,
   *   template compilation to `precompileTemplate`, decorator-transforms)
   *   applies.
   * - `babelHelpers`: how `@rollup/plugin-babel` injects helpers. Libraries
   *   should almost always use `"bundled"` (the default here) so the emitted
   *   output is self-contained and does not require `@babel/runtime` as a
   *   runtime dependency of the consuming app.
   *   https://github.com/rollup/plugins/tree/master/packages/babel#babelhelpers
   * - `plugins`: extra babel plugins, appended after the config's (or the
   *   built-in default) plugins.
   * - `filter`: opt additional files into babel. By default babel only runs
   *   on files that need it (template-tag, decorators, template imports);
   *   everything else stays on the fast native (oxc) transform. Use this to
   *   cover addons that ship code needing babel, e.g.
   *   `{ include: { imports: ["ember-concurrency"], code: [] } }`.
   */
  babel?: BabelOptions;
}

/**
 * A batteries-included plugin for building Ember v2 libraries (addons) with
 * rolldown (or tsdown, which is built on rolldown).
 *
 * It bundles everything needed to compile `.gts`/`.gjs` and template-tag
 * (`<template>`) source into publishable output:
 *
 * - `emberIsolatedDeclarations()` — errors when a tsconfig.json is present
 *   without `isolatedDeclarations: true` (required: it is the only
 *   declaration pipeline that can see compiled template-tag modules).
 * - `emberExternals()` — keeps your dependencies, peerDependencies, and the
 *   ember virtual packages external, so consuming apps resolve them.
 * - `emberTransform()` — preprocesses `<template>` via content-tag and maps
 *   `.gts`/`.gjs` to `.ts`/`.js` so rolldown can understand them.
 * - `emberBabel()` — runs babel (template compilation, decorators, type
 *   stripping) with `babelHelpers: "bundled"`, but only on the files that
 *   actually need it (via `maybeBabel`); everything else stays on the fast
 *   native transform. The library's own `babel.config.js` is used when it
 *   exists; otherwise a built-in default config applies, so no
 *   `babel.config.js` is required.
 *
 * Usage in `tsdown.config.js` / `rolldown.config.js`:
 *
 * ```js
 * import { ember } from "@nullvoxpopuli/ember-rolldown";
 *
 * export default defineConfig({
 *   entry: ["./src/index.ts"],
 *   dts: true,
 *   plugins: [ember()],
 * });
 * ```
 */
export function ember(config: Config = {}): Plugin[] {
  return [
    emberIsolatedDeclarations(),
    emberExternals(),
    emberTransform(),
    emberBabel(config.babel),
  ];
}

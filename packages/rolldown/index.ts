import type { Plugin } from "rolldown";

import { emberBabel, type BabelOptions } from "./src/babel.ts";
import { emberConfig } from "./src/config.ts";
import { emberExternals } from "./src/externals.ts";
import { emberIsolatedDeclarations } from "./src/isolated-declarations.ts";
import { emberTransform } from "./src/transform.ts";

export { defineConfig } from "./src/define-config.ts";

interface Config {
  /**
   * Options for the babel step; see `BabelOptions`.
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
 * - `emberConfig()` — applies sensible tsdown defaults for a library build
 *   (sourcemaps, `clean`, `dts`, `.js`/`.d.ts` extensions, quiet logging);
 *   anything you set explicitly still wins.
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
 *   exists; no config file is required.
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
    emberConfig(),
    emberIsolatedDeclarations(),
    emberExternals(),
    emberTransform(),
    emberBabel(config.babel),
  ];
}

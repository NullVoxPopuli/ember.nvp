import type { Plugin } from "rolldown";

import { emberBabel } from "./src/babel.ts";
import { emberExternals } from "./src/externals.ts";
import { emberTransform } from "./src/transform.ts";

interface Config {
  /**
   * optional babel config
   */
  babel?: {
    /**
     * How `@rollup/plugin-babel` injects helpers.
     *
     * Libraries should almost always use `"bundled"` (the default here) so the
     * emitted output is self-contained and does not require `@babel/runtime` as
     * a runtime dependency of the consuming app.
     *
     * https://github.com/rollup/plugins/tree/master/packages/babel#babelhelpers
     */
    babelHelpers?: "bundled" | "runtime" | "inline" | "external";

    /**
     * Extra babel plugins to run, appended after the built-in ember plugins
     * (TypeScript stripping + template compilation).
     */
    plugins?: unknown[];

    /**
     * Opt additional files into babel. By default babel only runs on files
     * that need it (template-tag, decorators, template imports); everything
     * else stays on the fast native (oxc) transform. Use this to cover addons
     * that ship code needing babel, e.g. `{ include: { imports: ["ember-concurrency"], code: [] } }`.
     */
    filter?: {
      include: {
        imports: string[];
        code: (string | RegExp)[];
      };
    };
  };
}

/**
 * A batteries-included plugin for building Ember v2 libraries (addons) with
 * rolldown (or tsdown, which is built on rolldown).
 *
 * It bundles everything needed to compile `.gts`/`.gjs` and template-tag
 * (`<template>`) source into publishable output:
 *
 * - `emberExternals()` — keeps your dependencies, peerDependencies, and the
 *   ember virtual packages external, so consuming apps resolve them.
 * - `emberTransform()` — preprocesses `<template>` via content-tag and maps
 *   `.gts`/`.gjs` to `.ts`/`.js` so rolldown can understand them.
 * - `emberBabel()` — runs babel (template compilation, decorators, type
 *   stripping) with `babelHelpers: "bundled"`, but only on the files that
 *   actually need it (via `maybeBabel`); everything else stays on the fast
 *   native transform. No `babel.config.js` required.
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
  return [emberExternals(), emberTransform(), emberBabel(config.babel)];
}

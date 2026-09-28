import { emberBabel, type BabelOptions } from "./src/babel.ts";
import { emberBundle } from "./src/bundle.ts";
import { emberConfig } from "./src/config.ts";
import { emberExternals } from "./src/externals.ts";
import { emberIsolatedDeclarations } from "./src/isolated-declarations.ts";
import { emberTransform } from "./src/transform.ts";
import type { RolldownPluginLike } from "./src/plugin-like.ts";

interface Config {
  /**
   * Build a self-contained package instead of a library.
   *
   * `false` (the default) builds a library for Ember apps:
   * - ember, the package's dependencies, and its peerDependencies stay external
   * - templates are shipped as `precompileTemplate` calls,
   *   for the consuming app to compile
   *
   * `true` builds an artifact that runs on any page, such as a custom element:
   * - ember-source, `@glimmer/component`, `decorator-transforms`,
   *   and every other dependency are bundled in
   * - templates are compiled to the wire format with that same ember-source
   * - declarations bundle their type imports as well
   *
   * Which ember-source build is bundled follows the export conditions:
   * - production by default
   * - development with `resolve.conditionNames: ["development"]`
   */
  bundle?: boolean;
  /**
   * Options for the babel step.
   * See `BabelOptions`.
   */
  babel?: BabelOptions;
}

/**
 * A batteries-included plugin for building Ember v2 libraries (addons)
 * with rolldown, or with tsdown (which is built on rolldown).
 *
 * It bundles everything needed to compile `.gts` / `.gjs` and
 * template-tag (`<template>`) source into publishable output:
 *
 * - `emberConfig()`
 *   applies sensible tsdown defaults for a library build
 *   (sourcemaps, `clean`, `dts`, `.js` / `.d.ts` extensions, quiet logging).
 *   Anything you set explicitly still wins.
 *
 * - `emberIsolatedDeclarations()`
 *   errors when a tsconfig.json is present without `isolatedDeclarations: true`.
 *   That is the only declaration pipeline that can see compiled template-tag modules.
 *
 * - `emberExternals()`
 *   keeps your dependencies, peerDependencies, and the ember virtual packages external,
 *   so consuming apps resolve them.
 *
 * - `emberBundle()`
 *   bundle mode only, in place of `emberExternals()`.
 *   Aliases the ember virtual packages into ember-source,
 *   whose export conditions pick the build to bundle.
 *
 * - `emberTransform()`
 *   preprocesses `<template>` via content-tag,
 *   and maps `.gts` / `.gjs` to `.ts` / `.js` so rolldown can understand them.
 *
 * - `emberBabel()`
 *   runs babel (template compilation, decorators, type stripping)
 *   with `babelHelpers: "bundled"`.
 *   Only the files that need it go through babel (via `maybeBabel`).
 *   Everything else stays on the fast native transform.
 *   The library's own `babel.config.js` is used when it exists.
 *   No config file is required.
 *
 * Usage in `tsdown.config.js`.
 * Import `defineConfig` from `tsdown` (or from `rolldown` for a `rolldown.config.js`)
 * so it carries the correct types:
 *
 * ```js
 * import { defineConfig } from "tsdown";
 * import { ember } from "@nullvoxpopuli/ember-rolldown";
 *
 * export default defineConfig({
 *   entry: ["./src/index.ts"],
 *   plugins: [ember()],
 * });
 * ```
 */
export function ember(config: Config = {}): RolldownPluginLike[] {
  const bundle = config.bundle ?? false;

  return [
    emberConfig({ bundle }),
    emberIsolatedDeclarations(),
    bundle ? emberBundle() : emberExternals(),
    emberTransform(),
    emberBabel({ ...config.babel, bundle }),
  ];
}

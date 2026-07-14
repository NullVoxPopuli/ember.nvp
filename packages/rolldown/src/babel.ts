import { babel } from "@rollup/plugin-babel";
import transformTypeScript from "@babel/plugin-transform-typescript";
import templateCompilation from "babel-plugin-ember-template-compilation";
import decoratorTransforms from "decorator-transforms";
import type { Plugin } from "rolldown";

/**
 * The file extensions babel should consider. `.gts`/`.gjs` are included even
 * though `emberTransform()` renames them to `.ts`/`.js` before babel runs --
 * keeping them here is harmless and matches the ember tooling convention.
 *
 * This mirrors embroider's canonical list, which today is only exported from
 * `@embroider/vite` (see its `src/ember.ts`: `export let extensions = [...]`).
 * We intentionally copy it rather than depend on `@embroider/vite`, so this
 * rolldown/tsdown-oriented package stays vite-free. Keep in sync if embroider's
 * list changes (it rarely does).
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

interface BabelOptions {
  babelHelpers?: "bundled" | "runtime" | "inline" | "external";
  /**
   * Extra babel plugins to run, appended after the built-in ember plugins.
   */
  plugins?: unknown[];
}

/**
 * Runs babel over the (already template-preprocessed) source. This is where
 * template compilation and TypeScript type stripping happen.
 *
 * We still need babel (not just oxc/rolldown's native transforms) because of
 * decorators: Ember uses the legacy/stage-1 decorator signature together with
 * `decorator-transforms`, which rewrites decorated class fields (`@tracked x`)
 * into getter/setters backed by a runtime. oxc's native "legacy decorators"
 * emit tsc-style `__decorate` output, which does not match those semantics.
 *
 * We import the babel plugins here and pass them as instances -- rather than
 * pointing babel at a `babel.config.js` -- on purpose. `@babel/core` is a CJS
 * package that optimistically loads config files and plugins-by-name with a
 * synchronous `require()`. In an all-ESM stack that means `require()`-ing ESM
 * modules, which crashes under bundlers (e.g. tsdown) that are concurrently
 * loading those same modules through the async import graph. Handing babel
 * ready-made plugin instances (with `configFile: false`) means it never has to
 * resolve or `require()` anything itself, keeping the pipeline pure-ESM.
 *
 * Libraries default to `babelHelpers: "bundled"` so the emitted output is
 * self-contained.
 */
export function emberBabel(options: BabelOptions = {}): Plugin {
  const plugin = babel({
    babelHelpers: options.babelHelpers ?? "bundled",
    extensions,
    // Don't let babel discover or `require()` a config file -- we provide the
    // whole plugin list inline.
    configFile: false,
    babelrc: false,
    skipPreflightCheck: true,
    plugins: [
      [
        transformTypeScript,
        {
          allExtensions: true,
          onlyRemoveTypeImports: true,
          allowDeclareFields: true,
        },
      ],
      [templateCompilation],
      [
        decoratorTransforms,
        {
          // Emit `import ... from "decorator-transforms/runtime-esm"` as a bare
          // specifier so it stays external and the consuming app resolves it.
          runtime: { import: "decorator-transforms/runtime-esm" },
        },
      ],
      ...(options.plugins ?? []),
    ],
  });

  return {
    ...plugin,
    name: "nullvoxpopuli:ember-rolldown:babel",
  } as Plugin;
}

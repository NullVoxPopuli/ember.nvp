import { maybeBabel } from "@nullvoxpopuli/ember-build-tooling-utils";
import transformTypeScript from "@babel/plugin-transform-typescript";
import templateCompilation from "babel-plugin-ember-template-compilation";
import decoratorTransforms from "decorator-transforms";
import type { Plugin } from "rolldown";

interface BabelOptions {
  babelHelpers?: "bundled" | "runtime" | "inline" | "external";
  /**
   * Extra babel plugins to run, appended after the built-in ember plugins.
   */
  plugins?: unknown[];
  /**
   * Opt additional files into babel (see maybeBabel's `filter`). Use this to
   * cover addons that ship code needing babel (e.g. `ember-concurrency`).
   */
  filter?: {
    include: {
      imports: string[];
      code: (string | RegExp)[];
    };
  };
}

/**
 * We still need babel (not just oxc/rolldown's native transforms) because of
 * decorators: Ember uses the legacy/stage-1 decorator signature together with
 * `decorator-transforms`, which rewrites decorated class fields (`@tracked x`)
 * into getter/setters backed by a runtime. oxc's native "legacy decorators"
 * emit tsc-style `__decorate` output, which does not match those semantics.
 *
 * But we don't want to send *every* file through babel and give back the speed
 * rolldown/oxc buys us -- so we run babel via `maybeBabel`, which filters down
 * to only the files that actually need it (template-tag, decorators, template
 * imports). Everything else stays on the native transform.
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
  return maybeBabel({
    babelHelpers: options.babelHelpers ?? "bundled",
    // Don't let babel discover or `require()` a config file -- we provide the
    // whole plugin list inline.
    configFile: false,
    babelrc: false,
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
    filter: options.filter,
  }) as unknown as Plugin;
}

import { maybeBabel } from "@nullvoxpopuli/ember-build-tooling-utils";
import transformTypeScript from "@babel/plugin-transform-typescript";
import templateCompilation from "babel-plugin-ember-template-compilation";
import decoratorTransforms from "decorator-transforms";
import { loadPartialConfigSync } from "@babel/core";
import type { PluginItem } from "@babel/core";
import type { Plugin } from "rolldown";

export interface BabelOptions {
  babelHelpers?: "bundled" | "runtime" | "inline" | "external";
  /**
   * The babel config file to use.
   *
   * - `undefined`: auto-detect the project's babel config (via babel's own
   *   config resolution).
   * - a string: use that config file.
   * - `false`: ignore config files entirely.
   *
   * Without a config file, templates, decorators, and TypeScript are still
   * handled (see `defaultPlugins`).
   */
  configFile?: string | false;
  /**
   * Extra babel plugins to run, appended after the config's plugins.
   */
  plugins?: PluginItem[];
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
 * Resolve the project's root babel config the way babel itself does
 * (`babel.config.{js,cjs,mjs,cts,json}`, honoring `rootMode` semantics).
 *
 * The sync API evaluates the config file; on node 24+ that works for native
 * ESM configs too (require(esm)).
 */
function detectConfigFile(): string | undefined {
  const partial = loadPartialConfigSync({ cwd: process.cwd() });

  return partial?.config ?? undefined;
}

/**
 * Everything a library without its own babel config needs:
 *
 * - TypeScript stripping
 * - template compilation to `precompileTemplate` (`targetFormat: "hbs"`).
 *   Published libraries must NOT ship wire format: the wire format is
 *   private between the template compiler and the glimmer runtime of the
 *   same version, so baking it in ties the published artifact to the
 *   consuming app's exact ember-source. The consuming app performs final
 *   compilation.
 * - decorator-transforms, with its runtime left as a bare specifier so the
 *   consuming app resolves it (the library keeps `decorator-transforms` as
 *   a real dependency).
 */
function defaultPlugins(): PluginItem[] {
  return [
    [
      transformTypeScript,
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ],
    [templateCompilation, { targetFormat: "hbs" }],
    [
      decoratorTransforms,
      {
        // Emit `import ... from "decorator-transforms/runtime-esm"` as a bare
        // specifier so it stays external and the consuming app resolves it.
        runtime: { import: "decorator-transforms/runtime-esm" },
      },
    ],
  ];
}

/**
 * We still need babel (not just oxc/rolldown's native transforms) for two
 * reasons:
 *
 * - template compilation: `babel-plugin-ember-template-compilation` turns the
 *   content-tag output into `precompileTemplate` calls; oxc has no equivalent.
 * - decorators: Ember uses the legacy/stage-1 decorator signature together
 *   with `decorator-transforms`, which rewrites decorated class fields
 *   (`@tracked x`) into getter/setters backed by a runtime. oxc's native
 *   "legacy decorators" emit tsc-style `__decorate` output, which does not
 *   match those semantics.
 *
 * But we don't want to send *every* file through babel and give back the speed
 * rolldown/oxc buys us -- so we run babel via `maybeBabel`, which filters down
 * to only the files that actually need it (template-tag, decorators, template
 * imports). Everything else stays on the native transform.
 *
 * The library's own babel config is used when it exists; without one,
 * `defaultPlugins` covers templates, decorators, and TypeScript, so no
 * config file is required.
 *
 * Libraries default to `babelHelpers: "bundled"` so the emitted output is
 * self-contained.
 */
export function emberBabel(options: BabelOptions = {}): Plugin {
  const configFile = options.configFile === undefined ? detectConfigFile() : options.configFile;

  const shared = {
    babelHelpers: options.babelHelpers ?? "bundled",
    filter: options.filter,
  };

  if (configFile) {
    return maybeBabel({
      ...shared,
      configFile,
      plugins: options.plugins ?? [],
    }) as unknown as Plugin;
  }

  return maybeBabel({
    ...shared,
    // No config file (or the caller opted out): don't let babel go looking
    // for one -- we provide the whole plugin list inline.
    configFile: false,
    babelrc: false,
    plugins: defaultPlugins().concat(options.plugins ?? []),
  }) as unknown as Plugin;
}

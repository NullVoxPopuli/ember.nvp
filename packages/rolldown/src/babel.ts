import { maybeBabel } from "@nullvoxpopuli/ember-build-tooling-utils";
import transformTypeScript from "@babel/plugin-transform-typescript";
import templateCompilation from "babel-plugin-ember-template-compilation";
import decoratorTransforms from "decorator-transforms";
import { loadPartialConfigSync } from "@babel/core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PluginItem } from "@babel/core";
import type { Transform } from "babel-plugin-ember-template-compilation";
import type { Plugin } from "rolldown";

export interface BabelOptions {
  babelHelpers?: "bundled" | "runtime" | "inline" | "external";
  /**
   * The babel config file to use.
   *
   * - `undefined`: auto-detect. A `babel.publish.config.*` wins, because this
   *   is a publish build; otherwise babel's own config resolution applies
   *   (see `detectConfigFile`).
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
   * Template AST transforms (e.g. ember-scoped-css's `scopedCSS.template()`)
   * passed to the default `babel-plugin-ember-template-compilation` entry.
   *
   * Only valid without a babel config file: with your own config, you list
   * `babel-plugin-ember-template-compilation` yourself, so its `transforms`
   * belong there.
   */
  templateTransforms?: Transform[];
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

/** Tried in order, so an ESM config wins over a JSON one of the same name. */
const PUBLISH_CONFIG_EXTENSIONS = ["mjs", "cjs", "js", "mts", "cts", "ts", "json"];

/**
 * A `babel.publish.config.*` next to package.json, if there is one.
 *
 * A library's plain `babel.config.*` is its *development* config: it typically
 * compiles `@embroider/macros` away, targets the wire format, and wires up
 * whatever the in-package demo app or test suite needs. None of that belongs in
 * a published artifact -- macros must stay for the consuming app to evaluate,
 * and the wire format is private between one template compiler and one glimmer
 * runtime. Babel's own resolution can't tell the two apart (it finds whatever
 * `babel.config.*` exists), so a publish build has to prefer the config named
 * for publishing.
 */
function detectPublishConfigFile(): string | undefined {
  for (const extension of PUBLISH_CONFIG_EXTENSIONS) {
    const candidate = resolve(`babel.publish.config.${extension}`);

    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

/**
 * The config this publish build should use: a `babel.publish.config.*` when the
 * library has one, else the project's root babel config resolved the way babel
 * itself does (`babel.config.{js,cjs,mjs,cts,json}`, honoring `rootMode`
 * semantics) -- which for a library whose only config *is* its publish config
 * is the same file either way.
 *
 * The sync API evaluates the config file; on node 24+ that works for native
 * ESM configs too (require(esm)).
 */
function detectConfigFile(): string | undefined {
  const publishConfig = detectPublishConfigFile();

  if (publishConfig) return publishConfig;

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
function defaultPlugins(templateTransforms?: Transform[]): PluginItem[] {
  return [
    [
      transformTypeScript,
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ],
    [templateCompilation, { targetFormat: "hbs", transforms: templateTransforms ?? [] }],
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
 * The library's own babel config is used when it exists -- its
 * `babel.publish.config.*` in preference to its `babel.config.*`, since this is
 * a publish build. Without one, `defaultPlugins` covers templates, decorators,
 * and TypeScript, so no config file is required.
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
    if (options.templateTransforms?.length) {
      throw new Error(
        `\`babel.templateTransforms\` cannot be combined with a babel config file (found ${configFile}). ` +
          `Your config lists babel-plugin-ember-template-compilation itself, so pass the transforms ` +
          `to its \`transforms\` option there instead.`,
      );
    }

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
    plugins: defaultPlugins(options.templateTransforms).concat(options.plugins ?? []),
  }) as unknown as Plugin;
}

/**
 * Reasons we have to have babel
 * - decorators
 * - ember-concurrency
 * - scoped-css
 * - template compilation optimization
 *
 * `maybeBabel` runs babel ONLY on the files that actually need it:
 * - template-tag files
 * - files importing template/macro modules
 * - local code using decorators
 *
 * Everything else skips babel, so the bundler's native (oxc) transform handles it.
 * The whole point is to keep the fast path fast,
 * and not re-slow the build by sending every file through babel.
 *
 * This is shared between the vite (app) and rolldown/tsdown (library) meta-plugins.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { and, code, id, include, interpreter, not, or } from "@rolldown/pluginutils";
import babel from "@rolldown/plugin-babel";
import type { Plugin } from "rolldown";

import { extensions } from "./extensions.ts";

/**
 * If a file imports any of these, it needs babel:
 * - templates
 * - macros
 * - a couple of addons that ship decorator-adjacent runtime code
 */
const babelRequiredImports = [
  // Templates
  // (old non template() form)
  "@ember/template-compiler",
  "@ember/template-compilation",

  // Legacy templates (hbs / loose mode)
  "ember-cli-htmlbars",
  "ember-cli-htmlbars-inline-precompile",
  "htmlbars-inline-precompile",

  // Build Macros
  // (since import.meta.env is not available in all environments)
  "@embroider/macros",
  "@glimmer/env",
  "@ember/debug",
  "@ember/application/deprecations",
];

const decoratorRegex = /(?<![\w'"`])(?<!\*\s+)(?<!\/\/[^\n]*)(?<!\/\*[^\n]*)@\w+/;
//                     └────┬─────┘└───┬───┘└──────┬──────┘└──────┬──────┘└┬─┘
//                          │          │           │              │        │
//                          │          │           │              │        └── the `@decorator`
//                          │          │           │              └──────── not inside a single-line block comment (`/* @dec */`)
//                          │          │           └─────────────────────── not on a `//` line comment
//                          │          └─────────────────────────────────── not a JSDoc tag, even with multiple spaces (`*    @param`)
//                          └────────────────────────────────────────────── not mid-identifier or inside a string

const nodeModulesPattern = /\/node_modules\//;

const extensionRegExp = new RegExp(
  `(${extensions
    .filter((ext) => ext !== ".json")
    .map(RegExp.escape)
    .join("|")})(\\?.*)?(#.*)?$`,
);

type RolldownBabelOptions = Parameters<typeof babel>[0];

type Options = Omit<RolldownBabelOptions, "include" | "exclude" | "parallel" | "runtimeVersion"> & {
  /**
   * The babel config file to use, or `false` for none.
   */
  configFile?: string | false;
  /**
   * Transform files in worker threads.
   * `true` uses one worker per CPU core, with a maximum of 4.
   *
   * Only options that can go to a worker thread allow this:
   * a config file, and plugins given by name.
   * With plugin functions, babel stays in the main thread.
   */
  parallel?: boolean | number;
  filter?: {
    include: {
      /**
       * If any additional (custom) plugins are provided,
       * a pattern must be provided that detects their usage.
       *
       * for example, to also run babel on files that import from ember-concurrency
       * ```js
       * {
       *   imports: ['ember-concurrency'],
       * }
       * ```
       */
      imports: string[];
      /**
       * If any additional (custom) plugins are provided,
       * a pattern must be provided that detects their usage.
       *
       * for example, to also run babel on files that use polyfilled APIs,
       * or use the "formatMessage" technique for translations
       * ```js
       * {
       *   code: ['myPolyfilledAPICall(', /\bintl\.formatMessage\b/],
       * }
       * ```
       */
      code: (string | RegExp)[];
      /**
       * Module ids that always go to babel.
       *
       * for example, the icon modules of unplugin-icons
       * ```js
       * {
       *   ids: [/^~icons\//],
       * }
       * ```
       */
      ids?: RegExp[];
    };
  };
};

/**
 * The parts of `@rolldown/plugin-babel` that this wrapper calls.
 */
interface RolldownBabel {
  config(this: unknown, ...args: unknown[]): unknown;
  configResolved(this: unknown, ...args: unknown[]): void;
  applyToEnvironment(this: unknown, ...args: unknown[]): boolean;
  outputOptions(this: unknown, ...args: unknown[]): void;
  transform: { handler(this: unknown, ...args: unknown[]): unknown };
  closeBundle(this: unknown): unknown;
  closeWatcher(this: unknown): unknown;
}

function canClone(value: unknown) {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Node gives the code of an `eval` worker thread, such as the workers of `@rolldown/plugin-babel`,
 * a global `__dirname` of "." and a global `__filename` of "[worker eval]".
 * An ES module that checks `typeof __dirname`, such as `@warp-drive/build-config`, then reads files
 * relative to the working directory, and the build fails.
 *
 * Babel loads `extends` before anything else in its options, so the worker loads this file first.
 * It removes those globals, and then extends the config file, so that babel resolves
 * the plugins of that file from its own folder.
 */
function workerConfigFile(configFile: string) {
  const file = resolve(configFile);
  const directory = join(dirname(file), "node_modules", ".cache", "nullvoxpopuli-babel");
  const name = createHash("sha256").update(file).digest("hex").slice(0, 16);
  const shim = join(directory, `${name}.mjs`);

  mkdirSync(directory, { recursive: true });
  writeFileSync(
    shim,
    [
      `// Generated by @nullvoxpopuli/ember-build-tooling-utils for the babel worker threads.`,
      `if (globalThis.__filename === "[worker eval]") {`,
      `  delete globalThis.__dirname;`,
      `  delete globalThis.__filename;`,
      `}`,
      ``,
      `export default { extends: ${JSON.stringify(file)} };`,
      ``,
    ].join("\n"),
  );

  return shim;
}

/**
 * Turns the options of `maybeBabel` into the options of `@rolldown/plugin-babel`.
 *
 * - That plugin loads no babel config file,
 *   so the config file becomes babel's `extends`.
 *   Babel then loads it in each worker thread too.
 * - Its default `include` and `exclude` skip `node_modules`,
 *   and files without a js or ts extension.
 *   The filter of `maybeBabel` already picks the files,
 *   so babel takes every file that the filter gives it.
 */
function rolldownBabelOptions(options: Options): RolldownBabelOptions {
  const { filter: _filter, configFile, parallel, ...babelOptions } = options;

  const result: RolldownBabelOptions & { extends?: string } = {
    include: [/^/],
    exclude: [],
    ...babelOptions,
  };

  const workers = parallel && canClone(babelOptions) ? parallel : false;

  if (configFile) {
    result.extends = workers ? workerConfigFile(configFile) : configFile;

    /**
     * Without plugins or presets in its options,
     * `@rolldown/plugin-babel` turns itself off in vite,
     * but the plugins of a config file are not in its options.
     * This preset counts as one, and its filter matches no file,
     * so babel never sees it.
     */
    result.presets = (result.presets ?? []).concat({
      preset: () => ({}),
      rolldown: { filter: { id: /(?!)/ } },
    });
  }

  result.parallel = workers;

  return result;
}

export function maybeBabel(userOptions: Options = {}) {
  const { filter } = userOptions;

  let inner: RolldownBabel | undefined;

  /**
   * `@rolldown/plugin-babel` gives its plugin through a promise,
   * and this plugin must exist right away, so it calls into that one.
   * Vite and rolldown run an async hook before each sync hook that needs it.
   */
  const ready = babel(rolldownBabelOptions(userOptions)).then((plugin) => {
    inner = plugin as unknown as RolldownBabel;

    return inner;
  });

  function loaded(): RolldownBabel {
    if (!inner)
      throw new Error("nullvoxpopuli:babel: a hook ran before @rolldown/plugin-babel loaded");

    return inner;
  }

  const importsRegex = new RegExp(
    babelRequiredImports
      .concat(filter?.include?.imports ?? [])
      .map(RegExp.escape)
      .join("|"),
  );

  const ids = filter?.include?.ids ?? [];

  const maybeBabelFilter = [
    include(
      or(
        ...ids.map((pattern) => id(pattern)),
        and(
          // is one of the babel-supported extensions
          id(extensionRegExp),
          or(
            // always run gts and gjs through babel
            id(/\.gts$/),
            id(/\.gjs$/),
            // imports one of the modules above
            code(importsRegex),
            // local app code using a decorator
            // NOTE: maybeBabel requires that all libraries compile away their decorators
            //
            // TODO: what do we do when native decorators start shipping?
            //     (ignore decorator transforming entirely?)
            and(not(id(nodeModulesPattern)), code(decoratorRegex)),
            // user provided additional opt-ins to the regex here
            ...(filter?.include?.code?.map((x) => code(x)) ?? []),
          ),
        ),
      ),
    ),
  ];

  return {
    name: "nullvoxpopuli:babel",
    enforce: "pre",

    async config(this: unknown, ...args: unknown[]) {
      return (await ready).config.apply(this, args);
    },

    async configResolved(this: unknown, ...args: unknown[]) {
      (await ready).configResolved.apply(this, args);
    },

    applyToEnvironment(this: unknown, ...args: unknown[]) {
      return loaded().applyToEnvironment.apply(this, args);
    },

    async buildStart() {
      await ready;
    },

    outputOptions(this: unknown, ...args: unknown[]) {
      loaded().outputOptions.apply(this, args);
    },

    transform: {
      filter: maybeBabelFilter,
      /**
       * The vite dev server reads only the `id`, `code` and `moduleType` keys of a filter,
       * so it sends every module here, and the handler checks the filter itself.
       */
      async handler(
        this: unknown,
        source: string,
        moduleId: string,
        meta?: { moduleType?: string },
      ) {
        if (!interpreter(maybeBabelFilter, source, moduleId, meta?.moduleType)) return;

        return (await ready).transform.handler.call(this, source, moduleId, meta);
      },
    },

    async closeBundle(this: unknown) {
      return (await ready).closeBundle.call(this);
    },

    async closeWatcher(this: unknown) {
      return (await ready).closeWatcher.call(this);
    },
  } as Plugin;
}

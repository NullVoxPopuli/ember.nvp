import { buildMacros } from "@embroider/macros/babel";
import { ember as embroiderEmber, extensions, resolver, templateTag } from "@embroider/vite";
import type { PluginItem } from "@babel/core";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ConfigEnv, ConfigPluginContext, ResolvedConfig, UserConfig } from "vite";

import { maybeBabel } from "@nullvoxpopuli/ember-build-tooling-utils";

import { testHtml } from "./test-html.ts";

const EMBER_CONFIG = "vite-plugin-ember-config";

type ConfigHook = (
  this: ConfigPluginContext,
  config: UserConfig,
  env: ConfigEnv,
) => Promise<unknown> | unknown;

/**
 * `@embroider/vite` does not export its config hook on its own.
 *
 * The position of the plugin in the list changes between releases,
 * so the name is the only stable way to find it.
 */
function findEmberConfig(): ConfigHook {
  for (const plugin of embroiderEmber()) {
    if (plugin.name !== EMBER_CONFIG) continue;

    const hook = plugin.config;
    const handler = typeof hook === "function" ? hook : hook?.handler;

    if (handler) return handler as ConfigHook;
  }

  throw new Error(
    `@embroider/vite has no "${EMBER_CONFIG}" plugin with a config hook. ` +
      `This version of @embroider/vite is not supported by @nullvoxpopuli/ember-vite.`,
  );
}

const emberConfig = findEmberConfig();

const cwd = process.cwd();
function absolutePath(relativePath: string) {
  return join(cwd, relativePath);
}

/**
 * Everything a project without its own babel config needs:
 *
 * - TypeScript stripping
 * - template compilation, to the wire format
 *   (vite serves and bundles for the project's own ember-source,
 *    so the final compile happens here)
 * - build macros, evaluated at build time
 * - decorator-transforms, with its runtime left as a bare specifier
 *   so it resolves from the project
 *   (the project depends on `decorator-transforms`)
 *
 * The plugins are named, not imported.
 * babel resolves them from the project, which carries them as its own dependencies.
 *
 * The macros take development mode from the vite mode.
 * `buildMacros` reads NODE_ENV, but vite sets NODE_ENV
 * only after the config hooks run.
 */
function defaultBabelPlugins(mode: string): PluginItem[] {
  const macros = buildMacros({
    configure(config) {
      if (isDev(mode)) {
        config.enablePackageDevelopment(process.cwd());
        config.enableRuntimeMode();
      }
    },
  });

  return [
    [
      "@babel/plugin-transform-typescript",
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ],
    ["babel-plugin-ember-template-compilation", { transforms: [...macros.templateMacros] }],
    ["module:decorator-transforms", { runtime: { import: "decorator-transforms/runtime-esm" } }],
    ...macros.babelMacros,
  ];
}

type BabelOptions =
  | { configFile: string }
  | {
      configFile: false;
      plugins: ReturnType<typeof defaultBabelPlugins>;
    };

/**
 * The project's babel config wins when it exists.
 * `babel.configFile` selects which one (e.g. a test-only `config/test/babel.config.js`).
 *
 * Without one (libraries), `defaultBabelPlugins` covers TypeScript, templates, macros, and decorators,
 * so no config file is required.
 * Babel helpers are inlined in that case:
 * projects without a babel config don't carry `@babel/runtime`.
 */
function babelOptions(nvpConfig: Config): BabelOptions {
  const configFile = resolve(
    join(process.cwd(), nvpConfig.babel?.configFile ?? "./babel.config.js"),
  );

  if (existsSync(configFile)) {
    return { configFile };
  }

  /**
   * The config hook fills this list, once it knows the vite mode.
   * The babel plugins keep a reference to it, so they see the filled list.
   */
  return {
    configFile: false,
    plugins: [],
  };
}

/**
 * Libraries that ship code that still needs babel.
 * Each one adds to the filter only when the project depends on it,
 * so other projects do not pay for the check.
 *
 * - ember-concurrency's decorators
 * - ember-intl's formatMessage macro
 * - ember-scoped-css transforms
 * - unplugin-icons, whose icon modules compile with `template()`.
 *   Their ids have no file extension, so only the id matches them.
 */
const LIBRARY_FILTERS: Record<
  string,
  { imports?: string[]; code?: (string | RegExp)[]; ids?: RegExp[] }
> = {
  "ember-concurrency": { imports: ["ember-concurrency"] },
  "ember-intl": {
    imports: ["ember-intl/helpers/format-message"],
    code: [/\bintl\.formatMessage\b/],
  },
  "ember-scoped-css": { imports: ["ember-scoped-css"] },
  "unplugin-icons": { ids: [/^~icons\//] },
};

function projectDependencies(): Set<string> {
  const manifestPath = join(process.cwd(), "package.json");

  if (!existsSync(manifestPath)) return new Set();

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  return new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }));
}

/**
 * Additional opt-ins beyond maybeBabel's built-in list.
 * The `initializeRuntimeMacrosConfig` runtime call must compile away in every project.
 */
function babelFilter(nvpConfig: Config) {
  const imports: string[] = [];
  const code: (string | RegExp)[] = ["initializeRuntimeMacrosConfig"];
  const ids: RegExp[] = [];
  const dependencies = projectDependencies();

  for (const [name, filter] of Object.entries(LIBRARY_FILTERS)) {
    if (!dependencies.has(name)) continue;

    for (const specifier of filter.imports ?? []) imports.push(specifier);
    for (const pattern of filter.code ?? []) code.push(pattern);
    for (const pattern of filter.ids ?? []) ids.push(pattern);
  }

  for (const specifier of nvpConfig.babel?.include?.whenImporting ?? []) {
    imports.push(specifier);
  }

  for (const pattern of nvpConfig.babel?.include?.whenMatching ?? []) {
    code.push(pattern);
  }

  return { include: { imports, code, ids } };
}

interface Config {
  babel?: {
    /**
     * when babel runs, do so in parallel across many cores.
     *
     * defaults to true when the project has a babel config file.
     * Without one, babel stays in the main thread:
     * the default plugins carry functions,
     * and a worker thread cannot receive functions.
     */
    parallel?: false;

    /**
     * which babel config file to use for this build, relative to the
     * project root. defaults to "./babel.config.js".
     *
     * useful when the root babel config belongs to another pipeline
     * (e.g. a library's publish build) and the vite build needs its own,
     * such as "./config/test/babel.config.js".
     */
    configFile?: string;

    /**
     * optional way to configure when babel is activated.
     *
     * by default, all transforming is oxc,
     * except when babel is needed (for things not currently implemented in oxc)
     */
    include?: {
      /**
       * if a file imports from anything in this array, use babel instead of
       * oxc for that file.
       *
       * For example: ['my-babel-only-library'],
       */
      whenImporting?: (string | "ember-concurrency" | "ember-scoped-css")[];

      /**
       * if a file's source contains any of these strings,
       * or matches any of these regular expressions,
       * use babel instead of oxc for that file.
       *
       * Use this for babel plugins that look for a code pattern rather than
       * an import.
       *
       * For example: [/\.register\(/],
       */
      whenMatching?: (string | RegExp)[];
    };
  };
  /**
   * optional production configs
   */
  production?: {
    /**
     * optional configuration of codeSplitting.groups
     * in the vite config.
     *
     * Docs here:
     * https://rolldown.rs/reference/OutputOptions.codeSplitting#groups
     */
    codeSplittingGroups: any[];
  };
}

export function ember(nvpConfig: Config = {}) {
  const babel = babelOptions(nvpConfig);
  const filter = babelFilter(nvpConfig);
  const parallel = nvpConfig.babel?.parallel ?? babel.configFile !== false;

  /*
   * Plugins must be returned as top-level array entries,
   * NOT pushed into config.plugins inside a config() hook.
   *
   * Vite 8 extracts user plugins *before* config hooks run,
   * so anything added later is invisible to the plugin container
   * (resolveId, load, etc. hooks never fire).
   */
  return [
    {
      // no compat
      name: "ember:nullvoxpopuli",
      async config(this: ConfigPluginContext, viteConfig: any, env: ConfigEnv) {
        /**
         * Read before the config hooks below write their defaults into `viteConfig`,
         * and put back over them after `applyConfig`.
         */
        const project = projectConfig(viteConfig);

        /**
         * The hook reads the rolldown version from the plugin context,
         * and takes its esbuild path without it.
         */
        await emberConfig.call(this, viteConfig, env);

        applyPreviewPort(viteConfig);

        if ("plugins" in babel) {
          babel.plugins.length = 0;

          for (const plugin of defaultBabelPlugins(env.mode)) {
            babel.plugins.push(plugin);
          }
        }

        viteConfig.experimental ||= {};
        viteConfig.build ||= {};
        viteConfig.optimizeDeps ||= {};

        viteConfig.oxc = {
          // babel handles legacy decorators
          // decorator: {
          //   legacy: true,
          // },
        };
        // config.experimental.bundledDev = true;
        viteConfig.experimental.nativeMagicString = true;
        delete viteConfig.esbuild;
        delete viteConfig.optimizeDeps.esbuildOptions;

        viteConfig.build.reportCompressedSize = false;
        viteConfig.build.extensions = extensions;
        viteConfig.optimizeDeps.extensions = [".gjs", ".gts"];
        viteConfig.optimizeDeps.rolldownOptions ||= {};
        viteConfig.optimizeDeps.rolldownOptions.tsconfig = true;

        applyConfig(viteConfig, env, nvpConfig);
        keepProjectConfig(viteConfig, project);

        viteConfig.optimizeDeps.rolldownOptions.plugins = [
          ...project.optimizeDepsPlugins,
          resolver({ rolldown: true }),
          templateTag(),

          // Libraries ship precompileTemplate calls and macros.
          // Both must compile away here, with this app's template compiler.
          maybeBabel({
            ...babel,
            parallel,
            filter,
          }),
        ];
      },
    },
    resolver({ rolldown: true }),
    templateTag(),
    testHtml(),
    maybeBabel({
      ...babel,
      parallel,
      filter,
    }),
  ];
}

/**
 * What the project's own vite config sets, before any config hook changes it.
 *
 * What the config hooks here and in `@embroider/vite` set in `build`,
 * `build.rolldownOptions.output` and `build.rolldownOptions.optimization` are defaults:
 * a project that sets one, such as `build.sourcemap: "hidden"`
 * or `build.rolldownOptions.output.strictExecutionOrder: false`, keeps its value.
 * The project's own optimizeDeps plugins run before the ones this plugin adds.
 */
function projectConfig(viteConfig: UserConfig) {
  const build = viteConfig.build ?? {};
  const output = build.rolldownOptions?.output;
  const optimizeDepsPlugins = viteConfig.optimizeDeps?.rolldownOptions?.plugins;

  return {
    /**
     * Vite 8 makes `build.rollupOptions` an accessor for `build.rolldownOptions`.
     * Neither is put back: that would replace the object the config hooks fill in.
     */
    build: setValues(build, ["rolldownOptions", "rollupOptions"]),
    output: Array.isArray(output) ? {} : setValues(output),
    optimization: setValues(build.rolldownOptions?.optimization),
    optimizeDepsPlugins: Array.isArray(optimizeDepsPlugins) ? [...optimizeDepsPlugins] : [],
  };
}

/**
 * The entries that have a value.
 * A project that sets `sourcemap: undefined` gets the default, as if it had not set it.
 */
function setValues(object: object | undefined, skip: string[] = []) {
  return Object.fromEntries(
    Object.entries(object ?? {}).filter(
      ([key, value]) => value !== undefined && !skip.includes(key),
    ),
  );
}

function keepProjectConfig(viteConfig: UserConfig, project: ReturnType<typeof projectConfig>) {
  Object.assign(viteConfig.build!, project.build);

  const { output, optimization } = viteConfig.build!.rolldownOptions ?? {};

  if (output && !Array.isArray(output)) Object.assign(output, project.output);
  if (optimization) Object.assign(optimization, project.optimization);
}

/**
 * `vite preview` serves the build on `$PORT`, the port that hosts and CI give,
 * or on 4200, the port of the dev server.
 * Vite itself reads no `$PORT`, and `@embroider/vite` only sets the dev server's port.
 * A port in the project's own vite config wins.
 */
function applyPreviewPort(viteConfig: UserConfig) {
  viteConfig.preview ||= {};
  viteConfig.preview.port ??= Number(process.env.PORT) || 4200;
}

const MODE_DEV = "development";

function isDev(mode: string) {
  return mode === MODE_DEV;
}

function applyConfig(viteConfig: ResolvedConfig, env: ConfigEnv, nvpConfig: Config) {
  if (isDev(env.mode)) {
    return dev(viteConfig, nvpConfig);
  }

  return prod(viteConfig, nvpConfig);
}

function dev(viteConfig: ResolvedConfig, nvpConfig: Config) {
  /**
   * build config for tests
   *
   * NOTE: we can't minify.
   *       some tests check x.constructor.name, which changes when minified
   */
  Object.assign(viteConfig.build, {
    sourcemap: true,
    cleanCssOptions: { sourceMap: true },
    minify: false,
    cssMinify: false,
  });

  viteConfig.build.rolldownOptions ||= {};
  viteConfig.build.rolldownOptions.input ||= {};
  viteConfig.build.rolldownOptions.output ||= {};

  // libraries don't, by default, have a "demo app" entrypoint
  if (existsSync("./index.html")) {
    Object.assign(viteConfig.build.rolldownOptions.input, {
      main: absolutePath("./index.html"),
    });
  }

  if (existsSync("./tests/index.html")) {
    Object.assign(viteConfig.build.rolldownOptions.input, {
      tests: absolutePath("./tests/index.html"),
    });
  } else if (existsSync("./tests.html")) {
    Object.assign(viteConfig.build.rolldownOptions.input, {
      tests: absolutePath("./tests.html"),
    });
  } else if (existsSync("./tests")) {
    // no html of its own: the default-test-html plugin answers for
    // tests/index.html
    Object.assign(viteConfig.build.rolldownOptions.input, {
      tests: absolutePath("./tests/index.html"),
    });
  }

  Object.assign(viteConfig.build.rolldownOptions.output, {
    cleanDir: true,
    strictExecutionOrder: true,
    codeSplitting: {
      groups: [
        // our "test" product-land code happens to not match this pattern
        { name: "tests", test: /[.-]test\.g?(j|t)s/, priority: 10 },
        {
          name: "common",
          minShareCount: 10,
          minSize: 10000,
          maxSize: 1 * 1024 * 1024, // 1~ish MB
          priority: 9,
        },
        {
          name: "uncommon",
          minShareCount: 2,
          minSize: 10000,
          maxSize: 1 * 1024 * 1024, // 1~ish MB
          priority: 5,
        },
      ],
    },
  });

  return;
}
function prod(viteConfig: ResolvedConfig, nvpConfig: Config) {
  Object.assign(viteConfig.build, {
    minify: "oxc",
    sourcemap: true,
    reportCompressedSize: false,
    modulePreload: true,
    cleanCssOptions: { sourceMap: true },
  });

  viteConfig.build.rolldownOptions ||= {};
  viteConfig.build.rolldownOptions.input ||= {};
  viteConfig.build.rolldownOptions.optimization ||= {};
  viteConfig.build.rolldownOptions.output ||= {};

  // libraries don't, by default, have a "demo app" entrypoint
  if (existsSync("./index.html")) {
    Object.assign(viteConfig.build.rolldownOptions.input, {
      main: absolutePath("./index.html"),
    });
  }

  Object.assign(viteConfig.build.rolldownOptions.optimization, {
    inlineConst: {
      mode: "smart",
      pass: 3,
    },
    pifeForModuleWrappers: true,
  });

  Object.assign(viteConfig.build.rolldownOptions.output, {
    minify: true,
    cleanDir: true,
    /**
     * Needed due to how we manage module state.
     *
     * This can create waterfalls when too much top-level await is used.
     */
    strictExecutionOrder: true,
    /**
     * Code splitting currently makes things worse
     */
    codeSplitting: {
      /**
       * Kind of a shame this isn't automatic based on dynamic import usage in vite8.
       *
       * This forces us to know every potential problem area of the app,
       * rather than rely on automatic optimizations based on import/module usage.
       */
      groups: [...(nvpConfig?.production?.codeSplittingGroups ?? [])],
    },
  });
}

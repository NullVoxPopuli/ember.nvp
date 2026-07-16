import { buildMacros } from "@embroider/macros/babel";
import { ember as embroiderEmber, extensions, resolver, templateTag } from "@embroider/vite";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ConfigEnv, ResolvedConfig } from "vite";

import { maybeBabel } from "@nullvoxpopuli/ember-build-tooling-utils";

const emberConfig = embroiderEmber()[3]!;

const cwd = process.cwd();
function absolutePath(relativePath: string) {
  return join(cwd, relativePath);
}

/**
 * Everything a project without its own babel config needs:
 *
 * - TypeScript stripping
 * - template compilation (wire format: vite serves/bundles for the
 *   project's own ember-source, so the final compile happens here)
 * - build macros, evaluated at build time
 * - decorator-transforms, with its runtime left as a bare specifier so it
 *   resolves from the project (which depends on `decorator-transforms`)
 *
 * The plugins are named, not imported: babel resolves them from the
 * project, which carries them as its own dependencies.
 */
function defaultBabelPlugins() {
  const macros = buildMacros();

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
      babelrc: false;
      babelHelpers: "inline";
      plugins: ReturnType<typeof defaultBabelPlugins>;
    };

/**
 * The project's own babel config wins when it exists. Without one
 * (libraries), `defaultBabelPlugins` covers TypeScript, templates, macros,
 * and decorators, so no config file is required -- helpers are inlined
 * because projects without a babel config don't carry `@babel/runtime`.
 */
function babelOptions(): BabelOptions {
  const configFile = resolve(join(process.cwd(), "./babel.config.js"));

  if (existsSync(configFile)) {
    return { configFile };
  }

  return {
    configFile: false,
    babelrc: false,
    babelHelpers: "inline",
    plugins: defaultBabelPlugins(),
  };
}

/**
 * Additional opt-ins beyond maybeBabel's built-in list.
 *
 * These libraries ship code that still needs babel (ember-concurrency's
 * decorators, ember-scoped-css transforms, ember-intl's formatMessage macro),
 * and the `initializeRuntimeMacrosConfig` runtime call must be compiled away.
 */
function babelFilter(nvpConfig: Config) {
  return {
    include: {
      imports: [
        "ember-concurrency",
        "ember-scoped-css",
        "ember-intl/helpers/format-message",
        ...(nvpConfig.babel?.include?.whenImporting ?? []),
      ],
      code: [/\bintl\.formatMessage\b/, "initializeRuntimeMacrosConfig"] as (string | RegExp)[],
    },
  };
}

interface Config {
  babel?: {
    /**
     * defaults to true.
     * when babel runs, do so in parallel across many cores.
     */
    parallel?: false;

    /**
     * optional way to configure when babel is activateed.
     * by default, all transforming is oxc, except when babel is needed
     * (for things not currently implemented in oxc)
     */
    include?: {
      /**
       * if a file imports from anything in this array, use babel instead of
       * oxc for that file.
       *
       * For example: ['ember-concurrency'],
       */
      whenImporting?: (string | "ember-concurrency" | "ember-scoped-css")[];
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
  const babel = babelOptions();
  const filter = babelFilter(nvpConfig);

  /*
   * Plugins must be returned as top-level array entries — NOT pushed into
   * config.plugins inside a config() hook.  Vite 8 extracts user plugins
   * *before* config hooks run, so anything added later is invisible to the
   * plugin container (resolveId, load, etc. hooks never fire).
   */
  return [
    {
      // no compat
      name: "ember:nullvoxpopuli",
      async config(viteConfig: any, env: ConfigEnv) {
        // @ts-expect-error it exists
        await emberConfig.config(viteConfig, env);

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

        viteConfig.optimizeDeps.rolldownOptions.plugins = [
          resolver({ rolldown: true }),
          templateTag(),

          // Libraries will have precompileTemplate and macros, etc,
          // and we need to compile that away using this app's
          // template compiler
          maybeBabel({
            ...babel,
            parallel: nvpConfig.babel?.parallel,
            filter,
          }),
        ];
      },
    },
    resolver({ rolldown: true }),
    templateTag(),
    maybeBabel({
      ...babel,
      parallel: nvpConfig.babel?.parallel,
      filter,
    }),
  ];
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
  /**************************************
   *
   * build config for tests
   *
   * NOTE: we can't minify because some tests
   *       are checking x.constructor.name, which changes when minified
   *
   *************************************/
  Object.assign(viteConfig.build, {
    sourcemap: true,
    cleanCssOptions: { sourceMap: true },
    minify: false,
    cssMinify: false,
  });

  viteConfig.build.rolldownOptions ||= {};
  viteConfig.build.rolldownOptions.input ||= {};
  viteConfig.build.rolldownOptions.output ||= {};

  Object.assign(viteConfig.build.rolldownOptions.input, {
    main: absolutePath("./index.html"),
  });

  if (existsSync("./tests.html")) {
    Object.assign(viteConfig.build.rolldownOptions.input, {
      tests: absolutePath("./tests.html"),
    });
  }

  if (existsSync("./tests/index.html")) {
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

  Object.assign(viteConfig.build.rolldownOptions.input, {
    main: absolutePath("./index.html"),
  });

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
     * This is needed due to how we manage module state.
     * This can create waterfalls when too much top-level await is used.
     */
    strictExecutionOrder: true,
    /**
     * Code splitting currently makes things worse
     */
    codeSplitting: {
      /**
       * Kind of a shame this isn't automatic based on dynamic import usage
       * in vite8.
       * Kinda forces us to know every potential problem area of the app,
       * rather than rely on automatic optimizations based on import/module usage
       */
      groups: [...(nvpConfig?.production?.codeSplittingGroups ?? [])],
    },
  });
}

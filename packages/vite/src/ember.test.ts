import { extensions } from "@embroider/vite";
import { interpreter, type TopLevelFilterExpression } from "@rolldown/pluginutils";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig, type ConfigEnv, type ConfigPluginContext, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "./ember.ts";

const ROLLDOWN = { meta: { rolldownVersion: "1.0.0" } } as ConfigPluginContext;

async function configure(env: ConfigEnv, config: any = {}) {
  const [plugin] = ember();

  // @ts-expect-error the first entry is the config plugin
  await plugin.config.call(ROLLDOWN, config, env);

  return config;
}

describe("ember", () => {
  /**
   * These values come from the config hook of `@embroider/vite`.
   * They are missing when that hook does not run.
   */
  it("applies the config from @embroider/vite", async () => {
    const config = await configure({ command: "build", mode: "production" });

    expect(config.resolve.extensions).toEqual(extensions);
    expect(config.server.port).toBe(4200);
    expect(config.optimizeDeps.exclude).toContain("@embroider/macros");
  });

  describe("preview port", () => {
    const original = process.env.PORT;

    afterEach(() => {
      if (original === undefined) delete process.env.PORT;
      else process.env.PORT = original;
    });

    it("is 4200 without $PORT, like the dev server", async () => {
      delete process.env.PORT;

      const config = await configure({ command: "serve", mode: "production" });

      expect(config.preview.port).toBe(4200);
    });

    it("comes from $PORT", async () => {
      process.env.PORT = "3123";

      const config = await configure({ command: "serve", mode: "production" });

      expect(config.preview.port).toBe(3123);
    });

    it("keeps the port in the project's vite config", async () => {
      process.env.PORT = "3123";

      const config = await configure(
        { command: "serve", mode: "production" },
        { preview: { port: 8080 } },
      );

      expect(config.preview.port).toBe(8080);
    });
  });

  it("gives @embroider/vite the plugin context, so that it configures rolldown", async () => {
    const config = await configure({ command: "build", mode: "production" });

    expect(config.build.rolldownOptions.moduleTypes).toEqual({ ".ts": "js" });
    expect(config.optimizeDeps.rolldownOptions.resolve.extensions).toEqual(extensions);
  });
});

describe("the project's own vite config", () => {
  it("keeps the project's build settings, and the defaults fill in the rest", async () => {
    const config = await configure(
      { command: "build", mode: "production" },
      {
        build: {
          sourcemap: "hidden",
          rolldownOptions: { output: { strictExecutionOrder: false } },
        },
      },
    );

    expect(config.build.sourcemap).toBe("hidden");
    expect(config.build.rolldownOptions.output.strictExecutionOrder).toBe(false);
    // Not the terser that @embroider/vite picks when the project sets no minifier.
    expect(config.build.minify).toBe("oxc");
    expect(config.build.rolldownOptions.output.minify).toBe(true);
  });

  it("keeps the project's build settings in development mode", async () => {
    const config = await configure(
      { command: "build", mode: "development" },
      { build: { sourcemap: false, rolldownOptions: { output: { codeSplitting: false } } } },
    );

    expect(config.build.sourcemap).toBe(false);
    expect(config.build.rolldownOptions.output.codeSplitting).toBe(false);
    expect(config.build.minify).toBe(false);
  });

  it("keeps the project's optimization settings", async () => {
    const config = await configure(
      { command: "build", mode: "production" },
      { build: { rolldownOptions: { optimization: { pifeForModuleWrappers: false } } } },
    );

    expect(config.build.rolldownOptions.optimization.pifeForModuleWrappers).toBe(false);
    expect(config.build.rolldownOptions.optimization.inlineConst).toEqual({
      mode: "smart",
      pass: 3,
    });
  });

  it("uses the default for a setting the project leaves undefined", async () => {
    const config = await configure(
      { command: "build", mode: "production" },
      { build: { sourcemap: undefined } },
    );

    expect(config.build.sourcemap).toBe(true);
  });

  /**
   * Vite gives the config hooks a `build.rollupOptions` accessor for `build.rolldownOptions`,
   * which the plain objects of `configure()` don't have.
   */
  it("keeps what the config hooks put in build.rolldownOptions, through vite", async () => {
    const config = await resolveConfig(
      {
        configFile: false,
        logLevel: "silent",
        plugins: [ember()],
        build: { sourcemap: "hidden" },
      },
      "build",
      "production",
    );

    expect(config.build.sourcemap).toBe("hidden");
    expect(config.build.rolldownOptions.moduleTypes).toEqual({ ".ts": "js" });
    expect(config.build.rolldownOptions.output).toMatchObject({ strictExecutionOrder: true });
  });

  it("runs the project's optimizeDeps plugins before its own", async () => {
    const config = await configure(
      { command: "serve", mode: "development" },
      { optimizeDeps: { rolldownOptions: { plugins: [{ name: "project-plugin" }] } } },
    );

    expect(
      config.optimizeDeps.rolldownOptions.plugins.map((plugin: Plugin) => plugin.name),
    ).toEqual([
      "project-plugin",
      "embroider-resolver",
      "embroider-template-tag",
      "nullvoxpopuli:babel",
    ]);
  });
});

/**
 * This package has no babel config,
 * so `ember()` uses its default babel plugins,
 * and babel resolves them from here.
 */
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

const DEV_CHECK = [
  `import { isDevelopingApp, macroCondition } from "@embroider/macros";`,
  `export const build = macroCondition(isDevelopingApp()) ? "development build" : "other build";`,
].join("\n");

const CONTEXT = {
  error(error: unknown) {
    throw error;
  },
};

/**
 * The babel plugin, after the hooks that rolldown runs before a transform.
 */
async function startedBabel(plugins: Plugin[]) {
  const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel")!;

  // @ts-expect-error the babel plugin has function hooks
  await babel.buildStart.call(CONTEXT);
  // @ts-expect-error the babel plugin has function hooks
  babel.outputOptions.call({ meta: {} }, {});

  return babel;
}

/**
 * Runs the config hook, then the babel plugin, the way vite does.
 */
async function compile(mode: string) {
  const plugins = ember() as Plugin[];
  const config: any = {};

  // @ts-expect-error the first entry is the config plugin
  await plugins[0].config.call(ROLLDOWN, config, { command: "build", mode });

  const babel = await startedBabel(plugins);
  // @ts-expect-error the babel plugin has an object transform hook
  const result = await babel.transform.handler.call(CONTEXT, DEV_CHECK, `${PACKAGE_ROOT}app.js`);

  return result.code as string;
}

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

function inDirectory(directory: string) {
  const previous = process.cwd();
  process.chdir(directory);
  restoreCwd = () => process.chdir(previous);
}

function inPackageRoot() {
  inDirectory(PACKAGE_ROOT);
}

/**
 * A project with these files.
 * It is inside this package, so babel resolves its plugins from here.
 */
function inProject(files: Record<string, string>) {
  const cache = join(PACKAGE_ROOT, "node_modules/.cache");
  mkdirSync(cache, { recursive: true });

  const directory = mkdtempSync(join(cache, "project-"));

  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  }

  inDirectory(directory);

  const restore = restoreCwd!;
  restoreCwd = () => {
    restore();
    rmSync(directory, { recursive: true, force: true });
  };

  return directory;
}

/**
 * A project that depends on the libraries that need babel.
 */
function inProjectWithLibraries() {
  const devDependencies = {
    "ember-concurrency": "*",
    "ember-intl": "*",
    "ember-qunit-nice-errors": "*",
    "ember-scoped-css": "*",
    "unplugin-icons": "*",
  };

  inProject({ "package.json": JSON.stringify({ devDependencies }) });
}

describe("default babel plugins", () => {
  /**
   * vite sets NODE_ENV from the mode only after the config hooks run.
   * Under vitest, NODE_ENV is "test".
   */
  it("keeps development-only code in development mode", async () => {
    inPackageRoot();

    const code = await compile("development");

    expect(code).toContain("development build");
  });

  it("removes development-only code in production mode", async () => {
    inPackageRoot();

    const code = await compile("production");

    expect(code).not.toContain("development build");
    expect(code).toContain("other build");
  });
});

describe("babel config file", () => {
  /**
   * The plugins of a config file are not in the options of `@rolldown/plugin-babel`,
   * and without plugins in its options, that plugin turns itself off in vite.
   */
  it("keeps babel on in each vite environment", async () => {
    inProject({
      "package.json": `{ "type": "module" }`,
      "babel.config.js": `export default { plugins: [] };`,
    });

    const plugins = ember() as Plugin[];
    const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel")!;

    // @ts-expect-error the babel plugin has function hooks
    await babel.configResolved.call(CONTEXT, {});

    // @ts-expect-error the babel plugin has function hooks
    expect(babel.applyToEnvironment.call(CONTEXT, { name: "client" })).toBe(true);
  });

  it.each(["babel.config.mjs", "babel.config.cjs", "babel.config.cts", "babel.config.json"])(
    "says how to use %s instead of ignoring it",
    (name) => {
      inProject({ "package.json": `{ "type": "module" }`, [name]: "{}" });

      expect(() => ember()).toThrow(
        `@nullvoxpopuli/ember-vite reads babel.config.js, but this project has ${name}. ` +
          `Pass \`ember({ babel: { configFile: "./${name}" } })\` to use it.`,
      );
    },
  );

  it("keeps the default plugins for a library, whose babel config is for publishing", () => {
    inProject({
      "package.json": `{ "type": "module", "ember-addon": { "version": 2, "type": "addon" } }`,
      "babel.config.cjs": "module.exports = {};",
    });

    expect(() => ember()).not.toThrow();
  });

  it("uses babel.config.js when another config sits next to it", () => {
    inProject({
      "package.json": `{ "type": "module" }`,
      "babel.config.js": "export default { plugins: [] };",
      "babel.config.cjs": "module.exports = {};",
    });

    expect(() => ember()).not.toThrow();
  });

  const MARKER_PLUGIN = [
    `export default ({ types: t }) => ({`,
    `  visitor: {`,
    `    Program(path) {`,
    `      path.unshiftContainer("body", t.expressionStatement(t.stringLiteral("from the config file")));`,
    `    },`,
    `  },`,
    `});`,
  ].join("\n");

  it("uses the config that babel.configFile names", async () => {
    const directory = inProject({
      "package.json": `{ "type": "module" }`,
      "marker-plugin.js": MARKER_PLUGIN,
      "babel.config.mjs": `export default { plugins: ["./marker-plugin.js"] };`,
    });

    const babel = await startedBabel(
      ember({ babel: { configFile: "./babel.config.mjs" } }) as Plugin[],
    );

    try {
      // @ts-expect-error the babel plugin has an object transform hook
      const result = await babel.transform.handler.call(
        CONTEXT,
        `import { macroCondition } from "@embroider/macros";`,
        join(directory, "app/a.js"),
      );

      expect(result.code).toContain("from the config file");
    } finally {
      // @ts-expect-error the babel plugin ends its workers in closeBundle
      await babel.closeBundle.call({ meta: { watchMode: false } });
    }
  });
});

describe("babel filter in the dev server", () => {
  /**
   * The vite dev server ignores a filter made of filter expressions,
   * so it gives the babel plugin every module, also the styles of index.html.
   */
  it("leaves a module outside the filter to oxc", async () => {
    inPackageRoot();

    const plugins = ember() as Plugin[];

    // @ts-expect-error the first entry is the config plugin
    await plugins[0].config.call(ROLLDOWN, {}, { command: "serve", mode: "development" });

    const babel = await startedBabel(plugins);
    const styles = `${PACKAGE_ROOT}index.html?html-proxy&direct&index=0.css`;

    // @ts-expect-error the babel plugin has an object transform hook
    const result = await babel.transform.handler.call(CONTEXT, `:root { color: red; }`, styles);

    expect(result).toBeUndefined();
  });
});

describe("babel.parallel", () => {
  /**
   * A babel plugin that writes which thread compiled the file.
   */
  const THREAD_PLUGIN = [
    `import { isMainThread } from "node:worker_threads";`,
    `export default ({ types: t }) => ({`,
    `  visitor: {`,
    `    Program(path) {`,
    `      const thread = isMainThread ? "main thread" : "worker thread";`,
    `      path.unshiftContainer("body", t.expressionStatement(t.stringLiteral(thread)));`,
    `    },`,
    `  },`,
    `});`,
  ].join("\n");

  async function compileWithConfigFile(
    options: Parameters<typeof ember>[0] = {},
    config = `export default { plugins: ["./thread-plugin.js"] };`,
    files: Record<string, string> = {},
  ) {
    const directory = inProject(
      Object.assign(
        {
          "package.json": `{ "type": "module" }`,
          "thread-plugin.js": THREAD_PLUGIN,
          "babel.config.js": config,
        },
        files,
      ),
    );

    const plugins = ember(options) as Plugin[];
    const babel = await startedBabel(plugins);

    try {
      // @ts-expect-error the babel plugin has an object transform hook
      const result = await babel.transform.handler.call(
        CONTEXT,
        `import { macroCondition } from "@embroider/macros";`,
        join(directory, "app/a.js"),
      );

      return result.code as string;
    } finally {
      // @ts-expect-error the babel plugin ends its workers in closeBundle
      await babel.closeBundle.call({ meta: { watchMode: false } });
    }
  }

  it("runs babel in worker threads when the project has a babel config file", async () => {
    expect(await compileWithConfigFile()).toContain("worker thread");
  });

  /**
   * `@warp-drive/build-config` before 5.9 finds its own folder with `typeof __dirname`,
   * which Node sets to "." in an eval worker thread.
   * See https://github.com/warp-drive-data/warp-drive/pull/10926.
   */
  function buildConfig(version: string) {
    return {
      "node_modules/@warp-drive/build-config/package.json": JSON.stringify({
        name: "@warp-drive/build-config",
        version,
        type: "module",
        exports: { ".": "./index.js" },
      }),
      "node_modules/@warp-drive/build-config/index.js": [
        `if (typeof __dirname !== "undefined") throw new Error("__dirname is " + __dirname);`,
        `export const setConfig = () => {};`,
      ].join("\n"),
    };
  }

  const CONFIG_WITH_WARP_DRIVE = [
    `import "@warp-drive/build-config";`,
    `export default { plugins: ["./thread-plugin.js"] };`,
  ].join("\n");

  it("gives @warp-drive/build-config before 5.9 no __dirname in a worker thread", async () => {
    expect(await compileWithConfigFile({}, CONFIG_WITH_WARP_DRIVE, buildConfig("5.8.2"))).toContain(
      "worker thread",
    );
  });

  it("runs babel in the main thread when parallel is false", async () => {
    expect(await compileWithConfigFile({ babel: { parallel: false } })).toContain("main thread");
  });
});

/**
 * The module that unplugin-icons gives for an icon, with `compiler: "ember"`.
 */
const ICON = [
  `import { template } from "@ember/template-compiler";`,
  `export default template("<svg ...attributes><path d='M20 6L9 17l-5-5'/></svg>");`,
].join("\n");

describe("babel.include", () => {
  function usesBabel(
    options: Parameters<typeof ember>[0],
    source: string,
    moduleId = "/app/services/a.ts",
  ) {
    const plugins = ember(options) as Plugin[];
    const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel");
    // @ts-expect-error maybeBabel sets the filter on the transform hook
    const filter = babel.transform.filter as TopLevelFilterExpression[];

    return interpreter(filter, source, moduleId);
  }

  const source = `owner.register(Key, Impl);`;

  it("leaves files without a babel-only pattern to oxc", () => {
    expect(usesBabel({}, source)).toBe(false);
  });

  it("sends files that contain a whenMatching string to babel", () => {
    expect(usesBabel({ babel: { include: { whenMatching: [".register("] } } }, source)).toBe(true);
  });

  it("sends files that match a whenMatching regular expression to babel", () => {
    expect(usesBabel({ babel: { include: { whenMatching: [/\.register\(/] } } }, source)).toBe(
      true,
    );
  });

  it("sends files that import a whenImporting module to babel", () => {
    expect(
      usesBabel(
        { babel: { include: { whenImporting: ["my-lib"] } } },
        `import { a } from "my-lib";`,
      ),
    ).toBe(true);
  });
});

describe("libraries that need babel", () => {
  function babelPerModule() {
    const plugins = ember() as Plugin[];
    const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel");
    // @ts-expect-error maybeBabel sets the filter on the transform hook
    const filter = babel.transform.filter as TopLevelFilterExpression[];

    return {
      "ember-concurrency": interpreter(
        filter,
        `import { task } from "ember-concurrency";`,
        "/app/components/a.js",
      ),
      "ember-intl import": interpreter(
        filter,
        `import formatMessage from "ember-intl/helpers/format-message";`,
        "/app/components/a.js",
      ),
      "ember-intl formatMessage": interpreter(
        filter,
        `export const title = this.intl.formatMessage("Hello");`,
        "/app/components/a.js",
      ),
      "ember-qunit-nice-errors": interpreter(
        filter,
        `test("it works", (assert) => assert.ok(true));`,
        "/tests/unit/a-test.js",
      ),
      "ember-scoped-css": interpreter(
        filter,
        `import { scopedClass } from "ember-scoped-css";`,
        "/app/components/a.js",
      ),
      "unplugin-icons": interpreter(filter, ICON, "~icons/lucide/check"),
    };
  }

  it("leaves their modules to oxc when the project does not depend on them", () => {
    inPackageRoot();

    expect(babelPerModule()).toMatchInlineSnapshot(`
      {
        "ember-concurrency": false,
        "ember-intl formatMessage": false,
        "ember-intl import": false,
        "ember-qunit-nice-errors": false,
        "ember-scoped-css": false,
        "unplugin-icons": false,
      }
    `);
  });

  it("sends their modules to babel when the project depends on them", () => {
    inProjectWithLibraries();

    expect(babelPerModule()).toMatchInlineSnapshot(`
      {
        "ember-concurrency": true,
        "ember-intl formatMessage": true,
        "ember-intl import": true,
        "ember-qunit-nice-errors": true,
        "ember-scoped-css": true,
        "unplugin-icons": true,
      }
    `);
  });

  it("compiles the template of an icon module, which has no extension", async () => {
    inProjectWithLibraries();

    const plugins = ember() as Plugin[];
    const config: any = {};

    // @ts-expect-error the first entry is the config plugin
    await plugins[0].config.call(ROLLDOWN, config, { command: "build", mode: "production" });

    const babel = await startedBabel(plugins);
    // @ts-expect-error the babel plugin has an object transform hook
    const result = await babel.transform.handler.call(CONTEXT, ICON, "~icons/lucide/check");

    expect(result.code).toMatchInlineSnapshot(`
      "import { setComponentTemplate } from "@ember/component";
      import { createTemplateFactory } from "@ember/template-factory";
      import templateOnly from "@ember/component/template-only";
      export default setComponentTemplate(createTemplateFactory(
      /*
        <svg ...attributes><path d='M20 6L9 17l-5-5'/></svg>
      */
      {
        "id": null,
        "block": "[[[11,\\"svg\\"],[17,1],[12],[10,\\"path\\"],[14,\\"d\\",\\"M20 6L9 17l-5-5\\"],[12],[13],[13]],[\\"&attrs\\"],[]]",
        "moduleName": "(unknown template module)",
        "isStrictMode": true
      }), templateOnly());"
    `);
  });
});

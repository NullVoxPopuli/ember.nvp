import { extensions } from "@embroider/vite";
import { interpreter, type TopLevelFilterExpression } from "@rolldown/pluginutils";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConfigEnv, ConfigPluginContext, Plugin } from "vite";
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
 * Runs the config hook, then the babel plugin, the way vite does.
 */
async function compile(mode: string) {
  const plugins = ember() as Plugin[];
  const config: any = {};

  // @ts-expect-error the first entry is the config plugin
  await plugins[0].config.call(ROLLDOWN, config, { command: "build", mode });

  const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel");
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
 * A project that depends on the libraries that need babel.
 * It is inside this package, so babel resolves its plugins from here.
 */
function inProjectWithLibraries() {
  const cache = join(PACKAGE_ROOT, "node_modules/.cache");
  mkdirSync(cache, { recursive: true });

  const directory = mkdtempSync(join(cache, "project-"));
  const devDependencies = {
    "ember-concurrency": "*",
    "ember-scoped-css": "*",
    "unplugin-icons": "*",
  };

  writeFileSync(join(directory, "package.json"), JSON.stringify({ devDependencies }));
  inDirectory(directory);

  const restore = restoreCwd!;
  restoreCwd = () => {
    restore();
    rmSync(directory, { recursive: true, force: true });
  };
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

    const babel = plugins.find((plugin) => plugin.name === "nullvoxpopuli:babel");
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

import { extensions } from "@embroider/vite";
import { fileURLToPath } from "node:url";
import type { ConfigEnv, ConfigPluginContext, Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "./ember.ts";

const ROLLDOWN = { meta: { rolldownVersion: "1.0.0" } } as ConfigPluginContext;

async function configure(env: ConfigEnv) {
  const config: any = {};
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

describe("default babel plugins", () => {
  let restoreCwd: (() => void) | undefined;

  afterEach(() => {
    restoreCwd?.();
    restoreCwd = undefined;
  });

  function inPackageRoot() {
    const previous = process.cwd();
    process.chdir(PACKAGE_ROOT);
    restoreCwd = () => process.chdir(previous);
  }

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

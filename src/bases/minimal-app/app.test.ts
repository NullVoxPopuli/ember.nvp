import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, build, reapply } from "#test-helpers";
import { packageJson } from "ember-apply";

import type { Project } from "ember.nvp";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { join } from "node:path";

const expect = hardExpect.soft;

describe("typescript", () => {
  let project: Project;
  beforeAll(async () => {
    project = await generate({
      type: "app",
      layers: ["typescript"],
    });

    let { exitCode } = await project.install();

    hardExpect(exitCode, "Install succeeds").toBe(0);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("project check", () => {
    expect(project.desires.layers.map((layer) => layer.name)).toMatchInlineSnapshot(`
      [
        "typescript",
      ]
    `);
    expect(project.wantsTypeScript).toBe(true);
    expect(project.type).toBe("app");
  });

  it("has the typescript babel plugin", async () => {
    let content = await project.read("babel.config.js");

    expect(content).toContain("@babel/plugin-transform-typescript");
  });

  it("build for development (testing, etc)", async () => {
    let { exitCode } = await build(project);

    expect(exitCode).toBe(0);
  });

  it("build for production", async () => {
    let { exitCode } = await build(project, "production");

    expect(exitCode).toBe(0);
  });

  it("has no JS files", async () => {
    let results = globSync("app/**/*", {
      exclude: ["node_modules", "dist"],
      cwd: project.directory,
    });
    expect(results).toMatchInlineSnapshot(`
      [
        "app/app.ts",
        "app/config.ts",
        "app/router.ts",
        "app/templates",
        "app/templates/application.gts",
      ]
    `);
  });

  it("when re-applying, it no-ops correctly", async () => {
    let files = new Set(
      globSync("**/*", { cwd: project.directory, exclude: ["node_modules", "dist"] }),
    );

    await reapply(project, []);

    let filesAfter = new Set(
      globSync("**/*", { cwd: project.directory, exclude: ["node_modules", "dist"] }),
    );

    expect(filesAfter).toEqual(files);
    expect(files).toMatchInlineSnapshot(`
      Set {
        "app",
        "babel.config.js",
        "index.html",
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.json",
        "vite.config.mjs",
        "app/app.ts",
        "app/config.ts",
        "app/router.ts",
        "app/templates",
        "app/templates/application.gts",
      }
    `);
  });
});

const DEBUG_MARKERS = {
  assert: "__debug_fixture_assert__",
  deprecate: "__debug_fixture_deprecate__",
  warn: "__debug_fixture_warn__",
  ifDebug: "__debug_fixture_if_debug__",
  isDevelopingApp: "__debug_fixture_is_developing_app__",
};

/**
 * Lives in app/services/ so that app.ts's eager
 * `import.meta.glob("./services/**\/*")` pulls it into the build
 * without needing to modify any generated files.
 */
const debugFixture = `
import { assert, deprecate, warn } from "@ember/debug";
import { DEBUG } from "@glimmer/env";
import { isDevelopingApp, macroCondition } from "@embroider/macros";

/**
 * assert/deprecate get rewritten to \`!predicate && assert(...)\`,
 * so a literal \`true\` predicate lets the bundler fold the whole
 * call away even in development. This is truthy at runtime, but
 * opaque to static analysis.
 */
const truthy = (globalThis as Record<string, unknown>)["__debug_fixture__"] === undefined;

assert("${DEBUG_MARKERS.assert}", truthy);

deprecate("${DEBUG_MARKERS.deprecate}", truthy, {
  id: "debug-fixture",
  until: "999.0.0",
  for: "debug-fixture",
  since: { available: "0.0.0", enabled: "0.0.0" },
});

warn("${DEBUG_MARKERS.warn}", truthy, { id: "debug-fixture" });

if (DEBUG) {
  console.log("${DEBUG_MARKERS.ifDebug}");
}

if (macroCondition(isDevelopingApp())) {
  console.log("${DEBUG_MARKERS.isDevelopingApp}");
}
`;

/**
 * Only .js files -- the sourcemaps (.map) contain the original
 * source (with markers) even in production builds.
 */
async function builtJavaScript(project: Project): Promise<string> {
  let files = globSync("dist/**/*.js", { cwd: project.directory });

  hardExpect(files.length, "build produced JS files").toBeGreaterThan(0);

  let contents = await Promise.all(
    files.map((file) => readFile(join(project.directory, file), "utf-8")),
  );

  return contents.join("\n");
}

describe("debug macros", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      layers: ["typescript"],
    });

    await mkdir(join(project.directory, "app/services"), { recursive: true });
    await writeFile(join(project.directory, "app/services/debug-fixture.ts"), debugFixture);

    let { exitCode } = await project.install();

    hardExpect(exitCode, "Install succeeds").toBe(0);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("has the debug-macros babel plugin", async () => {
    let content = await project.read("babel.config.js");

    expect(content).toContain("babel-plugin-debug-macros");
  });

  it("development build keeps debug code", async () => {
    let { exitCode } = await build(project);

    hardExpect(exitCode).toBe(0);

    let output = await builtJavaScript(project);

    for (let [name, marker] of Object.entries(DEBUG_MARKERS)) {
      expect(output, `development build contains ${name}`).toContain(marker);
    }
  });

  it("production build strips assert(), deprecate(), warn(), if (DEBUG), and if (macroCondition(isDevelopingApp()))", async () => {
    let { exitCode } = await build(project, "production");

    hardExpect(exitCode).toBe(0);

    let output = await builtJavaScript(project);

    for (let [name, marker] of Object.entries(DEBUG_MARKERS)) {
      expect(output, `production build strips ${name}`).not.toContain(marker);
    }
  });
});

describe("javascript", () => {
  let project: Project;
  beforeAll(async () => {
    project = await generate({
      type: "app",
      layers: [],
    });

    let { exitCode } = await project.install();

    hardExpect(exitCode, "Install succeeds").toBe(0);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("project check", () => {
    expect(project.desires.layers.map((layer) => layer.name)).toMatchInlineSnapshot(`[]`);
    expect(project.wantsTypeScript).toBe(false);
    expect(project.type).toBe("app");
  });

  it("does not have the typescript babel plugin", async () => {
    let content = await project.read("babel.config.js");

    expect(content).not.toContain("@babel/plugin-transform-typescript");
  });

  it("updated the sub-path imports to not have ts extensions", async () => {
    let manifest = await packageJson.read(project.directory);

    expect(manifest.imports).toMatchInlineSnapshot(`
      {
        "#app/*": "./app/*",
        "#components/*": "./app/components/*",
        "#config": "./app/config.js",
        "#services/*": "./app/services/*",
        "#test-helpers/*": "./tests/helpers/*",
        "#utils/*": "./app/utils/*",
      }
    `);
  });

  it("build for development (testing, etc)", async () => {
    let { exitCode } = await build(project);

    expect(exitCode).toBe(0);
  });

  it("build for production", async () => {
    let { exitCode } = await build(project, "production");

    expect(exitCode).toBe(0);
  });

  it("has no TS files", async () => {
    let results = globSync("app/**/*", {
      exclude: ["node_modules", "dist"],
      cwd: project.directory,
    });
    expect(results).toMatchInlineSnapshot(`
      [
        "app/app.js",
        "app/config.js",
        "app/router.js",
        "app/templates",
        "app/templates/application.gjs",
      ]
    `);
  });

  it("when re-applying, it no-ops correctly", async () => {
    let files = new Set(
      globSync("**/*", { cwd: project.directory, exclude: ["node_modules", "dist"] }),
    );

    await reapply(project, []);

    let filesAfter = new Set(
      globSync("**/*", { cwd: project.directory, exclude: ["node_modules", "dist"] }),
    );

    expect(filesAfter).toEqual(files);
    expect(files).toMatchInlineSnapshot(`
      Set {
        "app",
        "babel.config.js",
        "index.html",
        "package.json",
        "pnpm-lock.yaml",
        "vite.config.mjs",
        "app/app.js",
        "app/config.js",
        "app/router.js",
        "app/templates",
        "app/templates/application.gjs",
      }
    `);
  });
});

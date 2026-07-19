import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles, read } from "#test-helpers";
import { writeLibrarySource } from "./library-src-fixtures.ts";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * The vitest layer ships infrastructure only (config, deps, scripts).
 * These tests generate projects with the layer, emit specs that exercise
 * each project's real exports, and run the real `pnpm test` (vitest in
 * headless-browser mode), asserting the specs genuinely run and pass.
 */

async function emit(project: Project, files: Record<string, string>) {
  for (let [path, contents] of Object.entries(files)) {
    let filePath = join(project.directory, path);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

async function installAndTest(project: Project) {
  let install = await execa("pnpm install", { cwd: project.directory, shell: true });
  expect(install.exitCode).toBe(0);

  let test = await execa("pnpm test", { cwd: project.directory, shell: true });
  expect(test.exitCode).toBe(0);
}

/**
 * Specs against the library base's real exports, in the flavor matching
 * the generated project (these files are emitted by this test, not
 * shipped by the layer, so no automatic conversion applies).
 */
function libraryTests(ext: "ts" | "js") {
  return {
    [`tests/rendering/greeting-test.g${ext}`]: `import { describe, test, expect } from "vitest";
import { setupRenderingContext } from "ember-vitest";

import { Greeting } from "../../src/index.${ext}";

describe("Greeting", () => {
  test("greets by name", async () => {
    using ctx = await setupRenderingContext();

    await ctx.render(<template><Greeting @name="World" /></template>);

    expect(ctx.element.textContent).toContain("Hello, World!");
  });
});
`,
    [`tests/rendering/badge-test.g${ext}`]: `import { describe, test, expect } from "vitest";
import { setupRenderingContext } from "ember-vitest";

import { Badge } from "../../src/index.${ext}";

describe("Badge", () => {
  test("renders its block", async () => {
    using ctx = await setupRenderingContext();

    await ctx.render(<template><Badge>New</Badge></template>);

    expect(ctx.find(".badge")?.textContent).toBe("New");
  });
});
`,
    [`tests/unit/math-test.${ext}`]: `import { describe, test, expect } from "vitest";

import { add } from "../../src/utils/math.${ext}";

describe("add", () => {
  test("sums two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
`,
  };
}

/**
 * Specs against the app base's real modules: boots an app made from the
 * app's own router class (pointed at a test-friendly location) and
 * application template, and visits its application route.
 */
function appTests(ext: "ts" | "js") {
  return {
    [`tests/application/welcome-test.g${ext}`]: `import { describe, expect } from "vitest";
import { applicationTest } from "ember-vitest";
import { visit } from "@ember/test-helpers";
import Application from "ember-strict-application-resolver";

import Router from "#app/router.${ext}";
import ApplicationTemplate from "#app/templates/application.g${ext}";

class TestRouter extends Router {
  location = "none";
}

class TestApp extends Application {
  modules = {
    "./router": TestRouter,
    "./templates/application": ApplicationTemplate,
  };
}

describe("application", () => {
  applicationTest.override({ app: ({}, use) => use(TestApp) });

  applicationTest("renders the welcome page", async ({ element }) => {
    await visit("/");

    expect(element.textContent).toContain("Welcome to Ember");
  });
});
`,
  };
}

describe("layer: vitest", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("JavaScript library", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "library", name: "my-lib", layers: ["vitest"] });
      dirs.push(project.directory);
    });

    it("generates the expected files", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/index.js",
          "tsdown.config.js",
          "vitest.config.mjs",
        ]
      `);
    });

    it("runs and passes emitted example tests", { timeout: 300_000 }, async () => {
      await writeLibrarySource(project, "javascript");
      await emit(project, libraryTests("js"));
      await installAndTest(project);
    });
  });

  describe("TypeScript library", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        layers: ["typescript", "vitest"],
      });
      dirs.push(project.directory);
    });

    it("generates the expected files", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/index.ts",
          "tsconfig.json",
          "tsdown.config.js",
          "vitest.config.mjs",
        ]
      `);
    });

    it("generates the vitest config", async () => {
      expect(await read(project, "vitest.config.mjs")).toMatchInlineSnapshot(`
        "import { ember } from "@nullvoxpopuli/ember-vite";
        import { webdriverio } from "@vitest/browser-webdriverio";
        import { defineConfig } from "vitest/config";

        export default defineConfig({
          plugins: [ember()],
          test: {
            include: ["tests/**/*-test.{js,ts,gjs,gts}"],
            maxConcurrency: 1,
            passWithNoTests: true,
            browser: {
              provider: webdriverio(),
              enabled: true,
              headless: true,
              instances: [{ browser: "chrome" }],
            },
          },
        });
        "
      `);
    });

    it("runs and passes emitted example tests", { timeout: 300_000 }, async () => {
      await writeLibrarySource(project, "typescript");
      await emit(project, libraryTests("ts"));
      await installAndTest(project);
    });
  });

  describe("TypeScript app", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "app",
        name: "my-app",
        layers: ["typescript", "vitest"],
      });
      dirs.push(project.directory);
    });

    it("runs and passes emitted example tests", { timeout: 300_000 }, async () => {
      await emit(project, appTests("ts"));
      await installAndTest(project);
    });
  });
});

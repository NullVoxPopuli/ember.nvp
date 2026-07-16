import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { execa } from "execa";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { Project } from "ember.nvp";

/**
 * The vitest layer has to produce a *runnable* test setup: these tests
 * generate both library flavors (JavaScript and TypeScript), snapshot the
 * interesting generated files, and run the real `pnpm test` (vitest in
 * headless-browser mode) against them, asserting the example tests pass.
 */

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split(sep).includes("node_modules"))
    .sort();
}

async function read(project: Project, filePath: string): Promise<string> {
  return readFile(join(project.directory, filePath), "utf-8");
}

async function installAndTest(project: Project) {
  let install = await execa("pnpm install", { cwd: project.directory, shell: true });
  expect(install.exitCode).toBe(0);

  let test = await execa("pnpm test", { cwd: project.directory, shell: true });
  expect(test.exitCode).toBe(0);
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
          "src/components/badge.gjs",
          "src/components/greeting.gjs",
          "src/index.js",
          "src/utils/math.js",
          "tests/rendering/badge-test.gjs",
          "tests/rendering/greeting-test.gjs",
          "tests/unit/math-test.js",
          "tsdown.config.js",
          "vitest.config.mjs",
        ]
      `);
    });

    it("example test imports match the emitted files", async () => {
      expect(await read(project, "tests/unit/math-test.js")).toMatchInlineSnapshot(`
        "import { describe, test, expect } from 'vitest';
        import { add } from "../../src/utils/math.js";
        describe('add', () => {
          test('sums two numbers', () => {
            expect(add(2, 3)).toBe(5);
          });
        });"
      `);

      expect(await read(project, "tests/rendering/greeting-test.gjs")).toMatchInlineSnapshot(`
        "import { describe, test, expect } from 'vitest';
        import { setupRenderingContext } from 'ember-vitest';
        import { Greeting } from "../../src/index.js";
        describe('Greeting', () => {
          test('greets by name', async () => {
            using ctx = await setupRenderingContext();
            await ctx.render(<template><Greeting @name="World" /></template>);
            expect(ctx.element.textContent).toContain('Hello, World!');
          });
        });"
      `);
    });

    it("runs and passes the generated example tests", { timeout: 300_000 }, async () => {
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
          "src/components/badge.gts",
          "src/components/greeting.gts",
          "src/index.ts",
          "src/utils/math.ts",
          "tests/rendering/badge-test.gts",
          "tests/rendering/greeting-test.gts",
          "tests/unit/math-test.ts",
          "tsconfig.json",
          "tsdown.config.js",
          "vitest.config.mjs",
        ]
      `);
    });

    it("generates the vitest config", async () => {
      expect(await read(project, "vitest.config.mjs")).toMatchInlineSnapshot(`
        "import { babel } from "@rollup/plugin-babel";
        import { buildMacros } from "@embroider/macros/babel";
        import { webdriverio } from "@vitest/browser-webdriverio";
        import { ember, extensions } from "@embroider/vite";
        import { defineConfig } from "vitest/config";

        const macros = buildMacros();

        export default defineConfig({
          plugins: [
            ember(),
            babel({
              babelHelpers: "inline",
              extensions,
              babelrc: false,
              configFile: false,
              plugins: [
                [
                  "@babel/plugin-transform-typescript",
                  {
                    allExtensions: true,
                    onlyRemoveTypeImports: true,
                    allowDeclareFields: true,
                  },
                ],
                [
                  "babel-plugin-ember-template-compilation",
                  {
                    transforms: [...macros.templateMacros],
                  },
                ],
                [
                  "module:decorator-transforms",
                  {
                    runtime: {
                      import: "decorator-transforms/runtime-esm",
                    },
                  },
                ],
                ...macros.babelMacros,
              ],
            }),
          ],
          optimizeDeps: {
            include: [
              "@glimmer/component",
              "@ember/test-helpers",
              "ember-strict-application-resolver",
              "ember-source/@ember/component/index.js",
              "ember-source/@ember/service/index.js",
              "ember-source/@ember/template-factory/index.js",
              "ember-source/@ember/component/template-only.js",
              "ember-source/@glimmer/tracking/index.js",
            ],
          },
          test: {
            include: ["tests/**/*-test.{js,ts,gjs,gts}"],
            maxConcurrency: 1,
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

    it("runs and passes the generated example tests", { timeout: 300_000 }, async () => {
      await installAndTest(project);
    });
  });
});

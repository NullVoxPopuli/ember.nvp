import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { execa } from "execa";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { Project } from "ember.nvp";

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split(sep).includes("node_modules"))
    .filter((path) => !path.startsWith(`dist${sep}`))
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

describe("layer: qunit", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("app", () => {
    it("it boots and run tests", async () => {
      const project = await generate({ type: "app", layers: ["qunit"] });
      dirs.push(project.directory);

      await installAndTest(project);
    });
  });

  describe("library (TypeScript)", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        layers: ["qunit", "typescript"],
      });
      dirs.push(project.directory);
    });

    it("generates the expected files, without any index.html", async () => {
      let files = await listFiles(project.directory);

      expect(files.some((file) => file.endsWith("index.html"))).toBe(false);
      expect(files).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "babel.config.js",
          "package.json",
          "src/components/badge.gts",
          "src/components/greeting.gts",
          "src/index.ts",
          "src/utils/math.ts",
          "testem.cjs",
          "tests/rendering/badge-test.gts",
          "tests/rendering/greeting-test.gts",
          "tests/test-helper.ts",
          "tests/unit/math-test.ts",
          "tsconfig.json",
          "tsdown.config.js",
          "vite.config.mjs",
        ]
      `);
    });

    it("generates the test build config", async () => {
      expect(await read(project, "vite.config.mjs")).toMatchInlineSnapshot(`
        "import { defineConfig } from "vite";
        import { ember } from "@nullvoxpopuli/ember-vite";

        export default defineConfig({
          plugins: [ember()],
        });
        "
      `);

      expect(await read(project, "babel.config.js")).toMatchInlineSnapshot(`
        "import { buildMacros } from "@embroider/macros/babel";

        const macros = buildMacros({
          configure(config) {
            if (process.env.EMBER_ENV === "test") {
              config.enableRuntimeMode();
            }
          },
        });

        export default {
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
                  import: import.meta.resolve("decorator-transforms/runtime-esm"),
                },
              },
            ],
            [
              "@babel/plugin-transform-runtime",
              {
                absoluteRuntime: import.meta.dirname,
                useESModules: true,
                regenerator: false,
              },
            ],
            ...macros.babelMacros,
          ],

          generatorOpts: {
            compact: false,
          },
        };
        "
      `);

      expect(await read(project, "testem.cjs")).toMatchInlineSnapshot(`
        ""use strict";

        if (typeof module !== "undefined") {
          module.exports = {
            test_page: "tests/index.html?hidepassed",
            cwd: "dist",
            disable_watching: true,
            launch_in_ci: ["Chrome"],
            launch_in_dev: ["Chrome"],
            browser_start_timeout: 120,
            browser_args: {
              Chrome: {
                ci: [
                  // --no-sandbox is needed when running Chrome inside a container
                  process.env.CI ? "--no-sandbox" : null,
                  "--headless",
                  "--disable-dev-shm-usage",
                  "--disable-software-rasterizer",
                  "--mute-audio",
                  "--remote-debugging-port=0",
                  "--window-size=1440,900",
                ].filter(Boolean),
              },
            },
          };
        }
        "
      `);

      expect(await read(project, "tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.ts"],
          plugins: [ember({ babel: { configFile: false } })],
        });
        "
      `);
    });

    it("installs, and the generated tests pass", async () => {
      await installAndTest(project);
    });

    it("the publish build still ships precompileTemplate", async () => {
      let build = await execa("pnpm build", { cwd: project.directory, shell: true });
      expect(build.exitCode).toBe(0);

      let output = await read(project, "dist/index.js");

      expect(output).toContain("precompileTemplate");
      expect(output).not.toContain("createTemplateFactory");
    });
  });

  describe("library (JavaScript)", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "library", name: "my-lib", layers: ["qunit"] });
      dirs.push(project.directory);
    });

    it("generates the expected files, without any index.html", async () => {
      let files = await listFiles(project.directory);

      expect(files.some((file) => file.endsWith("index.html"))).toBe(false);
      expect(files).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "babel.config.js",
          "package.json",
          "src/components/badge.gjs",
          "src/components/greeting.gjs",
          "src/index.js",
          "src/utils/math.js",
          "testem.cjs",
          "tests/rendering/badge-test.gjs",
          "tests/rendering/greeting-test.gjs",
          "tests/test-helper.js",
          "tests/unit/math-test.js",
          "tsdown.config.js",
          "vite.config.mjs",
        ]
      `);
    });

    it("has no TypeScript leftovers in the test build config", async () => {
      expect(await read(project, "babel.config.js")).toMatchInlineSnapshot(`
        "import { buildMacros } from "@embroider/macros/babel";

        const macros = buildMacros({
          configure(config) {
            if (process.env.EMBER_ENV === "test") {
              config.enableRuntimeMode();
            }
          },
        });

        export default {
          plugins: [[
            "babel-plugin-ember-template-compilation",
            {
              transforms: [...macros.templateMacros],
            },
          ], [
            "module:decorator-transforms",
            {
              runtime: {
                import: import.meta.resolve("decorator-transforms/runtime-esm"),
              },
            },
          ], [
            "@babel/plugin-transform-runtime",
            {
              absoluteRuntime: import.meta.dirname,
              useESModules: true,
              regenerator: false,
            },
          ], ...macros.babelMacros],

          generatorOpts: {
            compact: false,
          },
        };
        "
      `);

      expect(await read(project, "tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.js"],
          dts: false,
          plugins: [ember({ babel: { configFile: false } })],
        });
        "
      `);
    });

    it("installs, and the generated tests pass", async () => {
      await installAndTest(project);
    });

    it("the publish build still ships precompileTemplate", async () => {
      let build = await execa("pnpm build", { cwd: project.directory, shell: true });
      expect(build.exitCode).toBe(0);

      let output = await read(project, "dist/index.js");

      expect(output).toContain("precompileTemplate");
      expect(output).not.toContain("createTemplateFactory");
    });
  });
});

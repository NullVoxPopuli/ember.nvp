import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles } from "#test-helpers";
import { writeLibrarySource } from "./library-src-fixtures.ts";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

async function installAndTest(project: Project) {
  let install = await execa("pnpm install", { cwd: project.directory, shell: true });
  expect(install.exitCode).toBe(0);

  let test = await execa("pnpm test", { cwd: project.directory, shell: true });
  expect(test.exitCode).toBe(0);
}

/**
 * The layer ships testing infrastructure only; the tests exercising the
 * base's example exports are generated here, in both flavors.
 */
const exampleTests = {
  typescript: {
    "tests/rendering/greeting-test.gts": `import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import Greeting from "#src/components/greeting.gts";

module("Rendering | Greeting", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders", async function (assert) {
    await render(<template><Greeting @name="Tomster" /></template>);

    assert.dom("p").hasText("Hello, Tomster!");
  });
});
`,
    "tests/rendering/badge-test.gts": `import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import { Badge } from "#src/components/badge.gts";

module("Rendering | Badge", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders its content", async function (assert) {
    await render(<template><Badge>New</Badge></template>);

    assert.dom("span.badge").hasText("New");
  });
});
`,
    "tests/unit/math-test.ts": `import { module, test } from "qunit";

import { add } from "#src/utils/math.ts";

module("Unit | add", function () {
  test("adds two numbers", function (assert) {
    assert.strictEqual(add(1, 2), 3);
  });
});
`,
  },
  javascript: {
    "tests/rendering/greeting-test.gjs": `import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import Greeting from "#src/components/greeting.gjs";

module("Rendering | Greeting", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders", async function (assert) {
    await render(<template><Greeting @name="Tomster" /></template>);

    assert.dom("p").hasText("Hello, Tomster!");
  });
});
`,
    "tests/rendering/badge-test.gjs": `import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import { Badge } from "#src/components/badge.gjs";

module("Rendering | Badge", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders its content", async function (assert) {
    await render(<template><Badge>New</Badge></template>);

    assert.dom("span.badge").hasText("New");
  });
});
`,
    "tests/unit/math-test.js": `import { module, test } from "qunit";

import { add } from "#src/utils/math.js";

module("Unit | add", function () {
  test("adds two numbers", function (assert) {
    assert.strictEqual(add(1, 2), 3);
  });
});
`,
  },
};

async function writeExampleTests(project: Project, flavor: keyof typeof exampleTests) {
  for (let [filePath, contents] of Object.entries(exampleTests[flavor])) {
    let target = join(project.directory, filePath);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
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
      let files = await listFiles(project.directory, { includeDist: false });

      expect(files.some((file) => file.endsWith("index.html"))).toBe(false);
      expect(files).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "config/test/babel.config.js",
          "config/test/testem.cjs",
          "package.json",
          "src/index.ts",
          "tests/rendering/.gitkeep",
          "tests/test-helper.ts",
          "tests/unit/.gitkeep",
          "tsconfig.json",
          "tsdown.config.js",
          "vite.config.mjs",
        ]
      `);
    });

    it("generates the test build config", async () => {
      expect(await project.read("vite.config.mjs")).toMatchInlineSnapshot(`
        "import { defineConfig } from "vite";
        import { ember } from "@nullvoxpopuli/ember-vite";

        export default defineConfig({
          plugins: [ember({ babel: { configFile: "./config/test/babel.config.js" } })],
        });
        "
      `);
      expect(await project.read("config/test/babel.config.js")).toMatchInlineSnapshot(`
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
            ...macros.babelMacros,
          ],

          generatorOpts: {
            compact: false,
          },
        };
        "
      `);
      expect(await project.read("config/test/testem.cjs")).toMatchInlineSnapshot(`
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
    });

    it("leaves the publish build config alone", async () => {
      expect(await project.read("tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig } from "tsdown";
        import { ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.ts"],
          plugins: [ember()],
        });
        "
      `);
    });

    it("installs, and tests generated against the library's exports pass", async () => {
      await writeLibrarySource(project, "typescript");
      await writeExampleTests(project, "typescript");
      await installAndTest(project);
    });

    it("the publish build still ships precompileTemplate", async () => {
      let build = await execa("pnpm build", { cwd: project.directory, shell: true });
      expect(build.exitCode).toBe(0);

      let output = await project.read("dist/index.js");

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
      let files = await listFiles(project.directory, { includeDist: false });

      expect(files.some((file) => file.endsWith("index.html"))).toBe(false);
      expect(files).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "config/test/babel.config.js",
          "config/test/testem.cjs",
          "package.json",
          "src/index.js",
          "tests/rendering/.gitkeep",
          "tests/test-helper.js",
          "tests/unit/.gitkeep",
          "tsdown.config.js",
          "vite.config.mjs",
        ]
      `);
    });

    it("has no TypeScript leftovers in the test build config", async () => {
      expect(await project.read("config/test/babel.config.js")).toMatchInlineSnapshot(`
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
          ], ...macros.babelMacros],

          generatorOpts: {
            compact: false,
          },
        };
        "
      `);
      expect(await project.read("tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig } from "tsdown";
        import { ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.js"],
          dts: false,
          plugins: [ember()],
        });
        "
      `);
    });

    it("installs, and tests generated against the library's exports pass", async () => {
      await writeLibrarySource(project, "javascript");
      await writeExampleTests(project, "javascript");
      await installAndTest(project);
    });

    it("the publish build still ships precompileTemplate", async () => {
      let build = await execa("pnpm build", { cwd: project.directory, shell: true });
      expect(build.exitCode).toBe(0);

      let output = await project.read("dist/index.js");

      expect(output).toContain("precompileTemplate");
      expect(output).not.toContain("createTemplateFactory");
    });
  });
});

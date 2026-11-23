import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles, mktemp } from "#test-helpers";
import { globalNameFor } from "#bases/minimal-widget";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import type { Project } from "ember.nvp";

/**
 * The minimal-widget base ships a working pattern:
 * a counter component, and a `mount` function that renders it into a shadow root.
 *
 * These tests:
 * - build the generated project as-is
 * - run the widget in a real browser, through the vitest layer
 *   (from source, from the built module, and from the built global)
 */

async function install(project: Project) {
  let result = await execa("pnpm install", { cwd: project.directory, shell: true });
  expect(result.exitCode).toBe(0);
}

async function build(project: Project) {
  let result = await execa("pnpm build", { cwd: project.directory, shell: true });
  expect(result.exitCode).toBe(0);
}

async function emit(project: Project, files: Record<string, string>) {
  for (let [path, contents] of Object.entries(files)) {
    let filePath = join(project.directory, path);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

/**
 * Bundled output hoists its own imports to its first lines.
 *
 * ember-source's doc comments further down also start lines with `import`,
 * so only the leading import lines count.
 */
async function leadingImports(project: Project, file: string) {
  let code = (await project.read(file)) ?? "";
  let imports: string[] = [];

  for (let line of code.split("\n")) {
    if (line.startsWith("import ")) {
      imports.push(line);
    } else if (line.trim() !== "") {
      break;
    }
  }

  return imports;
}

/**
 * The vitest layer writes `tests/rendering/mount-test`, which imports `mount` from the source.
 * A second call swaps the import again.
 *
 * To test a build with the same tests, this swaps that import for:
 * - `dist`: the built ES module
 * - `global`: the built `<script>` file, which assigns a global
 */
async function pointGeneratedTestAt(project: Project, from: "dist" | "global", globalName = "") {
  let file = "tests/rendering/mount-test.ts";
  let source = (await project.read(file))!;
  let original = /^import { mount } from "[^"]+";$/m;
  let replacement = {
    dist: `import { mount } from "../../dist/index.js";`,
    global: `import code from "../../dist/index.iife.js?raw";

let script = document.createElement("script");
script.textContent = code;
document.head.appendChild(script);

let { mount } = (window as any).${globalName};`,
  }[from];

  expect(source).toMatch(original);

  await emit(project, { [file]: source.replace(original, replacement) });
}

/**
 * vitest is configured with `passWithNoTests`, and testem exits 0 when the build leaves a test file out.
 *
 * So each run must also name the generated tests.
 */
async function runGeneratedTests(project: Project, command: string, names: string[]) {
  let test = await execa(command, { cwd: project.directory, shell: true });

  expect(test.exitCode).toBe(0);

  /**
   * CI sets FORCE_COLOR, which puts color codes inside the test names
   */
  let output = stripVTControlCharacters(test.stdout);

  for (let name of names) {
    expect(output).toContain(name);
  }
}

/**
 * The default reporter prints no test names
 */
const VITEST = "pnpm test --reporter=verbose";
const VITEST_NAMES = ["mount > counts clicks", "mount > keeps the styles of the host page out"];
const QUNIT_NAMES = [
  "Rendering | mount: counts clicks",
  "Rendering | mount: removes the widget on destroy",
];

describe("base: minimal-widget", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("global name", () => {
    it("is the package name in PascalCase", () => {
      expect(globalNameFor("my-widget")).toBe("MyWidget");
      expect(globalNameFor("my.cool_widget")).toBe("MyCoolWidget");
    });

    it("drops the scope", () => {
      expect(globalNameFor("@acme/my-widget")).toBe("MyWidget");
    });

    it("gets a prefix when the name starts with a digit", () => {
      expect(globalNameFor("3d-viewer")).toBe("Widget3dViewer");
    });
  });

  describe("JavaScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "widget", name: "my-widget", layers: [] });
      dirs.push(project.directory);
    });

    it("generates the expected files", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/index.js",
          "src/mount.js",
          "src/widget.gjs",
          "tsdown.config.js",
        ]
      `);
    });

    it("exports mount and the component", async () => {
      expect(await project.read("src/index.js")).toMatchInlineSnapshot(`
        "export { mount } from "./mount.js";
        export { default as Widget } from "./widget.gjs";"
      `);
    });

    it("is publishable", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      expect(manifest).not.toHaveProperty("private");
      expect(manifest.exports).toMatchInlineSnapshot(`
        {
          ".": {
            "default": "./dist/index.js",
          },
          "./global": "./dist/index.iife.js",
        }
      `);
    });

    it("has no TypeScript leftovers", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      expect(manifest.devDependencies).not.toHaveProperty("typescript");
      expect(manifest.devDependencies).not.toHaveProperty("@ember/library-tsconfig");

      expect(await project.read("tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig } from "tsdown";
        import { ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.js"],
          dts: false,
          format: ["esm", "iife"],
          globalName: "MyWidget",
          minify: true,
          plugins: [ember({ bundle: true })],
        });
        "
      `);
    });

    it("builds a self-contained module and a global", async () => {
      await install(project);
      await build(project);

      expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
        [
          "index.iife.js",
          "index.iife.js.map",
          "index.js",
          "index.js.map",
        ]
      `);

      /**
       * Nothing is left for a consumer to resolve
       */
      expect(await leadingImports(project, "dist/index.js")).toEqual([]);

      /**
       * Only what the widget imports: no router, no classic object model
       */
      let code = (await project.read("dist/index.js"))!;

      expect(code).not.toContain("router:main");
      expect(code).not.toContain("EmberObject");
      expect(await project.read("dist/index.iife.js")).toMatch(/^var MyWidget=/);
    });
  });

  describe("TypeScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        directory: await mktemp("acme-widget"),
        type: "widget",
        name: "@acme/widget",
        layers: ["typescript"],
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
          "src/mount.ts",
          "src/widget.gts",
          "tsconfig.json",
          "tsdown.config.js",
        ]
      `);
    });

    it("names the global after the package", async () => {
      expect(await project.read("tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig } from "tsdown";
        import { ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.ts"],
          format: ["esm", "iife"],
          globalName: "Widget",
          minify: true,
          plugins: [ember({ bundle: true })],
        });
        "
      `);
    });

    it("type checks", async () => {
      await install(project);

      let types = await execa("pnpm lint:types", { cwd: project.directory, shell: true });
      expect(types.exitCode).toBe(0);
    });

    it("builds, including declarations", async () => {
      await build(project);

      expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
        [
          "index.d.ts",
          "index.d.ts.map",
          "index.iife.js",
          "index.iife.js.map",
          "index.js",
          "index.js.map",
        ]
      `);

      let declarations = (await project.read("dist/index.d.ts"))!;

      expect(declarations).toContain("declare function mount(");
      expect(declarations).toContain("interface MountedWidget");
    });
  });

  describe("in a browser (vitest layer)", () => {
    describe("TypeScript", () => {
      let project: Project;

      beforeAll(async () => {
        project = await generate({
          type: "widget",
          name: "my-widget",
          layers: ["typescript", "vitest"],
        });
        dirs.push(project.directory);
      });

      it("writes an example test", async () => {
        expect(await listFiles(join(project.directory, "tests"))).toEqual([
          "rendering/mount-test.ts",
        ]);
      });

      it("the example test passes", { timeout: 300_000 }, async () => {
        await install(project);
        await runGeneratedTests(project, VITEST, VITEST_NAMES);
      });

      it(
        "the example test passes against the built package, with no ember on the page",
        { timeout: 300_000 },
        async () => {
          await build(project);
          await pointGeneratedTestAt(project, "dist");
          await runGeneratedTests(project, VITEST, VITEST_NAMES);
        },
      );

      it(
        "the example test passes against the global build, loaded by a script tag",
        { timeout: 300_000 },
        async () => {
          await pointGeneratedTestAt(project, "global", "MyWidget");
          await runGeneratedTests(project, VITEST, VITEST_NAMES);
        },
      );
    });

    describe("JavaScript", () => {
      let project: Project;

      beforeAll(async () => {
        project = await generate({
          type: "widget",
          name: "my-widget",
          layers: ["vitest"],
        });
        dirs.push(project.directory);
      });

      it("writes an example test", async () => {
        expect(await listFiles(join(project.directory, "tests"))).toEqual([
          "rendering/mount-test.js",
        ]);
        expect(await project.read("tests/rendering/mount-test.js")).toContain(
          `import { mount } from "../../src/index.js";`,
        );
      });

      it("the example test passes", { timeout: 300_000 }, async () => {
        await install(project);
        await runGeneratedTests(project, VITEST, VITEST_NAMES);
      });
    });
  });

  describe.each([
    { flavor: "TypeScript", layers: ["typescript", "qunit"], file: "mount-test.ts" },
    { flavor: "JavaScript", layers: ["qunit"], file: "mount-test.js" },
  ])("in a browser (qunit layer, $flavor)", ({ layers, file }) => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "widget", name: "my-widget", layers });
      dirs.push(project.directory);
    });

    it("writes an example test", async () => {
      expect(await project.read(`tests/rendering/${file}`)).toBeTruthy();
    });

    it("the example test passes", { timeout: 300_000 }, async () => {
      await install(project);
      await runGeneratedTests(project, "pnpm test", QUNIT_NAMES);
    });
  });
});

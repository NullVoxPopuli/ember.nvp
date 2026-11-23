import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles, mktemp } from "#test-helpers";
import { globalNameFor } from "#bases/minimal-widget";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
 * Drives the generated widget the way a host page would:
 * - mount it into an element
 * - click
 * - update the args
 * - destroy it
 *
 * `from` is what provides `mount`:
 * - `src`: the source
 * - `dist`: the built ES module
 * - `global`: the built `<script>` file, which assigns a global
 */
function widgetTests(ext: "ts" | "js", from: "src" | "dist" | "global", globalName = "") {
  let ts = ext === "ts";
  let setup = {
    src: `import { mount } from "../src/index.${ext}";`,
    dist: `import { mount } from "../dist/index.js";`,
    global: `import code from "../dist/index.iife.js?raw";

let script = document.createElement("script");
script.textContent = code;
document.head.appendChild(script);

let { mount } = ${ts ? "(window as any)" : "window"}.${globalName};`,
  }[from];

  return {
    [`tests/${from}-widget-test.${ext}`]: `import { describe, test, expect, afterEach } from "vitest";
import { renderSettled } from "@ember/renderer";

${setup}

afterEach(() => {
  document.body.innerHTML = "";
});

function host() {
  let element = document.createElement("div");

  document.body.appendChild(element);

  return element;
}

function query(element${ts ? ": Element" : ""}, selector${ts ? ": string" : ""}) {
  return element.shadowRoot?.querySelector(selector);
}

describe("mount (${from})", () => {
  test("renders into a shadow root, with default args", async () => {
    let element = host();

    mount(element);
    await renderSettled();

    expect(element.children).toHaveLength(0);
    expect(query(element, "h2")?.textContent).toBe("Count");
    expect(query(element, "output")?.textContent).toBe("0");
    expect(query(element, "button")?.textContent).toBe("+1");
  });

  test("counts clicks", async () => {
    let element = host();

    mount(element, { step: 2 });
    await renderSettled();

    ${ts ? '(query(element, "button") as HTMLButtonElement)' : 'query(element, "button")'}.click();
    await renderSettled();
    ${ts ? '(query(element, "button") as HTMLButtonElement)' : 'query(element, "button")'}.click();
    await renderSettled();

    expect(query(element, "output")?.textContent).toBe("4");
  });

  test("re-renders on update", async () => {
    let element = host();
    let widget = mount(element, { title: "Clicks" });

    await renderSettled();

    widget.update({ title: "Taps", step: 3 });
    await renderSettled();

    expect(query(element, "h2")?.textContent).toBe("Taps");
    expect(query(element, "button")?.textContent).toBe("+3");
  });

  test("keeps the styles of the host page out", async () => {
    let style = document.createElement("style");

    style.textContent = "h2 { color: rgb(255, 0, 0); }";
    document.body.appendChild(style);

    let element = host();

    mount(element);
    await renderSettled();

    expect(getComputedStyle(query(element, "h2")${ts ? "!" : ""}).color).not.toBe("rgb(255, 0, 0)");
  });

  test("removes the widget on destroy", async () => {
    let element = host();
    let widget = mount(element);

    await renderSettled();

    widget.destroy();
    await renderSettled();

    expect(element.shadowRoot?.childNodes).toHaveLength(0);
  });
});
`,
  };
}

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

      it("mounts, counts, updates, and isolates styles", { timeout: 300_000 }, async () => {
        await emit(project, widgetTests("ts", "src"));
        await install(project);

        let test = await execa("pnpm test", { cwd: project.directory, shell: true });
        expect(test.exitCode).toBe(0);
      });

      it(
        "runs from the built package, with no ember on the page",
        { timeout: 300_000 },
        async () => {
          await build(project);
          /**
           * Only the dist specs: each copy of ember on the page is a separate renderer
           */
          await rm(join(project.directory, "tests"), { recursive: true, force: true });
          await emit(project, widgetTests("ts", "dist"));

          let test = await execa("pnpm test", { cwd: project.directory, shell: true });
          expect(test.exitCode).toBe(0);
        },
      );

      it("runs from the global build, loaded by a script tag", { timeout: 300_000 }, async () => {
        await rm(join(project.directory, "tests"), { recursive: true, force: true });
        await emit(project, widgetTests("ts", "global", "MyWidget"));

        let test = await execa("pnpm test", { cwd: project.directory, shell: true });
        expect(test.exitCode).toBe(0);
      });
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

      it("mounts, counts, updates, and isolates styles", { timeout: 300_000 }, async () => {
        await emit(project, widgetTests("js", "src"));
        await install(project);

        let test = await execa("pnpm test", { cwd: project.directory, shell: true });
        expect(test.exitCode).toBe(0);
      });
    });
  });
});

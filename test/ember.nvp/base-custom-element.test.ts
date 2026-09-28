import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles } from "#test-helpers";
import { tagNameFor } from "#bases/minimal-custom-element";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * The minimal-custom-element base ships a working pattern:
 * a counter component wrapped in a custom element.
 *
 * So unlike the library base, there is no example source to write in.
 * These tests:
 * - build the generated project as-is
 * - run the element in a real browser, through the vitest layer
 *   (from source, and from the built dist)
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
 * The shared chunk carries a content hash,
 * which would change with every dependency bump.
 *
 * Stable names only.
 */
async function listDist(project: Project) {
  let files = await listFiles(join(project.directory, "dist"));

  return files.map((file) => file.replace(/^src-[\w-]+\.js/, "src-[hash].js"));
}

/**
 * The bundled chunk's own imports are hoisted above its first region marker.
 *
 * ember-source's doc comments below it also start lines with `import`,
 * so only that head is inspected.
 */
async function chunkImports(project: Project) {
  let files = await listFiles(join(project.directory, "dist"));
  let chunk = files.find((file) => /^src-[\w-]+\.js$/.test(file));

  expect(chunk).toBeDefined();

  let code = (await project.read(`dist/${chunk}`)) ?? "";
  let head = code.split("//#region")[0] ?? "";

  return head.match(/^import .*$/gm) ?? [];
}

/**
 * Drives the generated element the way a consumer would:
 * - import the register entry
 * - put the tag on the page
 * - click
 * - change attributes
 *
 * `from` is the module that provides the element:
 * - `src`: the source
 * - `dist`: the self-contained output, after a build
 */
function elementTests(ext: "ts" | "js", tagName: string, from: "src" | "dist" = "src") {
  let register = from === "src" ? `../src/register.${ext}` : "../dist/register.js";

  return {
    [`tests/${from}-element-test.${ext}`]: `import { describe, test, expect, afterEach } from "vitest";
import { renderSettled } from "@ember/renderer";

import "${register}";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(attributes${ext === "ts" ? ": Record<string, string>" : ""} = {}) {
  let element = document.createElement("${tagName}");

  for (let [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  document.body.appendChild(element);

  return element;
}

describe("<${tagName}>", () => {
  test("renders the counter with default args", async () => {
    let element = mount();

    await renderSettled();

    expect(element.querySelector(".label")?.textContent).toBe("Count");
    expect(element.querySelector("output")?.textContent).toBe("0");
    expect(element.querySelector("button")?.textContent).toBe("+1");
  });

  test("counts clicks", async () => {
    let element = mount();

    await renderSettled();

    element.querySelector("button")?.click();
    await renderSettled();
    element.querySelector("button")?.click();
    await renderSettled();

    expect(element.querySelector("output")?.textContent).toBe("2");
  });

  test("passes initial attributes as args", async () => {
    let element = mount({ label: "Clicks", step: "5" });

    await renderSettled();

    expect(element.querySelector(".label")?.textContent).toBe("Clicks");
    expect(element.querySelector("button")?.textContent).toBe("+5");

    element.querySelector("button")?.click();
    await renderSettled();

    expect(element.querySelector("output")?.textContent).toBe("5");
  });

  test("re-renders when attributes change", async () => {
    let element = mount();

    await renderSettled();

    element.setAttribute("label", "Taps");
    element.setAttribute("step", "3");
    await renderSettled();

    expect(element.querySelector(".label")?.textContent).toBe("Taps");
    expect(element.querySelector("button")?.textContent).toBe("+3");

    element.querySelector("button")?.click();
    await renderSettled();

    expect(element.querySelector("output")?.textContent).toBe("3");
  });

  test("renders again after being moved", async () => {
    let element = mount();

    await renderSettled();

    element.querySelector("button")?.click();
    await renderSettled();

    element.remove();
    document.body.appendChild(element);
    await renderSettled();

    expect(element.querySelector("output")?.textContent).toBe("0");
  });
});
`,
  };
}

describe("base: minimal-custom-element", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("tag name", () => {
    it("is the package name", () => {
      expect(tagNameFor("my-counter")).toBe("my-counter");
    });

    it("drops the scope", () => {
      expect(tagNameFor("@acme/my-counter")).toBe("my-counter");
    });

    it("gets a suffix when the name has no hyphen", () => {
      expect(tagNameFor("counter")).toBe("counter-element");
      expect(tagNameFor("@acme/counter")).toBe("counter-element");
    });
  });

  describe("JavaScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "custom-element", name: "my-counter", layers: [] });
      dirs.push(project.directory);
    });

    it("generates the expected files", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/components/counter.gjs",
          "src/element.js",
          "src/index.js",
          "src/register.js",
          "tsdown.config.js",
        ]
      `);
    });

    it("registers the tag under the project name", async () => {
      expect(await project.read("src/register.js")).toMatchInlineSnapshot(`
        "import { CounterElement } from "./index.js";
        if (!customElements.get('my-counter')) {
          customElements.define('my-counter', CounterElement);
        }"
      `);
      expect(await project.read("README.md")).toContain("<my-counter label=");
    });

    it("exports the element and the component", async () => {
      expect(await project.read("src/index.js")).toMatchInlineSnapshot(`
        "export { CounterElement } from "./element.js";
        export { default as Counter } from "./components/counter.gjs";"
      `);
    });

    it("is publishable", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      expect(manifest).not.toHaveProperty("private");
      expect(manifest.exports["./register"]).toEqual({ default: "./dist/register.js" });
    });

    it("has no TypeScript leftovers", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      expect(manifest.devDependencies).not.toHaveProperty("typescript");
      expect(manifest.devDependencies).not.toHaveProperty("@ember/library-tsconfig");
      expect(JSON.stringify(manifest.exports)).not.toContain("types");

      expect(await project.read("tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig } from "tsdown";
        import { ember } from "@nullvoxpopuli/ember-rolldown";

        export default defineConfig({
          entry: ["./src/index.js", "./src/register.js"],
          dts: false,
          plugins: [ember({ bundle: true })],
        });
        "
      `);
    });

    it("builds a self-contained package", async () => {
      await install(project);
      await build(project);

      expect(await listDist(project)).toMatchInlineSnapshot(`
        [
          "index.js",
          "register.js",
          "register.js.map",
          "src-[hash].js",
          "src-[hash].js.map",
        ]
      `);

      let register = await project.read("dist/register.js");

      expect(register).toContain('customElements.define("my-counter"');
      // Both entries share one chunk holding the element, the component,
      // and ember itself
      expect(register).toMatch(/from "\.\/src-[\w-]+\.js"/);
      expect(await project.read("dist/index.js")).toMatch(/from "\.\/src-[\w-]+\.js"/);

      // Nothing is left for a consumer to resolve
      expect(await chunkImports(project)).toEqual([]);

      let files = await listFiles(join(project.directory, "dist"));
      let chunk = (await project.read(`dist/${files.find((file) => file.startsWith("src-"))}`))!;

      // The template ships compiled for the bundled ember-source, so the
      // page needs no template compiler
      expect(chunk).not.toContain("precompileTemplate(");
      expect(chunk).toContain('"block":');
      expect(chunk).toContain('observedAttributes = ["label", "step"]');
      expect(chunk).toContain("renderComponent");
    });
  });

  describe("TypeScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "custom-element", name: "counter", layers: ["typescript"] });
      dirs.push(project.directory);
    });

    it("generates the expected files", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/components/counter.gts",
          "src/element.ts",
          "src/index.ts",
          "src/register.ts",
          "tsconfig.json",
          "tsdown.config.js",
        ]
      `);
    });

    it("registers the tag with a suffix when the name has no hyphen", async () => {
      expect(await project.read("src/register.ts")).toMatchInlineSnapshot(`
        "import { CounterElement } from "./index.ts";

        if (!customElements.get("counter-element")) {
          customElements.define("counter-element", CounterElement);
        }
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

      expect(await listDist(project)).toMatchInlineSnapshot(`
        [
          "index.d.ts",
          "index.d.ts.map",
          "index.js",
          "register.d.ts",
          "register.js",
          "register.js.map",
          "src-[hash].js",
          "src-[hash].js.map",
        ]
      `);

      expect(await chunkImports(project)).toEqual([]);

      let declarations = (await project.read("dist/index.d.ts"))!;

      expect(declarations).toContain("declare class CounterElement extends HTMLElement");
      // The component's base class is bundled in, like the runtime.
      // (ember-source's own types are ambient, so those stay by name)
      expect(declarations).toContain("declare class Component<");
      expect(declarations).not.toContain('from "@glimmer/component"');
      expect(await project.read("dist/register.d.ts")).toMatchInlineSnapshot(`"export {}"`);
    });
  });

  describe("in a browser (vitest layer)", () => {
    describe("TypeScript", () => {
      let project: Project;

      beforeAll(async () => {
        project = await generate({
          type: "custom-element",
          name: "my-counter",
          layers: ["typescript", "vitest"],
        });
        dirs.push(project.directory);
      });

      it("renders, counts, and reacts to attributes", { timeout: 300_000 }, async () => {
        await emit(project, elementTests("ts", "my-counter"));
        await install(project);

        let test = await execa("pnpm test", { cwd: project.directory, shell: true });
        expect(test.exitCode).toBe(0);
      });

      it(
        "runs from the built package, with no ember on the page",
        { timeout: 300_000 },
        async () => {
          await build(project);
          // Only the dist spec: the vitest run must not also load the source
          // copy, or the tag would already be defined by whichever wins
          await rm(join(project.directory, "tests"), { recursive: true, force: true });
          await emit(project, elementTests("ts", "my-counter", "dist"));

          let test = await execa("pnpm test", { cwd: project.directory, shell: true });
          expect(test.exitCode).toBe(0);
        },
      );
    });

    describe("JavaScript", () => {
      let project: Project;

      beforeAll(async () => {
        project = await generate({
          type: "custom-element",
          name: "my-counter",
          layers: ["vitest"],
        });
        dirs.push(project.directory);
      });

      it("renders, counts, and reacts to attributes", { timeout: 300_000 }, async () => {
        await emit(project, elementTests("js", "my-counter"));
        await install(project);

        let test = await execa("pnpm test", { cwd: project.directory, shell: true });
        expect(test.exitCode).toBe(0);
      });
    });
  });
});

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles, mktemp } from "#test-helpers";
import { writeLibrarySource } from "./library-src-fixtures.ts";
import { execa } from "execa";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * The minimal-library base has to produce a *buildable* library: these tests
 * generate both flavors (JavaScript and TypeScript), snapshot the interesting
 * generated files, and run the real `pnpm build` (tsdown + rolldown) against
 * them.
 */

async function installAndBuild(project: Project) {
  let install = await execa("pnpm install", { cwd: project.directory, shell: true });
  expect(install.exitCode).toBe(0);

  let build = await execa("pnpm build", { cwd: project.directory, shell: true });
  expect(build.exitCode).toBe(0);
}

describe("base: minimal-library", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("JavaScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "library", name: "my-lib", layers: [] });
      dirs.push(project.directory);
    });

    it("generates the expected files (src is empty)", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/index.js",
          "tsdown.config.js",
        ]
      `);

      expect(await project.read("src/index.js")).toBe("");
    });

    it("is publishable", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      // The template is private (it lives in a workspace); the generated
      // library must not be
      expect(manifest).not.toHaveProperty("private");
    });

    it("has no TypeScript leftovers", async () => {
      let manifest = JSON.parse((await project.read("package.json"))!);

      expect(manifest.devDependencies).not.toHaveProperty("typescript");
      expect(manifest.devDependencies).not.toHaveProperty("@ember/library-tsconfig");
      // No declarations are emitted without types
      expect(JSON.stringify(manifest.exports)).not.toContain("types");

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

    it("removes the TS plugin from an existing project's babel config", async () => {
      // The base doesn't emit a babel.config.js, but generation can run
      // over an existing project that has one
      let directory = await mktemp("existing-lib");

      dirs.push(directory);

      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "babel.config.js"),
        `export default {
  plugins: [
    ["@babel/plugin-transform-typescript", { allExtensions: true }],
    ["module:decorator-transforms"],
  ],
};
`,
      );

      let existing = await generate({ directory, type: "library", name: "existing-lib" });

      let babelConfig = await readFile(join(existing.directory, "babel.config.js"), "utf-8");

      expect(babelConfig).not.toContain("@babel/plugin-transform-typescript");
      expect(babelConfig).toContain("module:decorator-transforms");
    });

    it("builds (with example source written in)", async () => {
      await writeLibrarySource(project, "javascript");
      await installAndBuild(project);

      let output = await project.read("dist/index.js");

      // Published libraries ship precompileTemplate (the consuming app does
      // the final compile), never wire format
      expect(output).toContain("precompileTemplate");
      expect(output).not.toContain("createTemplateFactory");

      expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
        [
          "index.js",
          "index.js.map",
        ]
      `);
    });
  });

  describe("TypeScript", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({ type: "library", name: "my-lib", layers: ["typescript"] });
      dirs.push(project.directory);
    });

    it("generates the expected files (src is empty)", async () => {
      expect(await listFiles(project.directory)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          "README.md",
          "package.json",
          "src/index.ts",
          "tsconfig.json",
          "tsdown.config.js",
        ]
      `);

      expect(await project.read("src/index.ts")).toBe("");
    });

    it("type checks", async () => {
      await writeLibrarySource(project, "typescript");

      let install = await execa("pnpm install", { cwd: project.directory, shell: true });
      expect(install.exitCode).toBe(0);

      let types = await execa("pnpm lint:types", { cwd: project.directory, shell: true });
      expect(types.exitCode).toBe(0);
    });

    it("builds, including declarations", async () => {
      await installAndBuild(project);

      let output = await project.read("dist/index.js");

      expect(output).toContain("precompileTemplate");
      expect(output).not.toContain("createTemplateFactory");

      let declarations = await project.read("dist/index.d.ts");

      expect(declarations).toMatchInlineSnapshot(`
        "import { TOC } from "@ember/component/template-only";
        import Component from "@glimmer/component";
        //#region src/components/badge.d.ts
        interface BadgeSignature {
          Element: HTMLSpanElement;
          Blocks: {
            default: [];
          };
        }
        declare const Badge: TOC<BadgeSignature>;
        //#endregion
        //#region src/components/greeting.d.ts
        interface GreetingSignature {
          Element: HTMLParagraphElement;
          Args: {
            name: string;
          };
        }
        declare class Greeting extends Component<GreetingSignature> {}
        //#endregion
        //#region src/utils/math.d.ts
        declare function add(a: number, b: number): number;
        //#endregion
        export { Badge, type BadgeSignature, Greeting, type GreetingSignature, add };
        //# sourceMappingURL=index.d.ts.map"
      `);

      expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
        [
          "index.d.ts",
          "index.d.ts.map",
          "index.js",
          "index.js.map",
        ]
      `);
    });

    it("errors when tsconfig lacks isolatedDeclarations", async () => {
      let tsconfigPath = join(project.directory, "tsconfig.json");
      let original = await readFile(tsconfigPath, "utf-8");

      try {
        await writeFile(
          tsconfigPath,
          JSON.stringify({
            extends: "@ember/library-tsconfig",
            include: ["src"],
            compilerOptions: { allowJs: true, rootDir: "./src" },
          }),
        );

        let build = await execa("pnpm build", {
          cwd: project.directory,
          shell: true,
          reject: false,
          all: true,
        });

        expect(build.exitCode).not.toBe(0);
        expect(build.all).toContain('"compilerOptions.isolatedDeclarations": true');
      } finally {
        await writeFile(tsconfigPath, original);
      }
    });
  });
});

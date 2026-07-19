import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, build, reapply } from "#test-helpers";
import { packageJson } from "ember-apply";

import type { Project } from "ember.nvp";
import { readFile, rm } from "node:fs/promises";
import { globSync } from "node:fs";
import { join } from "node:path";

const expect = hardExpect.soft;

describe("typescript", () => {
  let project: Project;
  beforeAll(async () => {
    project = await generate({
      name: "my-extension",
      type: "extension",
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
    expect(project.type).toBe("extension");
  });

  it("has the typescript babel plugin", async () => {
    let content = await project.read("babel.config.js");

    expect(content).toContain("@babel/plugin-transform-typescript");
  });

  it("named the extension in the manifest", async () => {
    let manifest = JSON.parse((await project.read("public/manifest.json"))!);

    expect(manifest.name).toBe("my-extension");
    expect(manifest.manifest_version).toBe(3);
  });

  it("boots from an external script (extension CSP forbids inline scripts)", async () => {
    let html = await project.read("index.html");

    expect(html).toContain(`src="./app/boot.ts"`);
    expect(html).not.toContain("Application.create");
  });

  it("build for development (testing, etc)", async () => {
    let { exitCode } = await build(project);

    expect(exitCode).toBe(0);
  });

  it("build for production", async () => {
    let { exitCode } = await build(project, "production");

    expect(exitCode).toBe(0);
  });

  it("dist is loadable as an unpacked extension", async () => {
    let manifest = JSON.parse(
      await readFile(join(project.directory, "dist/manifest.json"), "utf-8"),
    );

    expect(manifest.name).toBe("my-extension");
    expect(manifest.action.default_popup).toBe("index.html");

    let html = await readFile(join(project.directory, "dist/index.html"), "utf-8");

    expect(html).toContain(`<script type="module"`);
    expect(html).not.toContain("Application.create");
  });

  it("has no JS files", async () => {
    let results = globSync("app/**/*", {
      exclude: ["node_modules", "dist"],
      cwd: project.directory,
    });
    expect(results).toMatchInlineSnapshot(`
      [
        "app/app.ts",
        "app/boot.ts",
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
        "README.md",
        "app",
        "babel.config.js",
        "index.html",
        "package.json",
        "pnpm-lock.yaml",
        "public",
        "tsconfig.json",
        "vite.config.mjs",
        "public/manifest.json",
        "app/app.ts",
        "app/boot.ts",
        "app/config.ts",
        "app/router.ts",
        "app/templates",
        "app/templates/application.gts",
      }
    `);
  });
});

describe("javascript", () => {
  let project: Project;
  beforeAll(async () => {
    project = await generate({
      name: "my-extension",
      type: "extension",
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
    expect(project.type).toBe("extension");
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

  it("the popup points at the renamed boot script", async () => {
    let html = await project.read("index.html");

    expect(html).toContain(`src="./app/boot.js"`);
    expect(html).not.toContain("boot.ts");
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
        "app/boot.js",
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
        "README.md",
        "app",
        "babel.config.js",
        "index.html",
        "package.json",
        "pnpm-lock.yaml",
        "public",
        "vite.config.mjs",
        "public/manifest.json",
        "app/app.js",
        "app/boot.js",
        "app/config.js",
        "app/router.js",
        "app/templates",
        "app/templates/application.gjs",
      }
    `);
  });
});

import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, build } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";
import { globSync } from "node:fs";

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

  it("project check", () => {
    expect(project.desires.layers.map((layer) => layer.name)).toMatchInlineSnapshot(`[]`);
    expect(project.wantsTypeScript).toBe(false);
    expect(project.type).toBe("app");
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
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
});

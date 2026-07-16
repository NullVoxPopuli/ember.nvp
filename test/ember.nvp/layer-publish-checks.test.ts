import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { execa } from "execa";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * publint and are-the-types-wrong run inside the library's own build
 * (tsdown), so the real assertion is their report lines in `pnpm build`
 * output.
 */

async function read(project: Project, filePath: string): Promise<string> {
  return readFile(join(project.directory, filePath), "utf-8");
}

describe("layers: publint + are-the-types-wrong", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("TypeScript library", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        layers: ["typescript", "publint", "are-the-types-wrong"],
      });
      dirs.push(project.directory);
    });

    it("wires both checks into the build", async () => {
      expect(await read(project, "tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";
        export default defineConfig({ entry: ["./src/index.ts"], plugins: [ember()], attw: { profile: "esm-only" }, publint: true })"
      `);
    });

    it("both checks run and pass in the build", async () => {
      let install = await execa("pnpm install", { cwd: project.directory, shell: true });
      expect(install.exitCode).toBe(0);

      let build = await execa("pnpm build", { cwd: project.directory, shell: true, all: true });
      expect(build.exitCode).toBe(0);

      expect(build.all).toContain("[publint] No issues found");
      expect(build.all).toContain("[attw] No problems found");
    });
  });

  describe("JavaScript library", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        layers: ["publint", "are-the-types-wrong"],
      });
      dirs.push(project.directory);
    });

    it("wires publint only (no declarations to check)", async () => {
      expect(await read(project, "tsdown.config.js")).toMatchInlineSnapshot(`
        "import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";
        export default defineConfig({ entry: ["./src/index.js"], dts: false, plugins: [ember()], publint: true })"
      `);
    });

    it("publint runs and passes in the build", async () => {
      let install = await execa("pnpm install", { cwd: project.directory, shell: true });
      expect(install.exitCode).toBe(0);

      let build = await execa("pnpm build", { cwd: project.directory, shell: true, all: true });
      expect(build.exitCode).toBe(0);

      expect(build.all).toContain("[publint] No issues found");
      expect(build.all).not.toContain("[attw]");
    });
  });
});

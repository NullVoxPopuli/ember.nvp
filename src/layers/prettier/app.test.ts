import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers, reapply } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "prettier")!;

describe.each(["nvp", "default", "ember"])("preset: %s", (preset) => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["prettier", "git"],
      options: { prettier: { preset } },
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("detects the preset", async () => {
    expect(await layer.options?.preset?.detect?.(project)).toBe(preset);
  });

  it("reapplying prettier causes no changes", async () => {
    await reapply(project, ["prettier"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });

  it("formatting and checking works", async () => {
    let install = await project.run("pnpm install");
    hardExpect(install.exitCode).toBe(0);

    {
      let { exitCode } = await project.run("pnpm format");

      expect(exitCode).toBe(0);
    }

    {
      let { exitCode } = await project.run("pnpm lint:prettier");

      expect(exitCode).toBe(0);
    }
  });
});

describe("switching presets: nvp to ember", () => {
  let project: Project;

  beforeAll(async () => {
    let before = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["prettier", "git"],
      options: { prettier: { preset: "nvp" } },
    });

    project = await generate({
      directory: before.directory,
      type: "app",
      packageManager: "pnpm",
      layers: ["prettier", "git"],
      options: { prettier: { preset: "ember" } },
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("replaces the config", async () => {
    let config = await project.read(".prettierrc.js");

    expect(config).toContain("singleQuote: true");
    expect(config).not.toContain("printWidth");
  });

  it("is setup, and detects the new preset", async () => {
    await expectIsSetup(project, layer);
    expect(await layer.options?.preset?.detect?.(project)).toBe("ember");
  });
});

import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers, reapply } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "qunit")!;

describe("starting without qunit", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("applying qunit", async () => {
    await reapply(project, ["qunit"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });
});

describe("starting with qunit", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["qunit", "git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("reapplying causes no changes", async () => {
    await reapply(project, ["qunit"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });
});

describe("package.json scripts", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["eslint-bundled-nvp", "git"],
    });

    let { exitCode } = await project.run("pnpm install");

    hardExpect(exitCode).toBe(0);

    await expectIsSetup(project, layer);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("running tests works", async () => {
    {
      let { exitCode } = await project.run("pnpm test");

      expect(exitCode).toBe(0);
    }
  });
});

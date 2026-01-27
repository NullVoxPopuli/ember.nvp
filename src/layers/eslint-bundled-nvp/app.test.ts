import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers, reapply } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "eslint-bundled-nvp")!;

describe("starting without eslint-bundled-nvp", () => {
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

  it("applying eslint-bundled-nvp", async () => {
    await reapply(project, ["eslint-bundled-nvp"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });
});

describe("starting with eslint-bundled-nvp", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["eslint-bundled-nvp", "git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("reapplying eslint-bundled-nvp causes no changes", async () => {
    await reapply(project, ["eslint-bundled-nvp"]);

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

  it("linting and fixing works", async () => {
    {
      let { exitCode } = await project.run("pnpm lint:eslint --fix");

      expect(exitCode).toBe(0);
    }

    {
      let { exitCode } = await project.run("pnpm lint:eslint");

      expect(exitCode).toBe(0);
    }
  });
});

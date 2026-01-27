import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, layers, reapply } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let githubActionsLayer = layers.find((layer) => layer.name === "github-actions")!;

describe("starting with javascript", () => {
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

  it("applying typescript causes no changes", async () => {
    await reapply(project, ["typescript"]);

    let result = await githubActionsLayer.isSetup(project);

    expect(result).toBe(true);
    expect(await project.gitHasDiff()).toBe(false);
    expect(project.hasFile("tsconfig.json")).toBe(true);
  });
});

describe("starting with typescript", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["typescript", "git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("reapplying typescript causes no changes", async () => {
    await reapply(project, ["typescript"]);

    let result = await githubActionsLayer.isSetup(project);

    expect(result).toBe(true);
    expect(await project.gitHasDiff()).toBe(false);
    expect(project.hasFile("tsconfig.json")).toBe(true);
  });
});

describe("package.json scripts", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["typescript", "git"],
    });

    let { exitCode } = await project.run("pnpm install");

    hardExpect(exitCode).toBe(0);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("type checking works", async () => {
    let { exitCode } = await project.run("pnpm lint:types");

    expect(exitCode).toBe(0);
  });

  it("build works", async () => {
    let { exitCode } = await project.run("pnpm build");

    expect(exitCode).toBe(0);
  });
});

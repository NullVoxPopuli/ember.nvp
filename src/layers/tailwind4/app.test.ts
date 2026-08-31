import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers, reapply } from "#test-helpers";
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "tailwind4")!;

describe("starting without tailwind4", () => {
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

  it("applying tailwind4", async () => {
    await reapply(project, ["tailwind4"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });
});

describe("starting with tailwind4", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["tailwind4", "git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("reapplying causes no changes", async () => {
    await reapply(project, ["tailwind4"]);

    await expectIsSetup(project, layer);
    expect(await project.gitHasDiff()).toBe(false);
  });
});

describe("the build compiles used utilities", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["tailwind4"],
    });

    await writeFile(
      join(project.directory, "app/templates/application.gjs"),
      `<template>
  <h1 class="text-3xl font-bold underline">Welcome to Ember</h1>

  {{outlet}}
</template>
`,
    );
  });

  afterAll(async () => {
    if (process.env.CI) return;

    await rm(project.directory, { recursive: true, force: true });
  });

  it("emits the used utilities in the built CSS", async () => {
    let install = await execa("pnpm install", { cwd: project.directory, shell: true });

    hardExpect(install.exitCode).toBe(0);

    let build = await execa("pnpm build", { cwd: project.directory, shell: true });

    hardExpect(build.exitCode).toBe(0);

    let builtCSS = "";

    for await (let entry of glob("dist/**/*.css", { cwd: project.directory })) {
      builtCSS += await readFile(join(project.directory, entry), "utf-8");
    }

    expect(builtCSS).toContain(".text-3xl");
    expect(builtCSS).toContain(".font-bold");
    // preflight came along, so the import worked, not just the utilities
    expect(builtCSS).toContain("--tw-");
  });
});

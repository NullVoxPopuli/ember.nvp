import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "qunit")!;

/**
 * A library's root tsconfig type-checks both `src` and `tests`, so lint
 * tooling can resolve `tests/*.ts` without a tests-scoped tsconfig. These
 * tests cover that a generated TypeScript library sets up cleanly, a
 * JavaScript one has no tsconfig at all, and the TypeScript library
 * actually passes eslint.
 */

describe("TypeScript library", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "library",
      name: "my-lib",
      layers: ["typescript", "qunit"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("is setup", async () => {
    await expectIsSetup(project, layer);
  });
});

describe("JavaScript library", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "library",
      name: "my-lib",
      layers: ["qunit"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("has no tsconfig", () => {
    expect(project.hasFile("tsconfig.json")).toBe(false);
    expect(project.hasFile("tsconfig.build.json")).toBe(false);
  });

  it("is setup", async () => {
    await expectIsSetup(project, layer);
  });
});

describe("eslint", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "library",
      name: "my-lib",
      packageManager: "pnpm",
      layers: ["typescript", "qunit", "eslint-bundled-nvp"],
    });

    let { exitCode } = await project.run("pnpm install");

    hardExpect(exitCode).toBe(0);
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("lints the tests folder without a project-service error", async () => {
    // Without `tests` in the root tsconfig's include, eslint's TypeScript
    // project service cannot parse tests/*.ts and both of these fail before
    // any rule runs.
    {
      let { exitCode, stderr, stdout } = await project.run("pnpm lint:eslint --fix");

      if (exitCode !== 0) {
        console.log(stderr);
        console.log(stdout);
      }

      expect(exitCode).toBe(0);
    }

    {
      let { exitCode } = await project.run("pnpm lint:eslint");

      expect(exitCode).toBe(0);
    }
  });
});

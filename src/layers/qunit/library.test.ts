import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { expectIsSetup, generate, layers } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let layer = layers.find((layer) => layer.name === "qunit")!;

/**
 * A library's root tsconfig only includes `src` (it is the publish
 * config), so `tests/*.ts` needs its own tsconfig or lint tooling cannot
 * resolve those files. These tests cover that tests tsconfig: it exists
 * for TypeScript libraries, is absent for JavaScript ones, and lets a
 * generated TypeScript library actually pass eslint.
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

  it("writes a tests tsconfig", async () => {
    expect(project.hasFile("tests/tsconfig.json")).toBe(true);

    let contents = JSON.parse((await project.read("tests/tsconfig.json"))!);

    expect(contents.extends).toBe("../tsconfig.json");
    expect(contents.include).toEqual(["."]);
    expect(contents.compilerOptions.rootDir).toBe("..");
    expect(contents.compilerOptions.isolatedDeclarations).toBe(false);
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

  it("does not write a tests tsconfig", () => {
    expect(project.hasFile("tests/tsconfig.json")).toBe(false);
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
    // Without the tests tsconfig, eslint's TypeScript project service
    // cannot parse tests/*.ts and both of these fail before any rule runs.
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

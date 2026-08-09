import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

/**
 * A library splits its TypeScript config: the root tsconfig type-checks
 * `src` and `tests` (used by the editor and eslint) with declaration emit
 * off, and tsconfig.build.json narrows the publish build to `src` with
 * isolated declarations on. tsdown builds with the build config.
 */

describe("TypeScript library", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "library",
      name: "my-lib",
      layers: ["typescript"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("writes both tsconfigs", () => {
    expect(project.hasFile("tsconfig.json")).toBe(true);
    expect(project.hasFile("tsconfig.build.json")).toBe(true);
  });

  it("root tsconfig type-checks src and tests without emitting", async () => {
    let contents = JSON.parse((await project.read("tsconfig.json"))!);

    expect(contents.include).toEqual(["src", "tests"]);
    expect(contents.compilerOptions.declaration).toBe(false);
    expect(contents.compilerOptions.noEmit).toBe(true);
  });

  it("build tsconfig narrows to src with isolated declarations", async () => {
    let contents = JSON.parse((await project.read("tsconfig.build.json"))!);

    expect(contents.extends).toBe("./tsconfig.json");
    expect(contents.include).toEqual(["src"]);
    expect(contents.compilerOptions.rootDir).toBe("./src");
    expect(contents.compilerOptions.isolatedDeclarations).toBe(true);
    expect(contents.compilerOptions.declaration).toBe(true);
    expect(contents.compilerOptions.noEmit).toBe(false);
  });

  it("tsdown builds with the build tsconfig", async () => {
    let contents = (await project.read("tsdown.config.js"))!;

    expect(contents).toContain(`tsconfig: "./tsconfig.build.json"`);
  });
});

describe("JavaScript library", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "library",
      name: "my-lib",
      layers: [],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("has no tsconfigs", () => {
    expect(project.hasFile("tsconfig.json")).toBe(false);
    expect(project.hasFile("tsconfig.build.json")).toBe(false);
  });

  it("tsdown does not reference the build tsconfig", async () => {
    let contents = (await project.read("tsdown.config.js"))!;

    expect(contents).not.toContain("tsconfig.build.json");
    expect(contents).toContain("dts: false");
  });
});

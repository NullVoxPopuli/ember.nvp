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

describe("babel + scripts wiring for runtime macros in tests", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["qunit", "typescript", "git"],
    });
  });

  afterAll(async () => {
    await rm(project.directory, { recursive: true, force: true });
  });

  it("build:test script sets EMBER_ENV=test", async () => {
    let manifest = JSON.parse((await project.read("package.json"))!);

    // Without EMBER_ENV=test, the test build runs the embroider macros plugin
    // in compile-time mode and the setTesting(true) call in tests/test-helper.ts
    // raises a MacroError. The babel config below keys off this env var.
    expect(manifest.scripts["build:test"]).toContain("EMBER_ENV=test");
  });

  it("babel.config.js enables runtime macros mode for EMBER_ENV=test", async () => {
    let content = await project.read("babel.config.js");

    expect(content).toContain("EMBER_ENV");
    expect(content).toContain("enableRuntimeMode");
  });

  it("tests/test-helper.ts performs the test-mode setup (moved out of app/config.ts)", async () => {
    let content = await project.read("tests/test-helper.ts");

    expect(content).toContain("setTesting");
    expect(content).toContain("#ember-testing");
    expect(content).not.toContain("enterTestMode");
  });
});

describe("package.json scripts", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "pnpm",
      layers: ["qunit", "git"],
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
      let { exitCode, stderr, stdout } = await project.run("pnpm test");

      if (exitCode !== 0) {
        console.log(stderr);
        console.log(stdout);
      }

      expect(exitCode).toBe(0);
    }
  });
});

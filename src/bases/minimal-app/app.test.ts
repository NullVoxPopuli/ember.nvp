import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers, build } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

let project: Project;
const expect = hardExpect.soft;

beforeAll(async () => {
  project = await generate({
    type: "app",
    layers: [],
  });

  let { exitCode } = await project.install();

  hardExpect(exitCode, "Install succeeds").toBe(0);
});

afterAll(async () => {
  await rm(project.directory, { recursive: true, force: true });
});

it("build for development (testing, etc)", async () => {
  let { exitCode } = await build(project);

  expect(exitCode).toBe(0);
});

it("build for production", async () => {
  let { exitCode } = await build(project, "production");

  expect(exitCode).toBe(0);
});

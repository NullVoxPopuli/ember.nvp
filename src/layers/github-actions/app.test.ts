import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers, build } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let githubActionsLayer = layers.find((layer) => layer.name === "github-actions");

for (let packageManager of ["pnpm", "npm"] as const) {
  describe(packageManager, () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "app",
        packageManager,
        layers: ["github-actions"],
      });
    });

    afterAll(async () => {
      await rm(project.directory, { recursive: true, force: true });
    });

    it("did not emit a CI.yml, because it wouldn't be used", async () => {
      let result = await githubActionsLayer.isSetup(project);

      expect(result).toBe(false);
    });

    describe("after emitting with an eslint layer", async () => {
      await generate({
        directory: project.directory,
        type: "app",
        packageManager,
        layers: ["eslint-bundled-nvp", "github-actions"],
      });

      let result = await githubActionsLayer.isSetup(project);

      expect(result).toBe(true);
    });
  });
}

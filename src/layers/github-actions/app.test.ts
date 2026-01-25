import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers, build } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rm, readFile } from "node:fs/promises";

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

      expect(await project.read(".github/workflows/ci.yml")).toMatchInlineSnapshot(`undefined`);
      expect(result).toBe(true);
    });

    it("after emitting with an eslint layer", async () => {
      await generate({
        directory: project.directory,
        type: "app",
        packageManager,
        layers: ["eslint-bundled-nvp", "github-actions"],
      });

      let result = await githubActionsLayer.isSetup(project);

      expect(result).toBe(true);
    });

    it("does not have commands for the 'other' packageManager(s)", async () => {
      let ciYamlPath = project.path(".github/workflows/ci.yml");
      let ciYamlContent = await readFile(ciYamlPath, "utf-8");

      if (packageManager === "pnpm") {
        expect(ciYamlContent).not.toContain(" npm install");
        expect(ciYamlContent).toContain("wyvox/action-setup-pnpm");
        expect(ciYamlContent).toContain("pnpm lint");
        expect(ciYamlContent).not.toContain(" npm lint");
      }

      if (packageManager === "npm") {
        expect(ciYamlContent).not.toContain("wyvox/action-setup-pnpm");
        expect(ciYamlContent).toContain(" npm install");
        expect(ciYamlContent).toContain(" npm run lint");
        expect(ciYamlContent).not.toContain("pnpm lint");
      }
    });
  });
}

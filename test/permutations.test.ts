import { beforeAll, describe, it, expect as hardExpect } from "vitest";
import { generate, permutate, bases, layers } from "./test-helpers.js";
import { execa } from "execa";

import type { Project } from "ember.nvp";

const expect = hardExpect.soft;

let permutations = permutate(layers.map((layer) => layer.name));

const baseline = "<baseline>";
permutations.push([baseline]);

const TODO = new Set([
  "eslint",
  "git",
  "qunit",
  "release-plan",
  "renovate [bot]",
  "vitest",
  "prettier",
  "GitHub Actions",
  "typescript",
]);

for (let base of bases) {
  if (base === "minimal-library") {
    /** TODO **/
    continue;
  }

  describe(base, () => {
    for (let permutation of permutations) {
      // Not implemented yet
      if (permutation.some((x) => TODO.has(x))) {
        continue;
      }

      describe(`project starts as '${base}' + ${permutation}`, () => {
        let project: Project;
        let layerNames = permutation.filter((x) => x !== baseline);

        beforeAll(async () => {
          project = await generate({
            type: base === "minimal-app" ? "app" : "library",
            layers: layerNames,
          });

          let { exitCode } = await project.install();

          hardExpect(exitCode, "Install succeeds").toBe(0);
        });

        if (base === "minimal-app") {
          it("builds", async () => {
            let { exitCode } = await execa("pnpm", ["vite", "build"], {
              cwd: project.directory,
            });

            expect(exitCode).toBe(0);
          });
        }

        for (let layer of layers) {
          if (import.meta.vitest) {
            continue;
          }

          it("applies correctly", () => {
            expect(layer.name).toBeTruthy();
          });
        }
      });
    }
  });
}

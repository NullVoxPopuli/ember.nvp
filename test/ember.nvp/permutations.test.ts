import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers } from "#test-helpers";
import { execa } from "execa";

import type { Project } from "ember.nvp";
import { rm } from "node:fs/promises";

const expect = hardExpect.soft;

let permutations = permutate(layers.map((layer) => layer.name));

const baseline = "<baseline>";
permutations.push([baseline]);

const TODO = new Set([
  "qunit",
  "release-plan",
  "renovate",
  "vitest",
  "github-actions",
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

      describe(`layers: ${permutation}`, () => {
        let project: Project;
        let layerNames = permutation.filter((x) => x !== baseline);
        let startingLayers = layers.filter((layer) => layerNames.includes(layer.name));

        beforeAll(async () => {
          project = await generate({
            type: base === "minimal-app" ? "app" : "library",
            layers: layerNames,
          });

          let { exitCode } = await project.install();

          hardExpect(exitCode, "Install succeeds").toBe(0);
        });

        afterAll(async () => {
          await rm(project.directory, { recursive: true, force: true });
        });

        it("builds", async () => {
          let { exitCode } = await execa("pnpm", ["vite", "build"], {
            cwd: project.directory,
          });

          expect(exitCode).toBe(0);
        });

        it("successfully setup the layers", async () => {
          if (startingLayers.length === 0) {
            // TODO: test baseline stuff more?
            expect(true, "No layers to verify").toBe(true);
          }

          for (let layer of startingLayers) {
            expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

            let result = await layer.isSetup(project);

            expect(result, `${layer.name} is setup`).toBe(true);
          }
        });

        /**
         * Simulates running the CLI again with different options selected
         * on the same project
         */
        describe("(re)applying", () => {
          for (let layer of layers) {
            if (TODO.has(layer.name)) {
              continue;
            }

            describe(layer.name, () => {
              beforeAll(async () => {
                await layer.run(project);
              });

              it("applies correctly", async () => {
                expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

                let result = await layer.isSetup(project);

                expect(result, `${layer.name} is setup`).toBe(true);

                return;
              });
            });
          }
        });
      });
    }
  });
}

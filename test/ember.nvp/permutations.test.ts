import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers, reapply } from "#test-helpers";

import type { Project } from "ember.nvp";
import { rimraf, rimrafSync, native, nativeSync } from "rimraf";
import { existsSync } from "node:fs";

const expect = hardExpect.soft;

let permutations = permutate(layers.map((layer) => layer.name));

const baseline = "<baseline>";
permutations.push([baseline]);

const TODO = new Set<string>(["qunit", "release-plan", "vitest", "github-actions"]);
const RE_APPLY_ONLY = new Set<string>([
  // "typescript"
  // "renovate",
]);
const INITIAL_ONLY = new Set<string>([
  // baseline,
  // "typescript"
]);

for (let base of bases) {
  if (base === "minimal-library") {
    /** TODO **/
    continue;
  }

  describe(base, () => {
    for (let permutation of permutations) {
      if (INITIAL_ONLY.size > 0 && !permutation.some((x) => INITIAL_ONLY.has(x))) {
        continue;
      }

      // Not implemented yet
      if (permutation.some((x) => TODO.has(x))) {
        continue;
      }

      describe.sequential(`layers: ${permutation}`, () => {
        let project: Project;
        let layerNames = permutation.filter((x) => x !== baseline);
        let startingLayers = layers.filter((layer) => layerNames.includes(layer.name));

        beforeAll(async () => {
          project = await generate({
            type: base === "minimal-app" ? "app" : "library",
            layers: layerNames,
          });
        });

        afterAll(async () => {
          if (process.env.CI) {
            return;
          }

          if (project?.directory) {
            await rimraf(project.directory, { maxRetries: 3, retryDelay: 100 });
          }
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
         * Are these valuable? no one would invoke the layers like this
         */
        describe.skip("(re)applying", () => {
          for (let layer of layers) {
            if (RE_APPLY_ONLY.size > 0 && !RE_APPLY_ONLY.has(layer.name)) {
              continue;
            }

            if (TODO.has(layer.name)) {
              continue;
            }

            describe(layer.name, () => {
              let expected = startingLayers.find((l) => l.name === layer.name);

              beforeAll(async () => {
                await layer.run(project);
              });

              if (expected) {
                it("is applied", async () => {
                  expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

                  let result = await layer.isSetup(project, true);

                  if (typeof result === "object") {
                    expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
                    expect(result.isSetup, `${layer.name} is setup`).toBe(true);
                    return;
                  }

                  expect(result, `${layer.name} is setup`).toBe(true);

                  return;
                });
              } else {
                it("is not applied", async () => {
                  expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

                  let result = await layer.isSetup(project, true);

                  if (typeof result === "object") {
                    expect(result.isSetup, `${layer.name} is not setup`).toBe(false);
                    hardExpect(result.reasons.length, `${layer.name} is not setup`).toBeGreaterThan(
                      0,
                    );
                    return;
                  }

                  expect(result, `${layer.name} is not setup`).toBe(false);
                });
              }
            });
          }
        });

        /**
         * Simulates running the CLI again with different options selected
         * on the same project
         */
        describe("apply anew", () => {
          for (let layer of layers) {
            if (RE_APPLY_ONLY.size > 0 && !RE_APPLY_ONLY.has(layer.name)) {
              continue;
            }

            if (TODO.has(layer.name)) {
              continue;
            }

            describe(layer.name, () => {
              beforeAll(async () => {
                await reapply(project, [layer.name]);
              });

              it("is applied", async () => {
                expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

                let result = await layer.isSetup(project, true);

                if (typeof result === "object") {
                  expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
                  expect(result.isSetup, `${layer.name} is setup`).toBe(true);
                  return;
                }

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

import { beforeAll, describe, it, expect as hardExpect, afterAll } from "vitest";
import { generate, permutate, bases, layers, reapply } from "#test-helpers";
import { TODO } from "#layers";

import type { Project } from "ember.nvp";
import { rimraf } from "rimraf";

const expect = hardExpect.soft;

let permutations = permutate(layers.map((layer) => layer.name));

const baseline = "<baseline>";
permutations.push([baseline]);

const RE_APPLY_ONLY = new Set<string>([
  // "typescript"
  // "renovate",
  "github-actions",
]);
const INITIAL_ONLY = new Set<string>([
  // baseline,
  "eslint-bundled-nvp",
  // "typescript"
]);

const eachBase = bases.map((base) => ({ name: base }));
const eachPermutation = permutations
  .filter((permutation) => {
    if (INITIAL_ONLY.size > 0 && !permutation.some((x) => INITIAL_ONLY.has(x))) {
      return;
    }

    // Not implemented yet
    if (permutation.some((x) => TODO.has(x))) {
      return;
    }

    return true;
  })
  .map((permutation) => ({ permutation, name: permutation.join(", ") }));

describe.each(eachBase)("$name", ({ name: base }) => {
  if (base === "minimal-library") {
    /** TODO **/
    return;
  }

  describe.each(eachPermutation)("layers: $name", ({ permutation }) => {
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
    // describe.skip("(re)applying", () => {
    //   for (let layer of layers) {
    //     if (RE_APPLY_ONLY.size > 0 && !RE_APPLY_ONLY.has(layer.name)) {
    //       continue;
    //     }

    //     if (TODO.has(layer.name)) {
    //       continue;
    //     }

    //     describe(layer.name, () => {
    //       let expected = startingLayers.find((l) => l.name === layer.name);

    //       beforeAll(async () => {
    //         await layer.run(project);
    //       });

    //       if (expected) {
    //         it("is applied", async () => {
    //           expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

    //           let result = await layer.isSetup(project, true);

    //           if (typeof result === "object") {
    //             expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
    //             expect(result.isSetup, `${layer.name} is setup`).toBe(true);
    //             return;
    //           }

    //           expect(result, `${layer.name} is setup`).toBe(true);

    //           return;
    //         });
    //       } else {
    //         it("is not applied", async () => {
    //           expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

    //           let result = await layer.isSetup(project, true);

    //           if (typeof result === "object") {
    //             expect(result.isSetup, `${layer.name} is not setup`).toBe(false);
    //             hardExpect(result.reasons.length, `${layer.name} is not setup`).toBeGreaterThan(0);
    //             return;
    //           }

    //           expect(result, `${layer.name} is not setup`).toBe(false);
    //         });
    //       }
    //     });
    //   }
    // });

    /**
     * Simulates running the CLI again with different options selected
     * on the same project
     */
    describe.concurrent("apply anew", () => {
      let newLayers = layers
        .filter((layer) => {
          if (RE_APPLY_ONLY.size > 0 && !RE_APPLY_ONLY.has(layer.name)) {
            return false;
          }

          if (TODO.has(layer.name)) {
            return false;
          }

          return true;
        })
        .map((layer) => ({ name: layer.name, layer }));

      describe.concurrent.each(newLayers)("$name", ({ layer }) => {
        beforeAll(async () => {
          await reapply(project, [layer.name]);
        });

        describe("checking prior layers still present", () => {
          it.for(startingLayers)("$name", async (layer) => {
            expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

            let result = await layer.isSetup(project, true);

            if (typeof result === "object") {
              expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
              expect(result.isSetup, `${layer.name} is setup`).toBe(true);
              return;
            }

            expect(result, `${layer.name} is setup`).toBe(true);
          });
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
    });
  });
});

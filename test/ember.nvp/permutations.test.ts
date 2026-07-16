import { beforeAll, describe, it, expect, afterAll } from "vitest";
import { generate, permutate, bases, layers, reapply } from "#test-helpers";
import { TODO } from "#layers";

import { rm } from "node:fs/promises";

import type { Project } from "ember.nvp";
import type { ProjectType } from "#types";

const baseline = "<baseline>";

const RE_APPLY_ONLY = new Set<string>([
  // "typescript"
  // "renovate",
  // "github-actions",
]);
const INITIAL_ONLY = new Set<string>([
  // baseline,
  // "eslint-bundled-nvp",
  // "typescript"
]);

/**
 * Layers that don't yet generate a working setup for a project type.
 * Every layer is *supposed* to support every base eventually -- shrink
 * these as layers learn.
 */
const NOT_YET_SUPPORTED: Record<ProjectType, Set<string>> = {
  app: new Set(),
  // qunit's scripts assume an app (vite build + testem against index.html)
  library: new Set(["qunit"]),
};

const eachBase = bases.map((base) => {
  const type: ProjectType = base === "minimal-app" ? "app" : "library";

  const applicableLayers = layers.filter((layer) => !NOT_YET_SUPPORTED[type].has(layer.name));

  const permutations = permutate(applicableLayers.map((layer) => layer.name));
  permutations.push([baseline]);

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

  return { name: base, type, applicableLayers, eachPermutation };
});

describe.each(eachBase)("$name", ({ type, applicableLayers, eachPermutation }) => {
  describe.each(eachPermutation)("layers: $name", ({ permutation }) => {
    let project: Project;
    let layerNames = permutation.filter((x) => x !== baseline);
    let startingLayers = layers.filter((layer) => layerNames.includes(layer.name));

    beforeAll(async () => {
      project = await generate({
        type,
        layers: layerNames,
      });
    });

    afterAll(async () => {
      if (process.env.CI) {
        return;
      }

      if (project?.directory) {
        await rm(project.directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
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
    describe("apply anew", () => {
      let newLayers = applicableLayers
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

      describe.each(newLayers)("$name", ({ layer }) => {
        beforeAll(async () => {
          // Simulate running the CLI again, adding one more option while
          // keeping the previously-selected layers.
          await reapply(project, [...new Set([...layerNames, layer.name])]);
        });

        it.for(startingLayers)("starting layers still present: $name", async (layer) => {
          expect(layer.isSetup, `has isSetup for ${layer.name}`).toBeInstanceOf(Function);

          let result = await layer.isSetup(project, true);

          if (typeof result === "object") {
            expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
            expect(result.isSetup, `${layer.name} is setup`).toBe(true);
            return;
          }

          expect(result, `${layer.name} is setup`).toBe(true);
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

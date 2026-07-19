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
  // publish checks: apps aren't published
  app: new Set(["publint", "are-the-types-wrong"]),
  // libraries have no Application to wire inspector support into
  library: new Set(["inspector-support"]),
  // publish checks: extensions aren't published (to npm)
  extension: new Set(["publint", "are-the-types-wrong"]),
};

const TYPE_FOR_BASE: Record<(typeof bases)[number], ProjectType> = {
  "minimal-app": "app",
  "minimal-library": "library",
  "minimal-extension": "extension",
};

/**
 * Layers that only add lint / format / publish checks. They don't affect
 * the runtime shape of a project, so they permutate among themselves in a
 * small "checks" matrix instead of multiplying the main one. ("apply anew"
 * still applies each of them on top of every main permutation, so linear
 * cross-group coverage remains.)
 */
const CHECK_LAYERS = new Set<string>([
  "eslint-bundled-ember",
  "eslint-bundled-nvp",
  "eslint-ejected",
  "prettier",
  "publint",
  "are-the-types-wrong",
]);

type PermutationGroup = "main" | "checks";

const eachBase = bases.map((base) => {
  const type = TYPE_FOR_BASE[base]!;

  const applicableLayers = layers.filter((layer) => !NOT_YET_SUPPORTED[type].has(layer.name));

  const toPermutations = (layerNames: string[], withBaseline: boolean) => {
    const permutations = permutate(layerNames);

    if (withBaseline) {
      permutations.push([baseline]);
    }

    return permutations
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
  };

  const applicableNames = applicableLayers.map((layer) => layer.name);
  const eachPermutation: Record<PermutationGroup, ReturnType<typeof toPermutations>> = {
    main: toPermutations(
      applicableNames.filter((name) => !CHECK_LAYERS.has(name)),
      true,
    ),
    checks: toPermutations(
      applicableNames.filter((name) => CHECK_LAYERS.has(name)),
      false,
    ),
  };

  return { name: base, type, applicableLayers, eachPermutation };
});

/**
 * The permutation matrix grows exponentially with the layer count, so
 * each base runs from its own test file(s) -- CI runs them as separate,
 * parallel jobs. A base whose matrix outgrows one job's budget runs from
 * several files, each taking a deterministic 1-of-N slice. The "checks"
 * group (CHECK_LAYERS) runs from its own file(s) the same way.
 *
 * @param base which base's permutations this file runs
 * @param options.index / options.total which 1-of-N slice of the permutations this file runs
 * @param options.group which permutation group this file runs
 */
export function testPermutations(
  base: (typeof bases)[number],
  {
    index = 0,
    total = 1,
    group = "main",
  }: { index?: number; total?: number; group?: PermutationGroup } = {},
) {
  const {
    type,
    applicableLayers,
    eachPermutation: allPermutations,
  } = eachBase.find((b) => b.name === base)!;

  const eachPermutation = allPermutations[group].filter((_, i) => i % total === index);

  describe(base, () => {
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
}

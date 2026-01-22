import { describe, it, expect as hardExpect } from "vitest";
import { discoverLayers } from "#layers";
import { permutate, bases } from "./test-helpers.js";

const expect = hardExpect.soft;

const layers = await discoverLayers();

let permutations = permutate(layers.map((layer) => layer.name));

describe("project type", () => {
  for (let base of bases) {
    describe(base, () => {
      for (let permutation of permutations) {
        describe(`project starts as '${base}' + ${permutation}`, () => {
          for (let permutation of permutations) {
            it(`applies ${permutation}`, async () => {
              expect(2).toBe(2);
            });
          }
        });
      }
    });
  }
});

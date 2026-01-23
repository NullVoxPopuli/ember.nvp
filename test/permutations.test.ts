import { beforeAll, describe, it, expect as hardExpect } from "vitest";
import { generate, permutate, bases, layers } from "./test-helpers.js";
import { execa } from "execa";

import type { Project } from "ember.nvp";

const expect = hardExpect.soft;

let permutations = permutate(layers.map((layer) => layer.name));

describe("project type", () => {
  for (let base of bases) {
    describe(base, () => {
      for (let permutation of permutations) {
        describe(`project starts as '${base}' + ${permutation}`, () => {
          for (let layer of layers) {
            // Not ready yet
            if (layer.name.startsWith("vitest")) continue;
            if (layer.name.startsWith("warp-drive")) continue;

            describe(base, () => {
              let project: Project;

              beforeAll(async () => {
                project = await generate({
                  type: base === "minimal-app" ? "app" : "library",
                  layers: permutation,
                });
              });

              if (base === "minimal-app") {
                it("builds", async () => {
                  let { exitCode } = await execa("pnpm", ["vite", "build"], {
                    cwd: project.directory,
                  });

                  expect(exitCode).toBe(0);
                });
              }
            });
          }
        });
      }
    });
  }
});

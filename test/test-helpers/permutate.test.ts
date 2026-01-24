import { describe, it, expect } from "vitest";
import { permutate } from "#test-helpers";

describe("permutate", () => {
  it("generates all permutations", () => {
    const result = permutate(["a", "b", "c"]);

    expect(result).toEqual([
      ["a"],
      ["a", "b"],
      ["a", "b", "c"],
      ["a", "c"],
      ["b"],
      ["b", "c"],
      ["c"],
    ]);
  });

  it("skips duplicate entries", () => {
    const result = permutate(["a", "b", "b"]);

    // Should not include ["a", "b"] twice
    const count = result.filter((perm) => perm.join(",") === "a,b").length;
    expect(count).toBe(1);
  });

  it("enforces mutual exclusivity for eslint-prefixed entries", () => {
    const result = permutate([
      "eslint-bundled-ember",
      "eslint-bundled-nvp",
      "eslint-ejected",
      "other",
    ]);

    // Check that no permutation has more than one eslint-prefixed entry
    for (const permutation of result) {
      const eslintCount = permutation.filter((item) =>
        item.startsWith("eslint-")
      ).length;
      expect(eslintCount).toBeLessThanOrEqual(1);
    }
  });

  it("allows permutations with 0 or 1 eslint entry", () => {
    const result = permutate([
      "eslint-bundled-ember",
      "eslint-bundled-nvp",
      "other",
    ]);

    const hasNoEslint = result.some(
      (perm) => !perm.some((item) => item.startsWith("eslint-"))
    );
    const hasOneEslint = result.some(
      (perm) =>
        perm.filter((item) => item.startsWith("eslint-")).length === 1
    );

    expect(hasNoEslint).toBe(true);
    expect(hasOneEslint).toBe(true);
  });

  it("generates valid permutations with mixed items", () => {
    const result = permutate(["a", "eslint-foo", "eslint-bar", "b"]);

    // Verify all permutations contain at most 1 eslint entry
    for (const permutation of result) {
      const eslintCount = permutation.filter((item) =>
        item.startsWith("eslint-")
      ).length;
      expect(eslintCount).toBeLessThanOrEqual(1);
    }

    // Should have permutations like: ["a"], ["a", "eslint-foo"], ["a", "b"], etc.
    // but NOT ["a", "eslint-foo", "eslint-bar"]
    const hasMultipleEslint = result.some(
      (perm) =>
        perm.filter((item) => item.startsWith("eslint-")).length > 1
    );
    expect(hasMultipleEslint).toBe(false);
  });
});

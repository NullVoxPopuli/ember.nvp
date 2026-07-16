import { describe, test, expect } from "vitest";

import { add } from "../../src/utils/math.ts";

describe("add", () => {
  test("sums two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});

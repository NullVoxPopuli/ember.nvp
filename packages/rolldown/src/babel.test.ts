import { describe, expect, it } from "vitest";

import { emberBabel } from "./babel.ts";

describe("emberBabel", () => {
  it("rejects templateTransforms combined with a config file", () => {
    expect(() =>
      emberBabel({ configFile: "./babel.config.js", templateTransforms: ["some-transform"] }),
    ).toThrow(/pass the transforms/);
  });

  it("allows templateTransforms when config files are opted out", () => {
    expect(() =>
      emberBabel({ configFile: false, templateTransforms: ["some-transform"] }),
    ).not.toThrow();
  });
});

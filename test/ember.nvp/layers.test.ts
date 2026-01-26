import { describe, it, expect } from "vitest";
import { discoverLayers } from "#layers";

const layers = await discoverLayers();

describe("discoverLayers", () => {
  it("includes expected layer names", async () => {
    const layers = await discoverLayers();
    const layerNames = layers.map((layer) => layer.name);

    expect(layerNames).toMatchInlineSnapshot(`
      [
        "eslint-bundled-ember",
        "eslint-bundled-nvp",
        "git",
        "github-actions",
        "prettier",
        "renovate",
        "typescript",
      ]
    `);
  });

  describe("each layer has minimum API", () => {
    for (let layer of layers) {
      it(layer.name, () => {
        const keys = Object.keys(layer);
        expect(keys).toContain("name");
        expect(keys).toContain("label");
        expect(keys).toContain("run");
      });
    }
  });
});

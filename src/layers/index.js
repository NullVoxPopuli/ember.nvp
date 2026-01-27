import { readdir } from "node:fs/promises";
import { join } from "node:path";

const TODO = new Set(["qunit", "vitest", "release-plan", "eslint-ejected"]);

/**
 * @returns {Promise<Array<import('#types').DiscoveredLayer>>}
 */
export async function discoverLayers() {
  const layersDir = import.meta.dirname;
  const entries = await readdir(layersDir, { withFileTypes: true });

  const layers = [];

  for (const entry of entries) {
    if (TODO.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      const layerPath = join(layersDir, entry.name, "index.js");
      try {
        const layer = await import(layerPath);
        layers.push({
          name: entry.name,
          ...layer.default,
        });
      } catch (error) {
        if (typeof error !== "object" || error === null) {
          console.warn(`Warning: Could not load layer ${entry.name}:`, error);
          continue;
        }
        if ("message" in error) {
          console.warn(`Warning: Could not load layer ${entry.name}:`, error.message);
        }
      }
    }
  }

  return layers;
}

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";
import { answers } from "#args";

import * as p from "@clack/prompts";

export async function askLayers() {
  const layers = await discoverLayers();

  // Separate minimal from other layers
  const minimalLayer = layers.find((l) => l.name === "minimal");
  const optionalLayers = layers.filter((l) => l.name !== "minimal");

  p.note(
    `${styleText("cyan", "minimal")} layer is always included.\n` +
      'It provides: vite app, type: "module", no compat, no testing, no linting.\n' +
      "Perfect for demos and reproductions.",
    "Base Layer",
  );

  const supported = new Set(optionalLayers.map((layer) => layer.name));

  function isValid(selected) {
    if (!selected) return false;
    if (Array.isArray(selected) && selected.length === 0) return false;

    return selected.every((name) => supported.has(name));
  }

  if (isValid(answers.layers)) {
    return optionalLayers.filter((layer) => answers.layers.includes(layer.name));
  }

  // Let user select additional features
  const selectedFeatures = await p.multiselect({
    message: "Select additional features:",
    options: optionalLayers.map((layer) => ({
      value: layer.name,
      label: layer.label || layer.name,
      hint: layer.description,
    })),
    required: false,
  });

  if (p.isCancel(selectedFeatures)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  // Build the final configuration
  const selectedLayers = [
    minimalLayer,
    ...optionalLayers.filter((layer) => selectedFeatures.includes(layer.name)),
  ].filter(Boolean);

  return selectedLayers;
}

async function discoverLayers() {
  const layersDir = join(import.meta.dirname, "..", "..", "layers");
  const entries = await readdir(layersDir, { withFileTypes: true });

  const layers = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const layerPath = join(layersDir, entry.name, "index.js");
      try {
        const layer = await import(layerPath);
        layers.push({
          name: entry.name,
          ...layer.default,
        });
      } catch (err) {
        // Skip layers that don't have proper exports
        console.warn(`Warning: Could not load layer ${entry.name}:`, err.message);
      }
    }
  }

  return layers;
}

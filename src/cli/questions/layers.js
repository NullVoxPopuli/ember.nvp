import { readdir } from "node:fs/promises";
import { join } from "node:path";

import * as p from "@clack/prompts";

export async function askLayers() {

  // Discover available layers
  const layers = await discoverLayers();

  // Separate minimal from other layers
  const minimalLayer = layers.find((l) => l.name === "minimal");
  const optionalLayers = layers.filter((l) => l.name !== "minimal");

  p.note(
    `${pc.cyan("minimal")} layer is always included.\n` +
    'It provides: type: "module", no compat, no testing, no linting.\n' +
    "Perfect for demos and reproductions.",
    "Base Layer",
  );

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
    ...optionalLayers.filter((l) => selectedFeatures.includes(l.name)),
  ].filter(Boolean);

  return selectedLayers;

}

async function discoverLayers() {
  const layersDir = join(import.meta.dirname, '..', "..", "layers");
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
        console.warn(
          `Warning: Could not load layer ${entry.name}:`,
          err.message,
        );
      }
    }
  }

  return layers;
}


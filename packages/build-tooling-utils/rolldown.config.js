import { defineConfig } from "rolldown";

import manifest from "./package.json" with { type: "json" };

const deps = Object.keys(manifest.dependencies || {});

export default defineConfig({
  input: "index.ts",
  output: {
    format: "esm",
    file: "dist/index.js",
    codeSplitting: false,
  },
  external(id) {
    if (id.startsWith("node:")) return true;
    if (deps.some((dep) => id.startsWith(dep))) return true;
  },
});

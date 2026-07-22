import { defineConfig } from "rolldown";

import manifest from "./package.json" with { type: "json" };

const deps = [
  ...Object.keys(manifest.dependencies || {}),
  ...Object.keys(manifest.peerDependencies || {}),
];

export default defineConfig({
  input: {
    index: "index.ts",
    "app-reexports": "src/app-reexports.ts",
  },
  output: {
    format: "esm",
    dir: "dist",
  },
  external(id) {
    if (id.startsWith("node:")) return true;
    if (deps.some((dep) => id.startsWith(dep))) return true;
  },
});

import { ember } from "@nullvoxpopuli/ember-rolldown";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  sourcemap: true,
  clean: true,
  dts: true,
  // tsdown emits .mjs/.d.mts by default (even in type-module packages);
  // package.json's exports map points at .js/.d.ts
  outExtensions() {
    return { js: ".js", dts: ".d.ts" };
  },
  // These are provided by the consuming app, so never pull them into the bundle.
  neverBundle: ["node:*", "@ember/*", "@glimmer/*"],
  plugins: [ember()],
});

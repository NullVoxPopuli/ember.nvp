import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "iife"],
  globalName: "MinimalWidget",
  minify: true,
  plugins: [ember({ bundle: true })],
});

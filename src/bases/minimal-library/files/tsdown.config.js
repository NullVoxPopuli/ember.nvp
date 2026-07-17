import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  plugins: [ember()],
});

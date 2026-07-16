import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  plugins: [ember()],
});

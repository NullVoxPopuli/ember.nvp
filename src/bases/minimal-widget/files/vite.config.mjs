import { defineConfig } from "vite";
import { ember } from "@nullvoxpopuli/ember-vite";

/**
 * Vite runs the development server (`pnpm dev`), which serves index.html.
 *
 * It does not build the package: tsdown does (tsdown.config.js).
 */
export default defineConfig({
  plugins: [ember()],
});

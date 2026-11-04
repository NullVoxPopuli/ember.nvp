import { defineConfig } from "vite";
import { ember } from "@nullvoxpopuli/ember-vite";

export default defineConfig({
  plugins: [ember()],
  /**
   * `start` serves the build in `dist`, so run `build` first.
   */
  preview: { port: Number(process.env.PORT ?? 4200) },
});

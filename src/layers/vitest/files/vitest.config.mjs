import { defineConfig } from "vitest/config";
import { extensions, ember } from "@embroider/vite";
import { babel } from "@rollup/plugin-babel";

export default defineConfig({
  plugins: [
    ember(),
    babel({
      babelHelpers: "runtime",
      extensions: extensions.flatMap((extension) => [extension, ".gts", ".gjs"]),
    }),
  ],
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/test-helper.ts"],
    include: ["tests/**/*-test.{js,ts,gjs,gts}"],
  },
});

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["test/**/*.test.ts", "src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    // Templates copied into generated projects, which run their own tests
    exclude: configDefaults.exclude.concat([
      "src/**/layers/*/files/**",
      "src/**/layers/*/library-files/**",
      "src/**/bases/*/files/**",
    ]),
  },
});

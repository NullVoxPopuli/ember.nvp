import type { UserConfig } from "tsdown";

/**
 * tsdown's config, set up for an Ember v2 library: builds your entry to
 * `dist/*.js` and `dist/*.d.ts` with sourcemaps, cleaning `dist/` between
 * builds and leaving the ember virtual packages to the consuming app.
 *
 * You choose the `entry` and the `plugins` (e.g. `ember()`); any tsdown
 * option you pass wins.
 *
 * ```js
 * import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";
 *
 * export default defineConfig({
 *   entry: ["./src/index.ts"],
 *   plugins: [ember()],
 * });
 * ```
 */
export function defineConfig(config: UserConfig): UserConfig {
  return {
    sourcemap: true,
    clean: true,
    dts: true,
    // tsdown's extensions are .mjs/.d.mts otherwise, even in type-module
    // packages; exports maps conventionally point at .js/.d.ts
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    // provided by the consuming app
    neverBundle: ["node:*", "@ember/*", "@glimmer/*"],
    ...config,
  };
}

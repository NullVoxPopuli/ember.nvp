import type { UserConfig } from "tsdown";

/**
 * A tiny typed passthrough for your tsdown config. The Ember-specific defaults
 * (sourcemaps, `clean`, `dts`, `.js`/`.d.ts` extensions, externals, quiet
 * logging) now live on the `ember()` meta-plugin's `emberConfig()` step, so
 * they apply as long as `ember()` is in `plugins` — whether you use this
 * helper, tsdown's `defineConfig`, or none at all.
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
  return config;
}

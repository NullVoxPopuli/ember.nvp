import type { UserConfig } from "tsdown";

/**
 * tsdown's `defineConfig`, preloaded with the settings every Ember v2
 * library wants:
 *
 * - `dts: true`, `sourcemap: true`, `clean: true`
 * - `outExtensions` pinning `.js`/`.d.ts`: tsdown emits `.mjs`/`.d.mts` by
 *   default (even in type-module packages), and the exports map points at
 *   `.js`/`.d.ts`.
 * - `neverBundle` for the ember virtual packages, which the consuming app
 *   provides.
 *
 * You still choose the `entry` and the `plugins` (e.g. `ember()`), and
 * anything you pass overrides the defaults.
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
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    neverBundle: ["node:*", "@ember/*", "@glimmer/*"],
    ...config,
  };
}

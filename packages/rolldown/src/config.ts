import type { TsdownPlugin, UserConfig } from "tsdown";

/**
 * Sensible tsdown defaults for an Ember v2 library, applied via tsdown's
 * `tsdownConfig` hook (analogous to Vite's `config` hook). Because these live
 * on a plugin returned by `ember()`, they travel with the meta-plugin — you
 * get them whether you use this package's `defineConfig`, tsdown's, or a plain
 * `tsdown.config.js`.
 *
 * Every value is applied with `??=`, so anything you set explicitly wins.
 *
 * - `sourcemap` — emit sourcemaps alongside the output.
 * - `clean` — wipe `dist/` between builds.
 * - `dts` — emit `.d.ts` declarations (via isolated declarations).
 * - `outExtensions` — `.js`/`.d.ts` rather than tsdown's default `.mjs`/`.d.mts`,
 *   since exports maps conventionally point at `.js`/`.d.ts`.
 * - `report` — off; the size report is noise for a library build.
 * - `logLevel` — `warn`, to keep the build output quiet.
 * - `deps.neverBundle` — leave node builtins and the ember virtual packages to
 *   the consuming app (`emberExternals()` handles the rest).
 *
 * This hook only runs under tsdown; a plain `rolldown.config.js` build ignores
 * it (rolldown doesn't know about tsdown-level options).
 */
export function emberConfig(): TsdownPlugin {
  return {
    name: "ember:config",

    tsdownConfig(config: UserConfig) {
      config.sourcemap ??= true;
      config.clean ??= true;
      config.dts ??= true;
      config.outExtensions ??= () => ({ js: ".js", dts: ".d.ts" });
      config.report ??= false;
      config.logLevel ??= "warn";

      config.deps ??= {};
      config.deps.neverBundle ??= ["node:*", "@ember/*", "@glimmer/*"];
    },
  };
}

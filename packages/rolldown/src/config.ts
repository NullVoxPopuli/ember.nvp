import type { TsdownPlugin, UserConfig } from "tsdown";

/**
 * Sensible defaults for an Ember v2 library, applied through plugin hooks so
 * they travel with `ember()` — you get them whether you use this package's
 * `defineConfig`, tsdown's, or a plain `tsdown.config.js` / `rolldown.config.js`.
 *
 * Every value is applied with `??=`, so anything you set explicitly wins.
 *
 * Under tsdown, the full set applies via the `tsdownConfig` hook (analogous to
 * Vite's `config` hook):
 *
 * - `sourcemap` — emit sourcemaps alongside the output.
 * - `clean` — wipe `dist/` between builds.
 * - `dts` — emit `.d.ts` declarations (via isolated declarations).
 * - `outExtensions` — `.js`/`.d.ts` rather than tsdown's default `.mjs`/`.d.mts`,
 *   since exports maps conventionally point at `.js`/`.d.ts`.
 * - `report` — off; the size report is noise for a library build.
 * - `deps.neverBundle` — leave node builtins and the ember virtual packages to
 *   the consuming app (`emberExternals()` handles the rest).
 *
 * A plain rolldown build has no notion of `clean`/`dts`/`outExtensions`/`report`
 * (those are tsdown-level concepts), so only the options with rolldown
 * equivalents are applied there, via rolldown's own `outputOptions` hook:
 *
 * - `output.sourcemap` — on (output option).
 *
 * One default applies through rolldown's `options` hook, so it holds under
 * both tools:
 *
 * - `optimization.inlineConst` — off. Rolldown's default (`mode: "smart"`)
 *   substitutes an imported constant's literal wherever that makes the code
 *   shorter — including into `precompileTemplate` scope objects, turning
 *   `scope: () => ({ EMPTY })` into `scope: () => ({ EMPTY: "—" })`. Scope
 *   entries must be direct references to in-scope values, so the consuming
 *   app's template compiler rejects the published module. Nothing before that
 *   compile catches it: the library builds, type-checks, and lints clean.
 *
 * Externals are handled by `emberExternals()` (a `resolveId` hook) in both cases.
 */
export function emberConfig(): TsdownPlugin {
  return {
    name: "ember:config",

    tsdownConfig(config: UserConfig) {
      config.sourcemap ??= true;
      config.clean ??= true;
      config.dts ??= { sourcemap: true };
      config.outExtensions ??= () => ({ js: ".js", dts: ".d.ts" });
      config.report ??= false;

      config.deps ??= {};
      config.deps.neverBundle ??= ["node:*", "@ember/*", "@glimmer/*"];
    },

    options(options) {
      options.optimization ??= {};
      options.optimization.inlineConst ??= false;
      return options;
    },

    outputOptions(options) {
      options.sourcemap ??= true;
      return options;
    },
  };
}

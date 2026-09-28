import type { TsdownPlugin, UserConfig } from "tsdown";

/**
 * Sensible defaults for an Ember v2 library.
 *
 * Applied through plugin hooks, so they travel with `ember()`.
 * You get them whether you use this package's `defineConfig`, tsdown's,
 * or a plain `tsdown.config.js` / `rolldown.config.js`.
 *
 * Every value is applied with `??=`, so anything you set explicitly wins.
 *
 * Under tsdown, the full set applies via the `tsdownConfig` hook
 * (analogous to Vite's `config` hook):
 *
 * - `sourcemap` — emit sourcemaps alongside the output
 * - `clean` — wipe `dist/` between builds
 * - `dts` — emit `.d.ts` declarations (via isolated declarations)
 * - `outExtensions` — `.js` / `.d.ts` rather than tsdown's default `.mjs` / `.d.mts`
 *   (exports maps conventionally point at `.js` / `.d.ts`)
 * - `report` — off.
 *   The size report is noise for a library build.
 * - `deps.neverBundle` — leave node builtins and the ember virtual packages
 *   to the consuming app (`emberExternals()` handles the rest)
 *
 * A plain rolldown build has no notion of `clean` / `dts` / `outExtensions` / `report`.
 * Those are tsdown-level concepts.
 * So only the options with rolldown equivalents are applied there,
 * via rolldown's own `outputOptions` hook:
 *
 * - `output.sourcemap` — on
 *
 * Externals are handled by `emberExternals()` (a `resolveId` hook) in both cases.
 *
 * Bundle mode flips the dependency defaults.
 * The output is a self-contained browser artifact, so:
 *
 * - `platform` — `browser`
 * - `deps.alwaysBundle` — everything but node builtins
 *   (including the package's own `dependencies` and `peerDependencies`,
 *    and the declarations' type imports)
 * - `deps.neverBundle` — node builtins only
 * - `deps.onlyBundle` — `false`
 *   (bundling node_modules is the point, so tsdown's hint about it is noise)
 */
export function emberConfig({ bundle = false }: { bundle?: boolean } = {}): TsdownPlugin {
  return {
    name: "ember:config",

    tsdownConfig(config: UserConfig) {
      config.sourcemap ??= true;
      config.clean ??= true;
      config.dts ??= { sourcemap: true };
      config.outExtensions ??= () => ({ js: ".js", dts: ".d.ts" });
      config.report ??= false;

      config.deps ??= {};

      if (bundle) {
        config.platform ??= "browser";
        config.deps.alwaysBundle ??= (id) => !id.startsWith("node:");
        config.deps.neverBundle ??= ["node:*"];
        config.deps.onlyBundle ??= false;
        return;
      }

      config.deps.neverBundle ??= ["node:*", "@ember/*", "@glimmer/*"];
    },

    outputOptions(options) {
      options.sourcemap ??= true;
      return options;
    },
  };
}

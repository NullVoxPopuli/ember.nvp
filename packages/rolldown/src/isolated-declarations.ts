import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { Plugin } from "rolldown";
import type { UserConfig } from "tsdown";

/**
 * Resolve the tsconfig the build will actually use, mirroring tsdown's own
 * `tsconfig` option (`string | boolean`):
 *
 * - `undefined` / `true`: `tsconfig.json` in the cwd.
 * - a path to a file: that file.
 * - a path to a directory: `tsconfig.json` inside it.
 * - `false`: no tsconfig at all.
 *
 * Under plain rolldown there is no such option, so the cwd's `tsconfig.json`
 * is all there is.
 */
function resolveTsconfigPath(option: string | boolean | undefined): string | undefined {
  if (option === false) return undefined;

  if (typeof option === "string") {
    const asPath = resolve(option);

    if (existsSync(asPath) && statSync(asPath).isDirectory()) {
      return resolve(asPath, "tsconfig.json");
    }

    return asPath;
  }

  return resolve("tsconfig.json");
}

/**
 * Errors the build when the tsconfig it builds with does not set
 * `isolatedDeclarations: true`.
 *
 * This is required: declarations for `.gts`/`.gjs` (template tag) modules can
 * only be emitted by the isolated-declarations pipeline, which reads compiled
 * modules from the bundler's module graph. The `tsc`-based pipeline reads
 * source files from disk, where the compiled modules don't exist, and fails
 * with "Source file not found".
 *
 * Failing fast here -- rather than only when declaration emit happens to run
 * -- keeps the project honest: editors and `tsc`/`ember-tsc` then check the
 * same rules the build enforces (exported values need explicit type
 * annotations, e.g. `export const X: TOC<Sig> = <template>...`).
 *
 * The tsconfig checked is the one tsdown's `tsconfig` option points at, not
 * necessarily `tsconfig.json`. A library whose package also holds dev-only code
 * (a demo app, in-package tests) can therefore keep a permissive
 * `tsconfig.json` covering everything for editors and `tsc --noEmit`, and point
 * the build at a `tsconfig.publish.json` that covers only the publishable
 * sources -- isolated declarations then constrain exactly the code that gets
 * declarations emitted for it, and nothing else.
 *
 * Projects with no tsconfig (JavaScript libraries) or without the `typescript`
 * package have no declarations to emit, so there is nothing to check.
 * `tsconfig: false` is different: it is an explicit opt-out, and combined with
 * declaration emit it produces a confusing "Source file not found" from the
 * tsc-based pipeline, so it errors here instead.
 */
export function emberIsolatedDeclarations(): Plugin {
  let tsconfigOption: string | boolean | undefined;
  let emitsDeclarations = true;

  return {
    name: "ember:isolated-declarations",

    // Not called under plain rolldown, which leaves `tsconfigOption` undefined
    // -- i.e. the cwd's tsconfig.json, the only thing it could mean there.
    tsdownConfig(config: UserConfig) {
      tsconfigOption = config.tsconfig;
      // `emberConfig()` turns dts on unless the library turned it off, so an
      // explicit `false` is the only "no declarations" signal. Hook order
      // between plugins isn't guaranteed, so don't rely on it having run.
      emitsDeclarations = config.dts !== false;
    },

    async buildStart() {
      if (tsconfigOption === false) {
        if (!emitsDeclarations) return;

        // Without a tsconfig there is no `isolatedDeclarations`, so tsdown
        // falls back to the tsc-based declaration pipeline -- which reads
        // source files from disk and dies with "Source file not found" on
        // every `.gts`/`.gjs`, since those only exist compiled in the module
        // graph. Say so here instead of leaving that to be decoded.
        this.error(
          `\`tsconfig: false\` cannot be combined with declaration emit.\n\n` +
            `Declarations are emitted by the isolated-declarations pipeline, which needs a ` +
            `tsconfig setting "compilerOptions.isolatedDeclarations": true -- it is the only ` +
            `pipeline that can see compiled .gts/.gjs modules.\n\n` +
            `Either point tsdown's \`tsconfig\` option at such a config, or set \`dts: false\` ` +
            `if this library ships no types.`,
        );
      }

      const tsconfigPath = resolveTsconfigPath(tsconfigOption);

      if (!tsconfigPath || !existsSync(tsconfigPath)) return;

      let ts: typeof import("typescript");

      try {
        ts = (await import("typescript")).default;
      } catch {
        return;
      }

      const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

      if (error) {
        // Unreadable/unparsable tsconfig: tsc itself will report this with a
        // better message than we can.
        return;
      }

      // Resolves `extends` chains, so the flag may come from a base config.
      const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(tsconfigPath));

      if (parsed.options.isolatedDeclarations !== true) {
        this.error(
          `${tsconfigPath} must set "compilerOptions.isolatedDeclarations": true.\n\n` +
            `Declarations for .gts/.gjs (template tag) modules can only be emitted by the ` +
            `isolated-declarations pipeline, which reads compiled modules from the bundler's ` +
            `module graph -- the tsc-based pipeline reads from disk and cannot see them.\n\n` +
            `Isolated declarations require exported values to have explicit type annotations, ` +
            `e.g. \`export const X: TOC<Sig> = <template>...\`.\n\n` +
            `If this tsconfig also covers dev-only code (a demo app, in-package tests) that ` +
            `should not be constrained this way, point tsdown's \`tsconfig\` option at a ` +
            `publish-only tsconfig that sets the flag and covers just the published sources.`,
        );
      }
    },
  };
}

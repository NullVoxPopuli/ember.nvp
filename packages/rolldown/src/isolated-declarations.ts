import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { Plugin } from "rolldown";

/**
 * Errors the build when a `tsconfig.json` is present without
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
 * Projects without a `tsconfig.json` (JavaScript libraries) or without the
 * `typescript` package have no declarations to emit, so there is nothing to
 * check.
 */
export function emberIsolatedDeclarations(): Plugin {
  return {
    name: "ember:isolated-declarations",

    async buildStart() {
      const tsconfigPath = resolve("tsconfig.json");

      if (!existsSync(tsconfigPath)) return;

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
            `e.g. \`export const X: TOC<Sig> = <template>...\`.`,
        );
      }
    },
  };
}

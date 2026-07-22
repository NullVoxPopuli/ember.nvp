import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, matchesGlob, relative, resolve, sep } from "node:path";

import type { Plugin } from "rolldown";

export interface AppReexportsOptions {
  /**
   * Globs, matched against each built filename (relative to the output
   * directory), selecting which modules get an app re-export.
   *
   * Defaults to `["services/*"]` -- top-level services only. Under strict
   * mode, components and helpers are imported, but services are still
   * injected by name, so they are the one thing an app must always be able
   * to resolve.
   *
   * `.d.ts` files never match.
   */
  include?: string[];

  /**
   * Globs removing files that `include` matched.
   */
  exclude?: string[];

  /**
   * Rename a re-export: receives the built filename, returns the filename the
   * app sees. Defaults to the built filename unchanged.
   */
  mapFilename?: (filename: string) => string;

  /**
   * Which bindings a file's re-export module forwards: an array of names
   * (default `["default"]`), or a raw export clause string such as `"*"`.
   */
  exports?: (filename: string) => string[] | string | undefined;
}

/**
 * Merges built modules into the consuming app's namespace, so classic
 * resolution (`{{a-component}}`, service/helper lookup by name) finds them --
 * the same job as `@embroider/addon-dev`'s `appReexports` rollup plugin.
 *
 * For every built file matching `include` (minus `exclude` and `.d.ts`), it
 * writes a tiny module under `<outDir>/_app_/` re-exporting from the
 * library's own name, and records the full set in `package.json` under
 * `ember-addon.app-js`.
 *
 * Unlike the embroider plugin, nothing is written unless its content actually
 * differs from what is on disk: the `_app_/` modules are compared
 * byte-for-byte, and `package.json` is only rewritten when the `app-js` map
 * itself changed (so an equivalent map in different formatting is left
 * alone). This keeps rebuilds from re-triggering file watchers.
 *
 * This is a separate import, because most libraries don't need it:
 *
 * ```js
 * import { defineConfig } from "tsdown";
 * import { ember } from "@nullvoxpopuli/ember-rolldown";
 * import { appReexports } from "@nullvoxpopuli/ember-rolldown/app-reexports";
 *
 * export default defineConfig({
 *   entry: ["./src/index.ts", "./src/services/session.ts"],
 *   plugins: [ember(), appReexports()],
 * });
 * ```
 *
 * With no arguments, top-level services (`services/*`) are re-exported. A
 * string or array of strings is the include glob(s), optionally followed by
 * the remaining options; an object gives full control:
 *
 * ```js
 * appReexports();                          // services/*
 * appReexports("components/**");           // one include glob
 * appReexports(["services/*", "helpers/*"]);
 * appReexports("components/**", { exclude: ["components/-private/**"] });
 * appReexports({ include: ["services/*", "helpers/*"], exclude: [...] });
 * ```
 */
export function appReexports(
  includeOrOptions: string | string[] | AppReexportsOptions = {},
  options: Omit<AppReexportsOptions, "include"> = {},
): Plugin {
  const resolved =
    typeof includeOrOptions === "string"
      ? { ...options, include: [includeOrOptions] }
      : Array.isArray(includeOrOptions)
        ? { ...options, include: includeOrOptions }
        : includeOrOptions;
  const include = resolved.include ?? ["services/*"];

  return {
    name: "ember:app-reexports",

    writeBundle(outputOptions, bundle) {
      const manifest = readJsonSync("package.json");
      const outDir = outputOptions.dir ?? dirname(outputOptions.file ?? "dist");
      const appJs: Record<string, string> = {};

      // Sorted so the app-js map (and therefore package.json) is stable
      // across builds regardless of chunk emission order.
      for (const builtFilename of Object.keys(bundle).sort()) {
        if (!isIncluded(builtFilename, include, resolved.exclude)) continue;

        const appFilename = resolved.mapFilename?.(builtFilename) ?? builtFilename;
        const names = resolved.exports?.(builtFilename) || ["default"];
        const clause = typeof names === "string" ? names : `{ ${names.join(", ")} }`;
        const withoutExtension = builtFilename.slice(0, -extname(builtFilename).length);
        const reexportPath = join(outDir, "_app_", appFilename);

        appJs[`./${appFilename}`] = `./${toPosix(relative(process.cwd(), resolve(reexportPath)))}`;

        writeFileIfChanged(
          reexportPath,
          `export ${clause} from "${manifest.name}/${withoutExtension}";\n`,
        );
      }

      const existing = manifest["ember-addon"]?.["app-js"] ?? {};

      if (!sameStringRecord(existing, appJs)) {
        manifest["ember-addon"] = { ...manifest["ember-addon"], "app-js": appJs };
        writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
      }
    },
  };
}

function readJsonSync(path: string) {
  return JSON.parse(readFileSync(path, { encoding: "utf8" }));
}

function isIncluded(filename: string, include: string[], exclude?: string[]): boolean {
  if (matchesGlob(filename, "**/*.d.ts")) return false;
  if (!include.some((glob) => matchesGlob(filename, glob))) return false;
  if (exclude?.some((glob) => matchesGlob(filename, glob))) return false;

  return true;
}

function writeFileIfChanged(path: string, content: string) {
  let existing: string | undefined;

  try {
    existing = readFileSync(path, { encoding: "utf8" });
  } catch {
    // Doesn't exist yet (or isn't readable) -- write it.
  }

  if (existing === content) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function sameStringRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);

  return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

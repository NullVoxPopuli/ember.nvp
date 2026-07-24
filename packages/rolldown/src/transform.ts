import { Preprocessor } from "content-tag";
import { existsSync, realpathSync } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "rolldown";

const processor = new Preprocessor();

/**
 * `.d.ts` files emitted for `.gts` source reference the original `.gts`
 * specifiers. Consumers can't resolve those, so we rewrite them back to
 * extension-less specifiers.
 */
function fixDeclarationImports(content: string): string {
  return content
    .replace(/from\s+'([^']+)\.gts'/g, "from '$1'")
    .replace(/from\s+"([^"]+)\.gts"/g, 'from "$1"')
    .replace(/import\("([^"]+)\.gts"\)/g, 'import("$1")')
    .replace(/import\('([^']+)\.gts'\)/g, "import('$1')");
}

async function fixDtsExtensionsInDir(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await fixDtsExtensionsInDir(fullPath);
    } else if (entry.name.endsWith(".d.ts")) {
      const content = await readFile(fullPath, { encoding: "utf8" });
      const fixed = fixDeclarationImports(content);

      if (fixed !== content) {
        await writeFile(fullPath, fixed);
      }
    }
  }
}

/**
 * A sourcemap mapping every generated line to the same line of the input.
 *
 * `AAAA` is the [0, 0, 0, 0] VLQ segment (first line maps to source 0, line 0,
 * column 0); `AACA` is [0, 0, +1, 0] (each following line advances the source
 * line by one). Exact at line granularity, which is all the specifier rewrite
 * can disturb.
 */
function lineIdentityMap(id: string, source: string) {
  return {
    version: 3,
    sources: [id],
    sourcesContent: [source],
    names: [],
    mappings: source
      .split("\n")
      .map((_, line) => (line === 0 ? "AAAA" : "AACA"))
      .join(";"),
  };
}

/**
 * Maps `.gts` -> `.ts` and `.gjs` -> `.js` (so rolldown can identify them as
 * ts/js) and preprocesses `<template>` via content-tag.
 */
export function emberTransform(): Plugin {
  return {
    name: "ember:transform",

    resolveId: {
      order: "pre",
      handler(id, importer) {
        // Entries have no importer: their ids come straight from the build
        // config (tsdown expands entry globs to on-disk paths). Resolve a
        // `.gts`/`.gjs` entry to the same virtual `.ts`/`.js` id an imported
        // module gets, so the load hook compiles it via content-tag instead
        // of the raw `<template>` source hitting the parser. Entries may be
        // any extension — the emitted `.js`/`.d.ts` paths mirror the entry
        // paths either way (that's how tsdown's dts support works).
        if (!importer) {
          if (!id.endsWith(".gts") && !id.endsWith(".gjs")) return null;
          if (!existsSync(id)) return null;

          // rolldown's default resolver realpaths entry ids (e.g. macOS
          // /var -> /private/var). Match it, or this same file imported from
          // another entry resolves to a second module id and gets duplicated
          // into both chunks.
          const fileName = realpathSync(path.resolve(id));

          return {
            id: fileName.replace(/\.gts$/, ".ts").replace(/\.gjs$/, ".js"),
            meta: { fileName },
          };
        }

        const fileName = path.join(path.dirname(importer), id);

        if (id.endsWith(".gts")) {
          return {
            id: fileName.replace(/\.gts$/, ".ts"),
            meta: { fileName },
          };
        }

        if (id.endsWith(".gjs")) {
          return {
            id: fileName.replace(/\.gjs$/, ".js"),
            meta: { fileName },
          };
        }

        // A `.ts`/`.js` specifier whose only backing file is a `.gts`/`.gjs`
        // resolves to the virtual module. This must also serve `.d.ts`
        // importers: rolldown-plugin-dts resolves a declaration module's
        // imports through the plugin pipeline (`this.resolve`), and — when the
        // resolution is a source file — loads it (registering its declaration)
        // before mapping the import to the declaration id. Virtual modules
        // exist nowhere else, so if we don't answer here the import either
        // fails to resolve (no file on disk) or, worse, resolves to a
        // declaration id that was never registered.
        if (id.endsWith(".ts")) {
          const gtsFileName = fileName.replace(/\.ts$/, ".gts");
          if (existsSync(gtsFileName) && !existsSync(fileName)) {
            return { id: fileName, meta: { fileName: gtsFileName } };
          }
        }

        if (id.endsWith(".js")) {
          const gjsFileName = fileName.replace(/\.js$/, ".gjs");
          if (existsSync(gjsFileName) && !existsSync(fileName)) {
            return { id: fileName, meta: { fileName: gjsFileName } };
          }
        }

        return null;
      },
    },

    load: {
      order: "pre",
      filter: {
        id: /\.(ts|js)$/,
      },
      async handler(id) {
        const meta = this.getModuleInfo(id)?.meta ?? {};
        let fileName = meta?.fileName;

        // A virtual id can be loaded without having passed through our
        // resolveId (rolldown-plugin-dts calls `this.load({ id })` with just
        // the id), so no meta is attached: recover the backing file from disk.
        if (!fileName && !existsSync(id)) {
          if (id.endsWith(".ts") && existsSync(id.replace(/\.ts$/, ".gts"))) {
            fileName = id.replace(/\.ts$/, ".gts");
          } else if (id.endsWith(".js") && existsSync(id.replace(/\.js$/, ".gjs"))) {
            fileName = id.replace(/\.js$/, ".gjs");
          }
        }

        if (fileName) {
          this.addWatchFile(fileName);
          const source = await readFile(fileName, { encoding: "utf8" });

          if (source.includes("<template>")) {
            const { code, map } = processor.process(source, {
              filename: fileName,
            });
            return { code, map };
          }

          return source;
        }

        return null;
      },
    },

    transform: {
      order: "pre",
      filter: {
        code: /\.gts/,
        id: /\.(js|ts)$/,
      },
      handler(input, id) {
        // Rewrite `.gts` specifiers to `.ts` — the (virtual) source id — in
        // runtime modules AND declaration modules alike. Declaration modules
        // must NOT be rewritten to `.d.ts`: rolldown-plugin-dts's resolver
        // treats a source-file resolution as "load it (registering its
        // declaration), then map to the declaration id", while a `.d.ts` id is
        // returned as-is — unloadable when the module isn't registered yet
        // (e.g. the `.gts` is only ever type-imported).
        const output = input.replace(
          /(['"`])((?:\.\.?\/|\/|@|[A-Za-z0-9_\-])[^'"]*?\.gts)\1/g,
          (_m, q, p) => `${q}${p.replace(/\.gts$/, ".ts")}${q}`,
        );

        if (output === input) {
          return null;
        }

        // The rewrite only shortens import specifiers in place, so a
        // line-identity map is accurate to the line (and to the column for
        // everything before the first rewritten specifier on a line).
        return { code: output, map: lineIdentityMap(id, input) };
      },
    },

    writeBundle: {
      async handler(options) {
        const outDir = (options as { dir?: string }).dir;
        if (outDir) {
          await fixDtsExtensionsInDir(path.resolve(outDir));
        }
      },
    },
  };
}

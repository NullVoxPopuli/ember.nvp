import { Preprocessor } from "content-tag";
import { existsSync } from "node:fs";
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
 * Maps `.gts` -> `.ts` and `.gjs` -> `.js` (so rolldown can identify them as
 * ts/js) and preprocesses `<template>` via content-tag.
 */
export function emberTransform(): Plugin {
  const virtualFiles = new Set<string>();

  return {
    name: "ember:transform",

    resolveId: {
      order: "pre",
      handler(id, importer) {
        if (!importer) return null;

        const fileName = path.join(path.dirname(importer), id);

        if (id.endsWith(".gts") && !importer.endsWith(".d.ts")) {
          virtualFiles.add(fileName);
          return {
            id: fileName.replace(/\.gts$/, ".ts"),
            meta: { fileName },
          };
        }

        if (id.endsWith(".gjs") && !importer.endsWith(".d.ts")) {
          virtualFiles.add(fileName);
          return {
            id: fileName.replace(/\.gjs$/, ".js"),
            meta: { fileName },
          };
        }

        if (id.endsWith(".d.ts") && importer.endsWith(".d.ts")) {
          const gtsFile = fileName.replace(".d.ts", ".gts");
          if (virtualFiles.has(gtsFile)) {
            return fileName;
          }
        }

        if (id.endsWith(".ts") && !importer.endsWith(".d.ts")) {
          const gtsFileName = fileName.replace(/\.ts$/, ".gts");
          if (existsSync(gtsFileName) && !existsSync(fileName)) {
            virtualFiles.add(gtsFileName);
            return { id: fileName, meta: { fileName: gtsFileName } };
          }
        }

        if (id.endsWith(".js") && !importer.endsWith(".d.ts")) {
          const gjsFileName = fileName.replace(/\.js$/, ".gjs");
          if (existsSync(gjsFileName) && !existsSync(fileName)) {
            virtualFiles.add(gjsFileName);
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
        const fileName = meta?.fileName;

        if (fileName) {
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
        if (input.includes(".gts") && id.endsWith(".d.ts")) {
          return input.replace(
            /(['"`])((?:\.\.?\/|\/|@|[A-Za-z0-9_\-])[^'"]*?\.gts)\1/g,
            (_m, q, p) => `${q}${p.replace(/\.gts$/, ".d.ts")}${q}`,
          );
        }

        if (input.includes(".gts") && !id.endsWith(".d.ts")) {
          return input.replace(
            /(['"`])((?:\.\.?\/|\/|@|[A-Za-z0-9_\-])[^'"]*?\.gts)\1/g,
            (_m, q, p) => `${q}${p.replace(/\.gts$/, ".ts")}${q}`,
          );
        }

        return input;
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

import { existsSync, lstatSync } from "node:fs";
import { readFile, glob, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parsePath } from "node:path";
import { removeTypes } from "./remove-types.js";
import { rewriteImportsToMatchFiles } from "./rewrite-imports.js";

/**
 * `**\/*` alone skips dotfiles, which bases legitimately provide
 * (`.gitignore`, `.env.development`, ...): the extra patterns match
 * dotfiles at any depth and files inside dot-directories (`.github/...`).
 */
const EVERY_FILE = ["**/*", "**/.*", "**/.*/**/*"];

/**
 *
 * Modified version of applyFolder from ember-apply
 * where the caller gets to decide the final output filPath and contents - whereas the version from ember-apply only allows similar file paths in source and destination.
 *
 * We need customization because we will intake ts and output js
 *
 * @param {string} from
 * @param {{to: import('#utils/project.js').Project, process: (data: { entry: string, contents: string }) => string | Promise<void>}} options sub folder within the target project to copy the contents to
 */
export async function applyFolder(from, options) {
  for await (const entry of glob(EVERY_FILE, {
    exclude: ["**/node_modules", "**/dist"],
    cwd: from,
  })) {
    let sourcePath = join(from, entry);
    let targetPath = join(options.to.directory, entry);
    let directory = dirname(targetPath);

    if (directory) {
      await mkdir(directory, { recursive: true });
    }

    let stat = lstatSync(sourcePath);

    if (stat.isDirectory()) {
      continue;
    }

    let buffer = await readFile(sourcePath);
    let contents = buffer.toString();

    await options.process({ entry: targetPath, contents });
  }
}

/**
 * @param {string} from
 * @param {import('#utils/project.js').Project} project
 */
export async function applyFolderTo(from, project) {
  /**
   * Files we wrote, to be import-rewritten in a second pass.
   *
   * Rewriting has to wait until every file is on disk: it checks which
   * file a specifier actually resolves to, so rewriting while the folder
   * is still half-applied depends on iteration order (e.g. `index.js`
   * pointing at `./utils/math.ts` before `math.js` exists would be left
   * alone, emitting a broken import).
   *
   * @type {string[]}
   */
  let written = [];

  await applyFolder(from, {
    to: project,
    async process({ entry, contents }) {
      /**
       * TODO: handle conflicts if files already exists
       *
       *       (I believe we can do interactive here)
       */
      let pathInfo = parsePath(entry);
      let ext = pathInfo.ext;
      if (ext === ".gts" || ext === ".ts") {
        let wantsTS = await project.hasOrWantsLayer("typescript");

        if (!wantsTS) {
          let filePath = entry.replace(/\.gts$/, ".gjs").replace(/\.ts$/, ".js");

          if (existsSync(filePath)) {
            /**
             * Skipping due to already existing
             * TODO: need a flag to force overwrite?
             */
            return;
          }

          await writeFile(filePath, await removeTypes(ext, contents));
          written.push(filePath);
          return;
        }
      }

      if (existsSync(entry)) {
        /**
         * Skipping due to already existing
         * TODO: need a flag to force overwrite?
         */
        return;
      }

      await writeFile(entry, contents);
      written.push(entry);
    },
  });

  /**
   * Imports must always match the emitted files (and carry their
   * extension). The util decides which files it applies to and is a
   * no-op for everything else. Files that already existed are the
   * user's; we leave them alone.
   */
  for (let filePath of written) {
    let contents = await readFile(filePath, "utf-8");
    let rewritten = rewriteImportsToMatchFiles(contents, filePath);

    if (rewritten !== contents) {
      await writeFile(filePath, rewritten);
    }
  }
}

import { existsSync, lstatSync } from "node:fs";
import { readFile, glob, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parsePath } from "node:path";
import { removeTypes } from "./remove-types.js";

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
  for await (const entry of glob("**/*", { exclude: ["**/node_modules", "**/dist"], cwd: from })) {
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
          let newContents = await removeTypes(ext, contents);

          await writeFile(filePath, newContents);
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
    },
  });
}

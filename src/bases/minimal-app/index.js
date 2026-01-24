import { packageJson, files } from "ember-apply";
import { parse as parsePath } from "node:path";
import { removeTypes } from "#utils/remove-types.js";
import { getLatest } from "#utils/npm.js";
import { fileURLToPath } from "node:url";

/**
 * Minimal Layer
 *
 * Provides the absolute bare minimum for an Ember app:
 * - type: "module" in package.json
 * - No @embroider/compat (no-compat mode)
 * - No testing framework
 * - No linting or formatting
 * - No ember-welcome-page
 * - No warp-drive (opt-in if needed)
 */
export default {
  label: "Minimal App Base",
  description: "Bare minimum Ember app structure",

  /**
   * 1. Apply files
   *   a. Remove TS if needed
   * 2. Remove TS deps/files if needed
   * 3. Update name(s)
   *
   * @param {import('#types').Project} project
   */
  async run(project) {
    await applyFiles(project);
    await updateName(project);
    await makeJavaScript(project);
    await upgradeDependencies(project);
  },
};

/**
 * @param {import('#types').Project} project
 */
async function applyFiles(project) {
  let filePath = fileURLToPath(new URL("files", import.meta.url));

  await files.applyFolder(filePath, {
    to: project.directory,
    async transform({ filePath, contents }) {
      /**
       * TODO: handle conflicts if files already exists
       *
       *       (I believe we can do interactive here)
       */
      let pathInfo = parsePath(filePath);
      let ext = pathInfo.ext;
      if (ext === ".gts" || ext === ".ts") {
        if (!project.wantsTypeScript) {
          await removeTypes(ext, contents);
        }
      }

      return contents;
    },
  });
}

/**
 * Operates on known files where the name matters
 *
 * @param {import('#types').Project} project
 */
async function updateName(project) {
  await packageJson.modify((json) => {
    json.name = project.desires.name;
  }, project.directory);
}

/**
 * @param {import('#types').Project} project
 */
async function makeJavaScript(project) {
  if (project.wantsTypeScript) return;

  /**
   * We don't actually remove anything, because we want intellisense for JS
   */
  // await packageJson.removeDevDependencies([
  //   "@ember/app-tsconfig",
  //   "@glint/ember-tsc",
  //   "@glint/template",
  //   "@glint/tsserver-plugin",
  //   "typescript",
  // ], project.directory);
}

/**
 * Bumps in-range only.
 * Majors will need to go through PR to this repo.
 *
 * @param {import('#types').Project} project
 */
async function upgradeDependencies(project) {
  let existing = await packageJson.read(project.directory);

  await packageJson.modify(async (json) => {
    Object.assign(json.dependencies, await getLatest(existing.dependencies));
    Object.assign(json.devDependencies, await getLatest(existing.devDependencies));
  }, project.directory);
}

import { packageJson, js } from "ember-apply";
import { parse as parsePath } from "node:path";
import { removeTypes } from "#utils/remove-types.js";
import { getLatest } from "#utils/npm.js";
import { fileURLToPath } from "node:url";
import { applyFolder } from "#utils/fs.js";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

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
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    await applyFiles(project);
    await updateName(project);
    await makeJavaScript(project);
    await upgradeDependencies(project);
    await updateBabelConfig(project);
  },
};

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  if (project.wantsTypeScript) return;

  await js.transform(project.path("babel.config.js"), async ({ root, j }) => {
    root
      .find(j.ArrayExpression, {
        elements: {
          0: { value: "@babel/plugin-transform-typescript" },
        },
      })
      .forEach(
        /**
         * @param {unknown} path
         */
        (path) => {
          j(path).remove();
        },
      );
  });
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function applyFiles(project) {
  let filePath = fileURLToPath(new URL("files", import.meta.url));

  await applyFolder(filePath, {
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
        if (!project.wantsTypeScript) {
          let newContents = await removeTypes(ext, contents);
          let filePath = entry.replace(/\.gts$/, ".gjs").replace(/\.ts$/, ".js");

          await writeFile(filePath, newContents);
          return;
        }
      }

      await writeFile(entry, contents);
    },
  });
}

/**
 * Operates on known files where the name matters
 *
 * @param {import('#utils/project.js').Project} project
 */
async function updateName(project) {
  await packageJson.modify((json) => {
    json.name = project.desires.name;
  }, project.directory);
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function makeJavaScript(project) {
  if (project.wantsTypeScript) return;

  /**
   * We don't actually remove anything, because we want intellisense for JS
   *
   * But perhaps for the sake of minimal, we do remoev it.
   * And we add a layer later for JSDoc ased TS or something
   */
  await packageJson.removeDevDependencies(
    [
      "@ember/app-tsconfig",
      "@glint/ember-tsc",
      "@glint/template",
      "@glint/tsserver-plugin",
      "typescript",
    ],
    project.directory,
  );

  await project.removeFile("tsconfig.json");

  await packageJson.modify((json) => {
    json.imports["#config"] = "./app/config.js";
  }, project.directory);
}

/**
 * Bumps in-range only.
 * Majors will need to go through PR to this repo.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function upgradeDependencies(project) {
  let existing = await packageJson.read(project.directory);

  await packageJson.modify(async (json) => {
    Object.assign(json.dependencies, await getLatest(existing.dependencies));
    Object.assign(json.devDependencies, await getLatest(existing.devDependencies));
  }, project.directory);
}

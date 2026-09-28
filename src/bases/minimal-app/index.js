import { packageJson, js } from "ember-apply";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

/**
 * Minimal App Base
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
   * 2. Update name(s)
   * 3. Remove TS deps/files if needed
   * 4. Upgrade in-range dependencies
   * 5. Update an existing babel config, if any
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
 * A JavaScript project's babel config must not reference the TS plugin.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  if (await project.hasOrWantsLayer("typescript")) return;

  await removeConfiguredPlugin(project, "@babel/plugin-transform-typescript");
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function applyFiles(project) {
  let filePath = join(import.meta.dirname, "files");

  await applyFolderTo(filePath, project);
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
  if (await project.hasOrWantsLayer("typescript")) return;

  /**
   * Intellisense for JS needs some of these,
   * but minimal means minimal.
   *
   * A later layer for JSDoc-based TS can add them back.
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
    json.imports ||= {};
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
    if (json.dependencies) {
      Object.assign(json.dependencies, await getLatest(existing.dependencies));
    }
    if (json.devDependencies) {
      Object.assign(json.devDependencies, await getLatest(existing.devDependencies));
    }
  }, project.directory);
}

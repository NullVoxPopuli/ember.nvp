import { packageJson } from "ember-apply";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

/**
 * Minimal Extension Base
 *
 * Provides the absolute bare minimum for a browser extension (Manifest V3)
 * whose popup is an Ember app:
 * - type: "module" in package.json
 * - public/manifest.json copied verbatim into dist
 * - index.html popup booting from an external script (extension pages
 *   forbid inline scripts via CSP)
 * - No testing framework
 * - No linting or formatting
 * - No ember-welcome-page
 */
export default {
  label: "Minimal Extension Base",
  description: "Bare minimum browser extension structure with an Ember popup",

  /**
   * 1. Apply files
   *   a. Remove TS if needed
   * 2. Remove TS deps/files if needed
   * 3. Update name(s)
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

  if (!project.hasFile("public/manifest.json")) return;

  let manifestPath = project.path("public/manifest.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  manifest.name = project.desires.name;

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function makeJavaScript(project) {
  if (await project.hasOrWantsLayer("typescript")) return;

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
    json.imports ||= {};
    json.imports["#config"] = "./app/config.js";
  }, project.directory);

  /**
   * The import-rewriting pass only handles module files; the popup's
   * <script src> points at the boot module by path, so it has to follow
   * the .ts -> .js rename by hand.
   */
  if (!project.hasFile("index.html")) return;

  let indexPath = project.path("index.html");
  let indexHtml = await readFile(indexPath, "utf-8");

  await writeFile(indexPath, indexHtml.replace("./app/boot.ts", "./app/boot.js"));
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

import { packageJson } from "ember-apply";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo, readJSON } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

/**
 * Minimal Extension Base
 *
 * Provides the absolute bare minimum for a browser extension (Manifest V3)
 * whose popup is an Ember app:
 * - type: "module" in package.json
 * - public/manifest.json copied verbatim into dist
 * - index.html popup booting from an external script
 *   (extension pages forbid inline scripts via CSP)
 * - No testing framework
 * - No linting or formatting
 * - No ember-welcome-page
 *
 * @type {import('#types').Base}
 */
export default {
  label: "Minimal Extension Base",
  description: "Bare minimum browser extension structure with an Ember popup",

  /**
   * @param {import('#utils/project.js').Project} project
   */
  agents(project) {
    return `## Project layout

- \`public/manifest.json\` is the extension manifest. The build copies it into \`dist/\` as it is.
  Add permissions, background scripts, and content scripts there.
- \`index.html\` is the popup page.
  Extension pages do not allow inline scripts, so the app boots from \`app/boot\`.
- \`app/app\` registers the modules in \`app/router\`, \`app/templates/\`, and \`app/services/\`.
  Everything else (components, helpers, modifiers, utils) is imported where it is used.
- The popup has no URL bar, so routing uses \`locationType: "none"\`.
- To try the popup in a browser tab, run \`${project.runPrefix} start\`.
  To try it as an extension, run \`${project.runPrefix} build\`, then load \`dist/\` as an unpacked extension.`;
  },

  /**
   * A web app can have a manifest.json too (for a PWA),
   * but only a browser extension's manifest has `manifest_version`.
   *
   * @param {string} directory
   */
  detect(directory) {
    return ["manifest.json", "public/manifest.json"].some(
      (file) => readJSON(join(directory, file))?.manifest_version !== undefined,
    );
  },

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
 * Operates on known files where the name matters.
 *
 * The extension's display name lives in public/manifest.json.
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

  /**
   * The import-rewriting pass only handles module files.
   *
   * The popup's <script src> points at the boot module by path,
   * so it has to follow the .ts -> .js rename by hand.
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

import { packageJson } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

const TEMPLATE_GLOBAL_NAME = "MinimalWidget";

/**
 * Minimal Widget Base
 *
 * The minimal-library toolchain, around one pattern:
 * - a `<template>` component (`src/widget.gts`)
 * - a `mount(element, args)` function that renders it with `renderComponent`
 *   into a shadow root, and returns `update` and `destroy` (`src/mount.ts`)
 * - `src/index.ts` exports `mount` and the component
 *
 * Built in bundle mode, twice:
 * - `dist/index.js`, an ES module, for pages with a bundler
 * - `dist/index.iife.js`, a global, for a `<script>` tag
 *
 * Like minimal-library:
 * - built with tsdown + @nullvoxpopuli/ember-rolldown
 * - No babel.config.js
 * - No testing framework
 * - No linting or formatting
 *
 * Testing, linting, formatting, etc. are opt-in via layers.
 *
 * @type {import('#types').Base}
 */
export default {
  label: "Minimal Widget Base",
  description: "An Ember component, packaged to embed in any page with one function call",

  agents: `## Project layout

- \`src/widget\` is the root component of the widget.
- \`src/mount\` renders the widget into a shadow root on the host page.
  It returns \`update\`, to change the args, and \`destroy\`, to remove the widget.
- \`src/index\` is the public entry point.
- \`dist/\` is the build output, with ember bundled in. Do not edit it, because each build writes it again.

The shadow root isolates the styles.
Put the styles of the widget in the \`<style>\` element of \`src/widget\`.

To add an arg:

1. Add it to the \`Args\` of the widget's signature.
2. Give it a default value in \`src/mount\`.
3. Read it as an arg in the component.`,

  /**
   * @param {string} directory
   */
  detect(directory) {
    return ["src/mount.ts", "src/mount.js"].some((file) => {
      let path = join(directory, file);

      return existsSync(path) && readFileSync(path, "utf-8").includes("renderComponent");
    });
  },

  /**
   * 1. Apply files
   *   a. Remove TS if needed
   * 2. Update name(s)
   * 3. Make publishable
   * 4. Remove TS deps/files/config if needed
   * 5. Upgrade in-range dependencies
   * 6. Update an existing babel config, if any
   *
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    await applyFiles(project);
    await updateName(project);
    await makePublishable(project);
    await makeJavaScript(project);
    await upgradeDependencies(project);
    await updateBabelConfig(project);
  },
};

/**
 * The global that the `<script>` build assigns:
 * the package name without its scope, in PascalCase.
 *
 *   my-widget        → MyWidget
 *   @acme/my.widget  → MyWidget
 *
 * A JavaScript identifier cannot start with a digit,
 * so a name that does gets a `Widget` prefix.
 *
 * @param {string} packageName
 * @returns {string}
 */
export function globalNameFor(packageName) {
  let name = packageName
    .replace(/^@[^/]+\//, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return /^[A-Za-z]/.test(name) ? name : `Widget${name}`;
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

  let globalName = globalNameFor(project.desires.name);

  for (let file of ["tsdown.config.js", "README.md"]) {
    await replaceInFile(project, file, TEMPLATE_GLOBAL_NAME, globalName);
  }

  await replaceInFile(project, "README.md", "minimal-widget", project.desires.name);
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} relativePath
 * @param {string} search
 * @param {string} replacement
 */
async function replaceInFile(project, relativePath, search, replacement) {
  if (!project.hasFile(relativePath)) return;

  let path = project.path(relativePath);
  let contents = await readFile(path, "utf-8");

  await writeFile(path, contents.replaceAll(search, replacement));
}

/**
 * The template's package.json is `private: true` so it can never be
 * published from this repo; the generated widget exists to be published,
 * so the flag is removed entirely.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function makePublishable(project) {
  await packageJson.modify((json) => {
    delete json.private;
  }, project.directory);
}

/**
 * When the project is JavaScript (no typescript layer):
 * - remove the TS toolchain
 * - drop the tsconfig
 * - point the build at the emitted `.js` entry
 *   (declarations can't be produced without types)
 *
 * @param {import('#utils/project.js').Project} project
 */
async function makeJavaScript(project) {
  if (await project.hasOrWantsLayer("typescript")) return;

  await packageJson.removeDevDependencies(
    ["@babel/plugin-transform-typescript", "@ember/library-tsconfig", "typescript"],
    project.directory,
  );

  await project.removeFile("tsconfig.json");

  await removeTypesExports(project);
  await pointBuildAtJavaScript(project);
}

/**
 * No declarations are emitted for a JavaScript widget, so the `types`
 * export conditions would point at files that never exist.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function removeTypesExports(project) {
  await packageJson.modify((json) => {
    for (let condition of Object.values(json.exports ?? {})) {
      if (condition && typeof condition === "object") {
        delete condition.types;
      }
    }
  }, project.directory);
}

/**
 * Rewrites the tsdown config so it builds the JavaScript entry and stops
 * emitting declarations (defineConfig defaults to `dts: true`).
 *
 * @param {import('#utils/project.js').Project} project
 */
async function pointBuildAtJavaScript(project) {
  let configPath = project.path("tsdown.config.js");
  let contents = await readFile(configPath, "utf-8");

  contents = contents.replace(
    `entry: ["./src/index.ts"],`,
    `entry: ["./src/index.js"],\n  dts: false,`,
  );

  await writeFile(configPath, contents);
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

/**
 * The base doesn't emit a babel.config.js,
 * but this can run over an existing project that has one.
 *
 * A JavaScript project's config must not reference the TS plugin.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  if (await project.hasOrWantsLayer("typescript")) return;
  if (!project.hasFile("babel.config.js")) return;

  await removeConfiguredPlugin(project, "@babel/plugin-transform-typescript");
}

import { packageJson } from "ember-apply";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

const TEMPLATE_TAG_NAME = "minimal-custom-element";

/**
 * Minimal Custom Element Base
 *
 * The minimal-library toolchain, around one pattern:
 * - a `<template>` component (`src/components/counter.gts`)
 * - a custom element that renders it with `renderComponent`,
 *   and forwards its observed attributes as reactive args (`src/element.ts`)
 * - `src/index.ts` exports the element class and the component
 * - `src/register.ts` defines the tag, for consumers to import as a side effect
 *
 * Built in bundle mode: ember ships inside the package.
 *
 * Like minimal-library:
 * - built with tsdown + @nullvoxpopuli/ember-rolldown
 * - No babel.config.js
 * - No testing framework
 * - No linting or formatting
 *
 * Testing, linting, formatting, etc. are opt-in via layers.
 */
export default {
  label: "Minimal Custom Element Base",
  description: "An Ember component packaged as a custom element (web component)",

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
 * The tag a generated project registers: the package name without its scope.
 *
 * A custom element name must contain a hyphen,
 * so an unhyphenated package name gets an `-element` suffix.
 *
 * @param {string} packageName
 * @returns {string}
 */
export function tagNameFor(packageName) {
  let name = packageName.replace(/^@[^/]+\//, "");

  return name.includes("-") ? name : `${name}-element`;
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

  let tagName = tagNameFor(project.desires.name);

  for (let file of ["src/register.ts", "src/register.js", "README.md"]) {
    await replaceInFile(project, file, TEMPLATE_TAG_NAME, tagName);
  }
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
 * published from this repo; the generated library exists to be published,
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
 * - point the build at the emitted `.js` entries
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
 * No declarations are emitted for a JavaScript library, so the `types`
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
 * Rewrites the tsdown config so it builds the JavaScript entries and stops
 * emitting declarations (defineConfig defaults to `dts: true`).
 *
 * @param {import('#utils/project.js').Project} project
 */
async function pointBuildAtJavaScript(project) {
  let configPath = project.path("tsdown.config.js");
  let contents = await readFile(configPath, "utf-8");

  contents = contents.replace(
    `entry: ["./src/index.ts", "./src/register.ts"],`,
    `entry: ["./src/index.js", "./src/register.js"],\n  dts: false,`,
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
 * The base doesn't emit a babel.config.js, but this can run over an
 * existing project that has one -- and a JavaScript project's config
 * must not reference the TS plugin.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  if (await project.hasOrWantsLayer("typescript")) return;
  if (!project.hasFile("babel.config.js")) return;

  await removeConfiguredPlugin(project, "@babel/plugin-transform-typescript");
}

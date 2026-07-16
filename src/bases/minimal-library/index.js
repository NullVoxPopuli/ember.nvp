import { packageJson } from "ember-apply";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLatest } from "#utils/npm.js";
import { applyFolderTo } from "#utils/fs.js";
import { removeConfiguredPlugin } from "#utils/babel.js";

/**
 * Minimal Library Base
 *
 * Provides the absolute bare minimum for an Ember v2 library (addon):
 * - type: "module" in package.json
 * - built with tsdown + @nullvoxpopuli/ember-rolldown
 * - a sample `<template>` component and a plain module
 * - No babel.config.js: @nullvoxpopuli/ember-rolldown's built-in default
 *   babel config covers TS stripping, template compilation, and decorators
 * - No testing framework
 * - No linting or formatting
 *
 * Testing, linting, formatting, etc. are opt-in via layers.
 */
export default {
  label: "Minimal Library Base",
  description: "Bare minimum Ember v2 library (addon) structure",

  /**
   * 1. Apply files
   *   a. Remove TS if needed
   * 2. Update name(s)
   * 3. Remove TS deps/files/config if needed
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
 * When the project is JavaScript (no typescript layer), remove the TS
 * toolchain, drop the tsconfig, and point the build at the emitted `.js`
 * entry (declarations can't be produced without types).
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
 * Rewrites the tsdown config so it builds the JavaScript entry and stops
 * emitting declarations.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function pointBuildAtJavaScript(project) {
  let configPath = project.path("tsdown.config.js");
  let contents = await readFile(configPath, "utf-8");

  contents = contents
    .replace("./src/index.ts", "./src/index.js")
    .replace("dts: true", "dts: false");

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

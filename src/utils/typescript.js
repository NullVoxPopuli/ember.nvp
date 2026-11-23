import { packageJson } from "ember-apply";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hasConfiguredTSBabel, prependPlugin } from "#utils/babel.js";
import { getLatest } from "#utils/npm.js";

const bases = join(import.meta.dirname, "../bases");
const appBase = join(bases, "minimal-app/files");
const extensionBase = join(bases, "minimal-extension/files");
const libraryBase = join(bases, "minimal-library/files");
const customElementBase = join(bases, "minimal-custom-element/files");
const widgetBase = join(bases, "minimal-widget/files");

/**
 * TypeScript 7 has no JavaScript API.
 *
 * typescript-eslint imports `typescript`, so it keeps using TypeScript 6.
 *
 * `@typescript/typescript6` is TypeScript 6 with a `tsc6` bin,
 * so `tsc` stays TypeScript 7.
 */
export const TYPESCRIPT_6 = "npm:@typescript/typescript6@^6.0.2";

/**
 * Content mappers (for .gts and .gjs) need 7.1 or newer.
 */
export const TYPESCRIPT_7 = "npm:typescript@^7.1.0-0";

/**
 * @param {Record<string, any>} manifest
 * @returns {boolean}
 */
export function hasTypeScript6(manifest) {
  let spec = manifest.devDependencies?.typescript;

  return typeof spec === "string" && spec.startsWith("npm:@typescript/typescript6@");
}

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {boolean}
 */
export function wantsTypeScript7(project) {
  return project.wantsLayer("typescript") && project.getLayerOptions("typescript").version === "7";
}

/**
 * Reads the manifest instead of asking the typescript layer.
 * That layer's isSetup asks about eslint, and the eslint layers ask about TypeScript 7.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {Record<string, any>} manifest
 * @returns {boolean}
 */
export function usesTypeScript7(project, manifest) {
  return wantsTypeScript7(project) || Boolean(manifest.devDependencies?.["@typescript/native"]);
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {Record<string, any>} manifest
 * @returns {boolean}
 */
export function needsTypeScript6(project, manifest) {
  return project.wantsLayer("eslint") || Boolean(manifest.devDependencies?.eslint);
}

/**
 * In a TypeScript 7 project:
 * - keeps `@typescript/typescript6`
 * - adds it when eslint needs TypeScript 6
 * - removes any other `typescript`, because it would be a second `tsc`
 *
 * @param {import('#utils/project.js').Project} project
 */
export async function syncTypeScript6(project) {
  let manifest = await packageJson.read(project.directory);

  if (!usesTypeScript7(project, manifest)) return;
  if (hasTypeScript6(manifest)) return;

  if (needsTypeScript6(project, manifest)) {
    await packageJson.addDevDependencies(
      await getLatest({ typescript: TYPESCRIPT_6 }),
      project.directory,
    );
    return;
  }

  await packageJson.removeDevDependencies(["typescript"], project.directory);
}

/**
 * Copies the base's tsconfig, unless the project already has one.
 *
 * @param {import('#utils/project.js').Project} project
 */
export async function addTSConfig(project) {
  if (existsSync(project.path("tsconfig.json"))) {
    return;
  }

  if (project.type === "app") {
    await cp(join(appBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "extension") {
    await cp(join(extensionBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "library") {
    await cp(join(libraryBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "custom-element") {
    await cp(join(customElementBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "widget") {
    await cp(join(widgetBase, "tsconfig.json"), project.path("tsconfig.json"));
  }
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function updateBabelConfig(project) {
  if (!project.hasFile("babel.config.js")) {
    // Nothing to patch (libraries): ember() strips types.
    return;
  }

  if (await hasConfiguredTSBabel(project)) {
    return;
  }

  await prependPlugin(
    project,
    `[
      "@babel/plugin-transform-typescript",
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ]`,
  );
}

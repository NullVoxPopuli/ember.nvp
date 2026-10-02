import { existsSync, globSync } from "node:fs";
import { join, sep } from "node:path";
import { readJSON } from "#utils/fs.js";

/**
 * @typedef {object} Dependency
 * @property {string} name
 * @property {Record<string, any>} manifest
 */

/**
 * Packages with the shape of a v1 addon that work without ember-cli
 */
const WORKS_WITHOUT_EMBER_CLI = new Set(["@embroider/macros"]);

/**
 * ember-cli runs v1 addons as part of its build.
 * ember.nvp builds without ember-cli, so a v1 addon never loads.
 *
 * @param {Record<string, any>} manifest
 */
export function isV1Addon(manifest) {
  return (
    Boolean(manifest.keywords?.includes("ember-addon")) &&
    manifest["ember-addon"]?.version !== 2 &&
    !WORKS_WITHOUT_EMBER_CLI.has(manifest.name)
  );
}

/**
 * The manifests of the dependencies that are installed in the project.
 *
 * A migration decides from the project's own files.
 * An install is extra: when there is one, it tells which dependencies are v1 addons,
 * and which modules the addons add to an app.
 *
 * Only the top level of node_modules is read.
 * Every package manager puts a project's direct dependencies there.
 *
 * @param {string} directory the project
 * @param {Record<string, string>} dependencies the dependencies to look for, by name
 * @returns {Dependency[]} empty when the project has no node_modules
 */
export function installedDependencies(directory, dependencies) {
  let modules = join(directory, "node_modules");

  if (!existsSync(modules)) return [];

  /** @type {Dependency[]} */
  let found = [];

  for (let folder of globSync(["*", "@*/*"], { cwd: modules })) {
    let name = folder.split(sep).join("/");

    if (!(name in dependencies)) continue;

    let manifest = readJSON(join(modules, folder, "package.json"));

    if (manifest) found.push({ name, manifest });
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {Dependency[]} dependencies
 * @returns {string[]} such as `ember-power-select@6.0.1`
 */
export function v1AddonsIn(dependencies) {
  /** @type {string[]} */
  let v1 = [];

  for (let { name, manifest } of dependencies) {
    if (isV1Addon(manifest)) v1.push(`${name}@${manifest.version}`);
  }

  return v1;
}

/**
 * @typedef {object} AppModule
 * @property {string} addon the package that provides it
 * @property {string} path such as `services/session`
 * @property {string | undefined} specifier the module to import it from
 */

/**
 * Modules that v2 addons merge into an app through `ember-addon.app-js`.
 *
 * `@embroider/compat` merges them.
 * An ember.nvp app does not, so the app must register the ones it looks up by name.
 *
 * @param {Dependency[]} dependencies
 * @returns {AppModule[]}
 */
export function appModulesIn(dependencies) {
  /** @type {AppModule[]} */
  let modules = [];

  for (let { name, manifest } of dependencies) {
    let appJs = manifest["ember-addon"]?.["app-js"] ?? {};

    for (let [appPath, file] of Object.entries(appJs)) {
      modules.push({
        addon: name,
        path: appPath.replace(/^\.\//, "").replace(/\.\w+$/, ""),
        specifier: exportedAs(name, manifest, String(file)),
      });
    }
  }

  return modules;
}

/**
 * The specifier that reaches `target` through the package's `exports`.
 *
 *   exports: { "./*": "./dist/*.js" }, target: ./dist/_app_/services/x.js
 *     → pkg/_app_/services/x
 *
 * @param {string} name
 * @param {Record<string, any>} manifest
 * @param {string} target a file in the package, such as `./dist/_app_/services/x.js`
 * @returns {string | undefined}
 */
function exportedAs(name, manifest, target) {
  let exports = manifest.exports;

  if (!exports) return `${name}/${target.replace(/^\.\//, "")}`;
  if (typeof exports !== "object") return;

  for (let [key, value] of Object.entries(exports)) {
    let path = typeof value === "string" ? value : (value?.import ?? value?.default);

    if (typeof path !== "string" || typeof key !== "string") continue;

    if (!path.includes("*")) {
      if (path === target) return `${name}/${key.replace(/^\.\//, "")}`;
      continue;
    }

    let [before = "", after = ""] = path.split("*");

    if (
      target.startsWith(before) &&
      target.endsWith(after) &&
      target.length >= before.length + after.length
    ) {
      let matched = target.slice(before.length, target.length - after.length);

      return `${name}/${key.replace(/^\.\//, "").replace("*", matched)}`;
    }
  }
}

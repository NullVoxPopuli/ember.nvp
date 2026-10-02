import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  importedNames,
  parseProgram,
  propertyValue,
  sourceOf,
  stringArray,
  stringValue,
  walk,
} from "../../javascript.js";

/**
 * Rollup plugins whose work the tsdown build does by itself
 */
const REPLACED_PLUGINS = new Set([
  "@embroider/addon-dev/rollup",
  "@rollup/plugin-babel",
  "rollup-plugin-glimmer-template-tag",
  "rollup-plugin-ts",
  "@rollup/plugin-typescript",
  "rollup-plugin-delete",
]);

/**
 * `@embroider/addon-dev` plugins whose work the tsdown build does by itself
 */
const REPLACED_ADDON_METHODS = new Set([
  "dependencies",
  "hbs",
  "gjs",
  "clean",
  "declarations",
  "keepAssets",
  "output",
]);

/**
 * What a rollup.config asks of `@embroider/addon-dev`
 *
 * @typedef {object} RollupSetup
 * @property {string} srcDir
 * @property {string} destDir
 * @property {string[]} publicEntrypoints globs for built files, relative to `destDir`
 * @property {boolean} unreadEntrypoints whether `publicEntrypoints` was not a list of strings
 * @property {string[] | undefined} appReexports globs for built files, relative to `destDir`
 * @property {string | undefined} appReexportsOptions the source of the options argument
 * @property {string | undefined} publicAssets the source of the `publicAssets` call
 * @property {string | undefined} babelConfig the babel config file that the build reads, when the config names one
 * @property {string[]} otherPlugins the source of each plugin that the tsdown build does not replace
 */

/**
 * @param {string} root
 * @param {string} file relative to `root`
 * @returns {RollupSetup | undefined} undefined when the config has no `new Addon(...)`
 */
export function readRollupConfig(root, file) {
  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  let imports = importedNames(program);

  /** @type {RollupSetup} */
  let setup = {
    srcDir: "src",
    destDir: "dist",
    publicEntrypoints: ["**/*.js"],
    unreadEntrypoints: false,
    appReexports: undefined,
    appReexportsOptions: undefined,
    publicAssets: undefined,
    babelConfig: babelConfigNamedIn(source),
    otherPlugins: [],
  };

  /** @type {string | undefined} */
  let addonName;

  walk(program, (node, parent) => {
    if (node.type !== "NewExpression" || node.callee?.type !== "Identifier") return;
    if (imports.get(node.callee.name) !== "@embroider/addon-dev/rollup") return;

    let options = node.arguments?.[0];

    setup.srcDir = stringValue(propertyValue(options, "srcDir")) ?? setup.srcDir;
    setup.destDir = stringValue(propertyValue(options, "destDir")) ?? setup.destDir;

    if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
      addonName = parent.id.name;
    }
  });

  if (!addonName) return;

  let plugins = pluginsArray(program);

  for (let plugin of plugins?.elements ?? []) {
    if (!plugin) continue;

    let method = addonMethod(plugin, addonName);

    if (method === "publicEntrypoints") {
      let globs = stringArray(plugin.arguments?.[0]);

      setup.publicEntrypoints = globs ?? setup.publicEntrypoints;
      setup.unreadEntrypoints = !globs;
      continue;
    }

    if (method === "appReexports") {
      setup.appReexports = stringArray(plugin.arguments?.[0]) ?? ["**/*.js"];

      let options = plugin.arguments?.[1];

      setup.appReexportsOptions = options ? sourceOf(source, options) : undefined;
      continue;
    }

    if (method === "publicAssets") {
      setup.publicAssets = sourceOf(source, plugin);
      continue;
    }

    if (method && REPLACED_ADDON_METHODS.has(method)) continue;

    let callee = plugin.type === "CallExpression" ? plugin.callee : undefined;
    let from = callee?.type === "Identifier" ? imports.get(callee.name) : undefined;

    if (from && REPLACED_PLUGINS.has(from)) continue;

    setup.otherPlugins.push(sourceOf(source, plugin).replace(/\s+/g, " "));
  }

  return setup;
}

/**
 * @param {import('../../javascript.js').Node} program
 * @returns {import('../../javascript.js').Node | undefined} the first `plugins: [...]` array
 */
function pluginsArray(program) {
  /** @type {import('../../javascript.js').Node | undefined} */
  let found;

  walk(program, (node) => {
    if (found || node.type !== "ObjectExpression") return;

    let plugins = propertyValue(node, "plugins");

    if (plugins?.type === "ArrayExpression") found = plugins;
  });

  return found;
}

/**
 * @param {import('../../javascript.js').Node} node
 * @param {string} addonName
 * @returns {string | undefined} `hbs` for `addon.hbs()`
 */
function addonMethod(node, addonName) {
  if (node.type !== "CallExpression") return;

  let callee = node.callee;

  if (callee?.type !== "MemberExpression") return;
  if (callee.object?.type !== "Identifier" || callee.object.name !== addonName) return;

  return callee.property?.name;
}

/**
 * The blueprint names the config with a path:
 *
 *   const babelConfig = resolve(rootDirectory, './babel.publish.config.cjs');
 *
 * @param {string} source
 * @returns {string | undefined}
 */
function babelConfigNamedIn(source) {
  let match =
    /["'`](?:\.\/)?((?:config\/)?babel(?:\.publish)?\.config\.(?:c|m)?js(?:on)?)["'`]/.exec(source);

  return match?.[1];
}

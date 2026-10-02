import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  importedNames,
  parseProgram,
  propertyNames,
  propertyValue,
  sourceOf,
  walk,
} from "./javascript.js";

export const EMBER_CLI_BUILD = ["ember-cli-build.js", "ember-cli-build.mjs", "ember-cli-build.cjs"];

/**
 * Modules that an ember-cli-build imports to build the way the blueprints do
 */
const BLUEPRINT_IMPORTS = new Set([
  "ember-cli/lib/broccoli/ember-app",
  "ember-cli/lib/broccoli/ember-app.js",
  "@embroider/compat",
  "@embroider/vite",
  "@embroider/webpack",
  "@embroider/test-setup",
  "@warp-drive/core/build-config",
  "@warp-drive/build-config",
  "@ember-data/private-build-infra",
  "node:path",
  "node:url",
  "path",
  "url",
]);

/**
 * `new EmberApp(defaults, { ... })` options that only tune the ember-cli build.
 * Vite does the same work by itself.
 */
const BUILD_ONLY_OPTIONS = new Set([
  "ember-cli-babel",
  "ember-cli-terser",
  "ember-cli-uglify",
  "ember-data",
  "emberData",
  "fingerprint",
  "hinting",
  "minifyCSS",
  "minifyJS",
  "sourcemaps",
  "SRI",
  "storeConfigInMeta",
  "tests",
]);

/**
 * `compatBuild(app, packager, { ... })` options that do nothing without `@embroider/compat`
 */
const COMPAT_ONLY_OPTIONS = new Set([
  "allowUnsafeDynamicComponents",
  "skipBabel",
  "staticAddonTestSupportTrees",
  "staticAddonTrees",
  "staticComponents",
  "staticEmberSource",
  "staticHelpers",
  "staticInvokables",
  "staticModifiers",
]);

/**
 * @typedef {object} EmberCliBuild
 * @property {string} file
 * @property {string[]} options `new EmberApp(...)` options that change what the app does
 * @property {string[]} compatOptions `compatBuild(...)` options that change what the app does
 * @property {string[]} imports modules beyond the ones that the blueprints import
 * @property {string[]} appImports the source of each `app.import(...)` call
 * @property {{ from: string, options: string } | undefined} warpDrive the `setConfig(app, dir, options)` call
 * @property {boolean} usesVite whether the build runs through `@embroider/vite`
 */

/**
 * @param {string} root
 * @param {string} file relative to `root`
 * @returns {EmberCliBuild | undefined} undefined when the file does not parse
 */
export function readEmberCliBuild(root, file) {
  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  let imports = importedNames(program);
  let modules = new Set(imports.values());

  /** @type {EmberCliBuild} */
  let build = {
    file,
    options: [],
    compatOptions: [],
    imports: [],
    appImports: [],
    warpDrive: undefined,
    usesVite: modules.has("@embroider/vite"),
  };

  for (let module of modules) {
    if (!BLUEPRINT_IMPORTS.has(module)) build.imports.push(module);
  }

  walk(program, (node) => {
    if (node.type === "NewExpression" && node.callee?.type === "Identifier") {
      let from = imports.get(node.callee.name) ?? "";

      if (!from.startsWith("ember-cli/lib/broccoli/ember-app")) return;

      for (let name of propertyNames(node.arguments?.[1])) {
        if (!BUILD_ONLY_OPTIONS.has(name)) build.options.push(name);
      }

      return;
    }

    if (node.type !== "CallExpression") return;

    let callee = node.callee;

    if (callee?.type === "MemberExpression" && callee.property?.name === "import") {
      build.appImports.push(sourceOf(source, node).replace(/\s+/g, " "));
      return;
    }

    if (callee?.type !== "Identifier") return;

    let from = imports.get(callee.name);

    if (callee.name === "compatBuild") {
      for (let name of propertyNames(node.arguments?.[2])) {
        if (!COMPAT_ONLY_OPTIONS.has(name)) build.compatOptions.push(name);
      }
    }

    if (callee.name === "setConfig" && from && /build-config|private-build-infra/.test(from)) {
      let options = node.arguments?.[2];

      build.warpDrive = {
        from,
        options: options ? sourceOf(source, options) : "{}",
      };
    }
  });

  return build;
}

/**
 * @param {EmberCliBuild} build
 * @returns {string[]} everything that `readEmberCliBuild` found which ember.nvp cannot carry over
 */
export function unsupportedIn(build) {
  /** @type {string[]} */
  let found = [];

  for (let option of build.options) found.push(`${build.file}: new EmberApp option "${option}"`);
  for (let option of build.compatOptions)
    found.push(`${build.file}: compatBuild option "${option}"`);
  for (let module of build.imports) found.push(`${build.file}: imports ${module}`);
  for (let call of build.appImports) found.push(`${build.file}: ${call}`);

  return found;
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {string[] | undefined} the paths below `ENV` that `config/environment.js` sets, such as `APP.rootElement`
 */
export function readEnvironmentKeys(root, file) {
  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  /** @type {Set<string>} */
  let keys = new Set();

  walk(program, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.name === "ENV") {
      collectKeys(node.init, "", keys);
    }

    if (node.type === "AssignmentExpression" && node.left?.type === "MemberExpression") {
      let path = memberPath(node.left);

      if (path?.startsWith("ENV.")) {
        keys.add(path.slice("ENV.".length));
        collectKeys(node.right, path.slice("ENV.".length) + ".", keys);
      }
    }
  });

  return Array.from(keys);
}

/**
 * @param {import('./javascript.js').Node | undefined} node
 * @param {string} prefix
 * @param {Set<string>} keys
 */
function collectKeys(node, prefix, keys) {
  if (node?.type !== "ObjectExpression") return;

  for (let property of node.properties ?? []) {
    let [name] = propertyNames({ type: "ObjectExpression", properties: [property] });

    if (!name || name === "...") continue;

    keys.add(prefix + name);
    collectKeys(property.value, `${prefix}${name}.`, keys);
  }
}

/**
 * @param {import('./javascript.js').Node} node
 * @returns {string | undefined} `ENV.APP.foo` for `ENV.APP.foo` and `ENV['APP'].foo`
 */
function memberPath(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression") return;

  let object = memberPath(node.object);
  let property = node.computed
    ? node.property?.type === "Literal"
      ? String(node.property.value)
      : undefined
    : node.property?.name;

  if (!object || property === undefined) return;

  return `${object}.${property}`;
}

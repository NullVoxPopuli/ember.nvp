import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseProgram, propertyValue, sourceOf, stringValue, walk } from "./javascript.js";

/**
 * Babel plugins whose work ember-rolldown's defaults already do for a library:
 * TypeScript, templates to `precompileTemplate`, and decorators.
 */
const COVERED_BY_EMBER_ROLLDOWN = new Set([
  "@babel/plugin-transform-typescript",
  "babel-plugin-ember-template-compilation",
  "decorator-transforms",
  "@babel/plugin-proposal-decorators",
  "@babel/plugin-proposal-class-properties",
  "@babel/plugin-transform-class-properties",
  "@babel/plugin-transform-class-static-block",
  "@babel/plugin-proposal-private-methods",
  "@babel/plugin-transform-private-methods",
  "@embroider/addon-dev/template-colocation-plugin",
  "ember-template-imports/src/babel-plugin",
]);

/**
 * Babel presets whose work ember-rolldown's defaults already do
 */
const PRESETS_COVERED_BY_EMBER_ROLLDOWN = new Set(["@babel/preset-typescript"]);

/**
 * @typedef {object} BabelConfig
 * @property {string[]} plugins every plugin name that the config lists
 * @property {boolean} hasCode whether plugins also come from code that cannot be read statically,
 *   such as `...macros.babelMacros`
 * @property {string[]} presets every preset name that the config lists
 * @property {string[]} templateTransforms the source of each AST transform that the template compiler runs
 */

/**
 * @param {string} root
 * @param {string} file relative to `root`
 * @returns {BabelConfig | undefined} undefined when the file is missing or does not parse
 */
export function readBabelConfig(root, file) {
  let path = join(root, file);

  if (!existsSync(path)) return;

  let source = readFileSync(path, "utf-8");

  if (file.endsWith(".json") || file.endsWith(".babelrc")) {
    return fromJSON(source);
  }

  return fromJavaScript(source, file);
}

/**
 * @param {string} source
 * @returns {BabelConfig | undefined}
 */
function fromJSON(source) {
  /** @type {any} */
  let json;

  try {
    json = JSON.parse(source);
  } catch {
    return;
  }

  /** @type {string[]} */
  let plugins = [];
  /** @type {string[]} */
  let templateTransforms = [];

  for (let entry of json.plugins ?? []) {
    let [name, options] = Array.isArray(entry) ? entry : [entry];

    if (typeof name !== "string") continue;

    plugins.push(name);

    if (name === "babel-plugin-ember-template-compilation") {
      for (let transform of options?.transforms ?? []) {
        templateTransforms.push(JSON.stringify(transform));
      }
    }
  }

  /** @type {string[]} */
  let presets = [];

  for (let entry of json.presets ?? []) {
    let [name] = Array.isArray(entry) ? entry : [entry];

    if (typeof name === "string") presets.push(name);
  }

  return { plugins, presets, hasCode: false, templateTransforms };
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {BabelConfig | undefined}
 */
function fromJavaScript(source, file) {
  let program = parseProgram(source, file);

  if (!program) return;

  /** @type {BabelConfig} */
  let config = { plugins: [], presets: [], hasCode: false, templateTransforms: [] };

  walk(program, (node) => {
    if (node.type !== "ObjectExpression") return;

    let plugins = withoutFilter(propertyValue(node, "plugins"));
    let presets = propertyValue(node, "presets");

    if (presets?.type === "ArrayExpression") {
      for (let element of presets.elements ?? []) {
        let entry = element?.type === "ArrayExpression" ? element.elements?.[0] : element;

        config.presets.push(pluginName(entry) ?? "...");
      }
    }

    if (plugins?.type !== "ArrayExpression") return;

    for (let element of plugins.elements ?? []) {
      let entry = element?.type === "ArrayExpression" ? element.elements?.[0] : element;
      let name = pluginName(entry);

      if (name === undefined) {
        config.hasCode = true;
        continue;
      }

      config.plugins.push(name);

      let options = element?.type === "ArrayExpression" ? element.elements?.[1] : undefined;
      let transforms = propertyValue(options, "transforms");

      if (
        name === "babel-plugin-ember-template-compilation" &&
        transforms?.type === "ArrayExpression"
      ) {
        for (let transform of transforms.elements ?? []) {
          if (transform) config.templateTransforms.push(sourceOf(source, transform));
        }
      }
    }
  });

  if (config.plugins.length === 0 && /plugins\s*:/.test(source)) {
    config.hasCode = true;
  }

  return config;
}

/**
 * @param {import('./javascript.js').Node | undefined} node
 * @returns {string | undefined} `x` for `"x"`, `require.resolve("x")`, and `import.meta.resolve("x")`
 */
function pluginName(node) {
  let name = stringValue(node);

  if (name !== undefined) return name;

  if (node?.type === "CallExpression" && node.callee?.property?.name === "resolve") {
    return stringValue(node.arguments?.[0]);
  }
}

/**
 * @param {import('./javascript.js').Node | undefined} node
 * @returns {import('./javascript.js').Node | undefined} the array in `[...].filter(Boolean)`
 */
function withoutFilter(node) {
  if (node?.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    return node.callee.object;
  }

  return node;
}

/**
 * @param {BabelConfig} config
 * @returns {string[]} what the config does beyond ember-rolldown's defaults
 */
export function beyondEmberRolldown(config) {
  /** @type {string[]} */
  let extra = [];

  for (let plugin of config.plugins) {
    if (!COVERED_BY_EMBER_ROLLDOWN.has(plugin.replace(/^module:/, ""))) extra.push(plugin);
  }

  for (let preset of config.presets) {
    if (!PRESETS_COVERED_BY_EMBER_ROLLDOWN.has(preset)) extra.push(`preset ${preset}`);
  }
  if (config.templateTransforms.length > 0) extra.push("template transforms");
  if (config.hasCode) extra.push("plugins from code");

  return extra;
}

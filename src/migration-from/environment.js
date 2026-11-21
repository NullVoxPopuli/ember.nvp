import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseProgram, propertyNames, sourceOf, stringValue, walk } from "./javascript.js";

/** @typedef {import('./javascript.js').Node} Node */

/**
 * @typedef {object} EnvironmentSettings
 * @property {string[]} properties the app's own properties of the `ENV` literal, as source
 * @property {Record<"all" | "development" | "test" | "production", string[]>} statements
 *   the app's own statements, by the environment that ran them, with `ENV` as the name of the config
 * @property {string[]} variables the `process.env` names that the settings read
 * @property {string[]} unreadable code that the migration cannot move
 */

/**
 * @param {Node} node
 * @param {string} parameter the name of the function's environment parameter
 * @returns {string | undefined} `development` for `environment === "development"`, either way round
 */
function environmentTest(node, parameter) {
  if (node?.type !== "BinaryExpression" || !/^[!=]==?$/.test(node.operator)) return;
  if (node.operator.startsWith("!")) return;

  let [name, value] =
    node.left?.type === "Identifier" ? [node.left, node.right] : [node.right, node.left];

  if (name?.type !== "Identifier" || name.name !== parameter) return;

  return stringValue(value);
}

/**
 * @param {Node} node
 * @returns {string | undefined} `ENV.a.b` for `ENV.a.b` and `ENV["a"].b`
 */
function memberPath(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type !== "MemberExpression") return;

  let object = memberPath(node.object);
  let property = node.computed ? stringValue(node.property) : node.property?.name;

  return object && property ? `${object}.${property}` : undefined;
}

/**
 * The app's own settings in config/environment.js, which ember.nvp apps keep in app/config.
 * Settings that the base's config covers, or that only ember-cli reads, are left out.
 *
 * @param {string} root
 * @param {string} file
 * @param {(key: string) => boolean} known
 * @returns {EnvironmentSettings | undefined} undefined when the file does not parse
 */
export function readEnvironmentSettings(root, file, known) {
  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  /** @type {EnvironmentSettings} */
  let settings = {
    properties: [],
    statements: { all: [], development: [], test: [], production: [] },
    variables: [],
    unreadable: [],
  };
  /** @type {Node | undefined} */
  let body;
  let parameter = "environment";

  walk(program, (node) => {
    if (body) return;
    if (node.type !== "FunctionExpression" && node.type !== "ArrowFunctionExpression") return;

    body = node.body?.body;
    parameter = node.params?.[0]?.name ?? parameter;
  });

  if (!Array.isArray(body)) {
    settings.unreadable.push(`${file}: ember.nvp cannot read this file`);
    return settings;
  }

  /**
   * @param {Node} node
   * @param {keyof EnvironmentSettings["statements"]} environment
   */
  let take = (node, environment) => {
    /** @type {string[]} */
    let paths = [];
    let foreign = false;

    walk(node, (child, parent) => {
      if (child.type === "MemberExpression" && memberPath(child)?.startsWith("ENV.")) {
        if (parent?.type !== "MemberExpression") paths.push(String(memberPath(child)));
      }

      if (
        child.type === "Identifier" &&
        !["ENV", "process", "undefined"].includes(child.name) &&
        !(parent?.type === "MemberExpression" && parent.property === child && !parent.computed) &&
        !(parent?.type === "Property" && parent.key === child)
      ) {
        foreign = true;
      }
    });

    let own = paths.filter((path) => !known(path.slice("ENV.".length)));

    if (own.length === 0) return;

    if (foreign || own.length !== paths.length) {
      settings.unreadable.push(`${file}: ${sourceOf(source, node).split("\n")[0]}`);
      return;
    }

    settings.statements[environment].push(fromViteEnv(sourceOf(source, node)));
  };

  /**
   * @param {string} code
   */
  let fromViteEnv = (code) =>
    code.replace(/\bprocess\.env\.(\w+)/g, (_, name) => {
      if (!settings.variables.includes(name)) settings.variables.push(name);
      return `import.meta.env.VITE_${name}`;
    });

  for (let statement of body) {
    if (statement.type === "ReturnStatement") continue;

    if (statement.type === "VariableDeclaration") {
      let declarator = statement.declarations?.[0];

      if (declarator?.id?.name !== "ENV" || declarator.init?.type !== "ObjectExpression") {
        settings.unreadable.push(`${file}: ${sourceOf(source, statement).split("\n")[0]}`);
        continue;
      }

      for (let property of declarator.init.properties ?? []) {
        let [name] = propertyNames({ type: "ObjectExpression", properties: [property] });

        if (name && !known(name)) settings.properties.push(fromViteEnv(sourceOf(source, property)));
      }

      continue;
    }

    let environment =
      statement.type === "IfStatement" && environmentTest(statement.test, parameter);

    if (environment && !statement.alternate && environment in settings.statements) {
      let consequent = statement.consequent?.body ?? [statement.consequent];

      for (let inner of consequent) {
        take(inner, /** @type {keyof EnvironmentSettings["statements"]} */ (environment));
      }

      continue;
    }

    take(statement, "all");
  }

  return settings;
}

import { parse } from "ember-estree";

/**
 * An ESTree node.
 *
 * ember-estree types every property as `unknown`,
 * and these helpers read many shapes of config files.
 *
 * @typedef {{ type: string, start?: number, end?: number, [key: string]: any }} Node
 */

/**
 * @param {string} source
 * @param {string} filePath decides the parser: `.ts` parses TypeScript
 * @returns {Node | undefined} the Program, or undefined when the file does not parse
 */
export function parseProgram(source, filePath) {
  try {
    let file = /** @type {Node} */ (parse(source, { filePath }));

    return /** @type {Node} */ (file.program ?? file);
  } catch {
    return undefined;
  }
}

/**
 * Calls `visit` for every node below `node`, parents first.
 *
 * @param {unknown} node
 * @param {(node: Node, parent: Node | undefined) => void} visit
 * @param {Node} [parent]
 */
export function walk(node, visit, parent) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (let child of node) walk(child, visit, parent);
    return;
  }

  let astNode = /** @type {Node} */ (node);

  if (typeof astNode.type !== "string") return;

  visit(astNode, parent);

  for (let [key, value] of Object.entries(astNode)) {
    if (key === "loc" || key === "range" || key === "parent") continue;

    walk(value, visit, astNode);
  }
}

/**
 * @param {unknown} node
 * @returns {string | undefined} the value of a string literal, or of a template literal without expressions
 */
export function stringValue(node) {
  let astNode = /** @type {Node | undefined} */ (node);

  if (!astNode) return;

  if (astNode.type === "Literal" && typeof astNode.value === "string") {
    return astNode.value;
  }

  if (astNode.type === "StringLiteral") {
    return /** @type {string} */ (astNode.value);
  }

  if (astNode.type === "TemplateLiteral" && astNode.expressions?.length === 0) {
    return astNode.quasis?.[0]?.value?.cooked;
  }
}

/**
 * @param {unknown} node
 * @returns {string[] | undefined} the values of an array of string literals
 */
export function stringArray(node) {
  let astNode = /** @type {Node | undefined} */ (node);

  if (astNode?.type !== "ArrayExpression") return;

  /** @type {string[]} */
  let result = [];

  for (let element of astNode.elements ?? []) {
    let value = stringValue(element);

    if (value === undefined) return;

    result.push(value);
  }

  return result;
}

/**
 * @param {Node | undefined} node an ObjectExpression
 * @param {string} name
 * @returns {Node | undefined} the value of the property named `name`
 */
export function propertyValue(node, name) {
  if (node?.type !== "ObjectExpression") return;

  for (let property of node.properties ?? []) {
    if (property.type !== "Property" && property.type !== "ObjectProperty") continue;

    let key = property.key;
    let keyName = key?.type === "Identifier" ? key.name : stringValue(key);

    if (keyName === name) return property.value;
  }
}

/**
 * @param {Node | undefined} node an ObjectExpression
 * @returns {string[]} the names of its properties, with `...` for spreads and computed keys
 */
export function propertyNames(node) {
  if (node?.type !== "ObjectExpression") return [];

  /** @type {string[]} */
  let names = [];

  for (let property of node.properties ?? []) {
    let key = property.key;
    let keyName = key?.type === "Identifier" && !property.computed ? key.name : stringValue(key);

    names.push(keyName ?? "...");
  }

  return names;
}

/**
 * Maps each imported (or required) local name to the module it comes from.
 *
 *   import { babel } from '@rollup/plugin-babel';   babel → @rollup/plugin-babel
 *   const EmberApp = require('ember-cli/lib/broccoli/ember-app');
 *
 * @param {Node} program
 * @returns {Map<string, string>}
 */
export function importedNames(program) {
  /** @type {Map<string, string>} */
  let names = new Map();

  walk(program, (node) => {
    if (node.type === "ImportDeclaration") {
      let source = stringValue(node.source);

      if (!source) return;

      for (let specifier of node.specifiers ?? []) {
        names.set(specifier.local.name, source);
      }

      return;
    }

    if (node.type === "VariableDeclarator" && node.init) {
      let source = requiredModule(node.init);

      if (!source) return;

      if (node.id?.type === "Identifier") {
        names.set(node.id.name, source);
      }

      if (node.id?.type === "ObjectPattern") {
        for (let property of node.id.properties ?? []) {
          if (property.value?.type === "Identifier") {
            names.set(property.value.name, source);
          }
        }
      }
    }
  });

  return names;
}

/**
 * @param {Node} node
 * @returns {string | undefined} `x` for `require('x')`, `require('x').y`, and `await import('x')`
 */
function requiredModule(node) {
  let current = node;

  while (current?.type === "MemberExpression" || current?.type === "AwaitExpression") {
    current = current.type === "AwaitExpression" ? current.argument : current.object;
  }

  if (current?.type === "ImportExpression") {
    return stringValue(current.source);
  }

  if (
    current?.type === "CallExpression" &&
    current.callee?.type === "Identifier" &&
    current.callee.name === "require"
  ) {
    return stringValue(current.arguments?.[0]);
  }
}

/**
 * @param {string} source
 * @param {Node} node
 * @returns {string} the node's source text
 */
export function sourceOf(source, node) {
  return source.slice(/** @type {number} */ (node.start), /** @type {number} */ (node.end));
}

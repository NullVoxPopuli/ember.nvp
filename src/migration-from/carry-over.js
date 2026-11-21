import { sourceOf, stringValue, walk } from "./javascript.js";

/** @typedef {import('./javascript.js').Node} Node */

/**
 * Names that a config can use without defining them.
 */
const GLOBALS = new Set(["process", "undefined", "URL", "JSON", "Object", "Array", "Boolean"]);

/**
 * @typedef {object} CarriedCode
 * @property {string} code the source of the node
 * @property {string[]} imports an import declaration for each name that the code takes from a module
 */

/**
 * The code of a plugin entry, and the imports it needs, to move it into a new config file.
 *
 * @param {string} source the old config
 * @param {Node} program the old config, parsed
 * @param {Node} node a plugin entry of the old config
 * @returns {CarriedCode | undefined} undefined when the code uses a name that the old file defines another way
 */
export function carry(source, program, node) {
  let modules = importSpecifiers(program);
  /** @type {Set<string>} */
  let names = new Set();

  walk(node, (child, parent) => {
    if (child.type !== "Identifier") return;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed)
      return;
    if (parent?.type === "Property" && parent.key === child && !parent.computed) return;

    names.add(child.name);
  });

  /** @type {string[]} */
  let imports = [];

  for (let name of names) {
    let declaration = modules.get(name);

    if (declaration) imports.push(declaration);
    else if (!GLOBALS.has(name)) return;
  }

  return { code: sourceOf(source, node), imports };
}

/**
 * @param {Node} program
 * @returns {Map<string, string>} each name that an import declaration binds, and an import of only that name
 */
function importSpecifiers(program) {
  /** @type {Map<string, string>} */
  let result = new Map();

  for (let statement of program.body ?? []) {
    if (statement.type !== "ImportDeclaration") continue;

    let from = stringValue(statement.source);

    for (let specifier of statement.specifiers ?? []) {
      let local = specifier.local.name;

      if (specifier.type === "ImportDefaultSpecifier") {
        result.set(local, `import ${local} from "${from}";`);
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        result.set(local, `import * as ${local} from "${from}";`);
      } else {
        let imported = specifier.imported.name ?? stringValue(specifier.imported);
        let binding = imported === local ? local : `${imported} as ${local}`;

        result.set(local, `import { ${binding} } from "${from}";`);
      }
    }
  }

  return result;
}

/**
 * Adds import declarations after the last import of a file.
 *
 * @param {string} source
 * @param {string[]} imports
 */
export function addImports(source, imports) {
  let missing = Array.from(new Set(imports)).filter((line) => !source.includes(line));

  if (missing.length === 0) return source;

  let lines = source.split("\n");
  let last = lines.findLastIndex((line) => line.startsWith("import "));

  return lines
    .slice(0, last + 1)
    .concat(missing, lines.slice(last + 1))
    .join("\n");
}

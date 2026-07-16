import { toTree, print } from "ember-estree";

export const INSPECTOR_PACKAGE = "@embroider/legacy-inspector-support";

/**
 * The `ember-source-4.12` flavor covers ember-source 4.12 and newer,
 * which includes the ember-source the app base generates with.
 */
export const INSPECTOR_ENTRY = `${INSPECTOR_PACKAGE}/ember-source-4.12`;

const DEFAULT_LOCAL_NAME = "setupInspector";

/**
 * Modules whose default export is the Application (sub)class an app
 * extends. The class extending one of these is where inspector support
 * gets attached.
 */
const APPLICATION_MODULES = new Set(["ember-strict-application-resolver", "@ember/application"]);

/** @typedef {import('ember-estree').ASTNode} ASTNode */

/**
 * @typedef {object} Analysis
 * @property {import('ember-estree').FileNode} tree
 * @property {ASTNode[]} imports every import declaration, in source order
 * @property {ASTNode | null} inspectorImport the import from {@link INSPECTOR_PACKAGE}, if any
 * @property {ASTNode | null} applicationClass the class extending an Application import, if any
 * @property {ASTNode | null} field the `inspector` class member on that class, if any
 */

/**
 * @param {unknown} value
 * @returns {ASTNode | null}
 */
function asNode(value) {
  return value && typeof value === "object" ? /** @type {ASTNode} */ (value) : null;
}

/**
 * @param {ASTNode | null} node
 * @returns {string | null} the module specifier of an import declaration
 */
function importSource(node) {
  let source = asNode(node?.source);

  if (source?.type !== "Literal") return null;

  return typeof source.value === "string" ? source.value : null;
}

/**
 * @param {ASTNode} node an import declaration
 * @returns {ASTNode[]}
 */
function importSpecifiers(node) {
  return Array.isArray(node.specifiers) ? /** @type {ASTNode[]} */ (node.specifiers) : [];
}

/**
 * @param {ASTNode | null} node
 * @returns {string | null} the identifier's name
 */
function identifierName(node) {
  if (node?.type !== "Identifier") return null;

  return typeof node.name === "string" ? node.name : null;
}

/**
 * @param {ASTNode} classNode
 * @returns {ASTNode[]} the class's members
 */
function classMembers(classNode) {
  let body = asNode(classNode.body);
  let members = body?.body;

  return Array.isArray(members) ? /** @type {ASTNode[]} */ (members) : [];
}

/**
 * @param {string} code
 * @param {string} filePath
 * @returns {Analysis}
 */
function analyze(code, filePath) {
  /** @type {ASTNode[]} */
  let imports = [];
  /** @type {ASTNode[]} */
  let classes = [];

  // (not templateOnly, so this is always a FileNode)
  let tree = /** @type {import('ember-estree').FileNode} */ (
    toTree(code, {
      filePath,
      visitors: {
        ImportDeclaration: (node) => imports.push(node),
        ClassDeclaration: (node) => classes.push(node),
        ClassExpression: (node) => classes.push(node),
      },
    })
  );

  /** @type {Set<string>} */
  let applicationLocals = new Set();
  /** @type {ASTNode | null} */
  let inspectorImport = null;

  for (let node of imports) {
    let source = importSource(node);

    if (source === null) continue;

    if (APPLICATION_MODULES.has(source)) {
      for (let specifier of importSpecifiers(node)) {
        let local = identifierName(asNode(specifier.local));

        if (local) applicationLocals.add(local);
      }
    }

    if (source === INSPECTOR_PACKAGE || source.startsWith(`${INSPECTOR_PACKAGE}/`)) {
      inspectorImport ??= node;
    }
  }

  let applicationClass =
    classes.find((node) => {
      let superClass = identifierName(asNode(node.superClass));

      return superClass !== null && applicationLocals.has(superClass);
    }) ?? null;

  let field = applicationClass
    ? (classMembers(applicationClass).find(
        (member) =>
          !member.static && !member.computed && identifierName(asNode(member.key)) === "inspector",
      ) ?? null)
    : null;

  return { tree, imports, inspectorImport, applicationClass, field };
}

/**
 * @param {string} name
 * @returns {ASTNode}
 */
function identifier(name) {
  return { type: "Identifier", name };
}

/**
 * @param {string} localName
 * @returns {ASTNode}
 */
function defaultSpecifier(localName) {
  return { type: "ImportDefaultSpecifier", local: identifier(localName) };
}

/**
 * @param {string} localName
 * @returns {ASTNode} `import <localName> from "<INSPECTOR_ENTRY>";`
 */
function inspectorImportNode(localName) {
  return {
    type: "ImportDeclaration",
    specifiers: [defaultSpecifier(localName)],
    source: { type: "Literal", value: INSPECTOR_ENTRY, raw: JSON.stringify(INSPECTOR_ENTRY) },
  };
}

/**
 * @param {string} localName
 * @returns {ASTNode} `inspector = <localName>(this);`
 */
function inspectorFieldNode(localName) {
  return {
    type: "PropertyDefinition",
    static: false,
    computed: false,
    key: identifier("inspector"),
    value: {
      type: "CallExpression",
      callee: identifier(localName),
      arguments: [{ type: "ThisExpression" }],
      optional: false,
    },
  };
}

/**
 * Whether the module already wires inspector support: it imports
 * {@link INSPECTOR_PACKAGE} and its Application class carries the
 * `inspector` member.
 *
 * @param {string} code
 * @param {string} filePath
 * @returns {boolean}
 */
export function hasInspectorSupport(code, filePath) {
  let { inspectorImport, field } = analyze(code, filePath);

  return Boolean(inspectorImport && field);
}

/**
 * Wires ember-inspector support into the module containing the app's
 * Application definition, the way the official app blueprint does:
 *
 * ```ts
 * import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
 *
 * export default class App extends Application {
 *   inspector = setupInspector(this);
 * }
 * ```
 *
 * The Application definition is found structurally -- any class
 * (declaration or expression, named, anonymous, or assigned to a
 * variable) extending a binding imported from an Application-providing
 * module -- so user-restructured app files are wired the same as
 * freshly generated ones.
 *
 * Idempotent: already-wired (or partially wired) modules keep their
 * existing import name and member. Returns the code unchanged when
 * there is nothing to do -- including when no Application definition
 * can be found.
 *
 * @param {string} code
 * @param {string} filePath
 * @returns {string}
 */
export function wireInspectorSupport(code, filePath) {
  let { tree, imports, inspectorImport, applicationClass, field } = analyze(code, filePath);

  if (!applicationClass) return code;

  let changed = false;
  let localName = inspectorImport
    ? identifierName(
        asNode(
          importSpecifiers(inspectorImport).find(
            (specifier) => specifier.type === "ImportDefaultSpecifier",
          )?.local,
        ),
      )
    : null;

  if (!localName) {
    localName = DEFAULT_LOCAL_NAME;

    if (inspectorImport) {
      // a side-effect-only import: give it the default binding
      importSpecifiers(inspectorImport).push(defaultSpecifier(localName));
    } else {
      let body = /** @type {ASTNode[]} */ (tree.program.body);
      let lastImport = imports.at(-1);
      let insertAt = lastImport ? body.indexOf(lastImport) + 1 : 0;

      body.splice(insertAt, 0, inspectorImportNode(localName));
    }

    changed = true;
  }

  if (!field) {
    classMembers(applicationClass).push(inspectorFieldNode(localName));
    changed = true;
  }

  if (!changed) return code;

  return print(tree);
}

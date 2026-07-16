import { toTree, print, statement } from "ember-estree";

export const INSPECTOR_PACKAGE = "@embroider/legacy-inspector-support";

/**
 * The `ember-source-4.12` flavor covers ember-source 4.12 and newer,
 * which includes the ember-source the app base generates with.
 */
export const INSPECTOR_ENTRY = `${INSPECTOR_PACKAGE}/ember-source-4.12`;

/**
 * Modules whose default export is the Application (sub)class an app
 * extends. The class extending one of these is where inspector support
 * gets attached.
 */
const APPLICATION_MODULES = new Set(["ember-strict-application-resolver", "@ember/application"]);

/** @typedef {import('ember-estree').ASTNode} ASTNode */

/**
 * @param {unknown} value
 * @returns {ASTNode | null}
 */
function asNode(value) {
  return value && typeof value === "object" ? /** @type {ASTNode} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {string} an Identifier node's name ("" when it isn't one)
 */
function nameOf(value) {
  let node = asNode(value);

  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : "";
}

/**
 * @param {ASTNode} importNode
 * @returns {ASTNode[]}
 */
function specifiersOf(importNode) {
  return Array.isArray(importNode.specifiers)
    ? /** @type {ASTNode[]} */ (importNode.specifiers)
    : [];
}

/**
 * @param {ASTNode} classNode
 * @returns {ASTNode[]} the class's members
 */
function classMembers(classNode) {
  let members = asNode(classNode.body)?.body;

  return Array.isArray(members) ? /** @type {ASTNode[]} */ (members) : [];
}

/**
 * Everything wiring and detection need to know about the module: its
 * import declarations, the import from {@link INSPECTOR_PACKAGE} (any
 * subpath), the class extending an Application import, and that class's
 * `inspector` member.
 *
 * @param {string} code
 * @param {string} filePath
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
    let source = asNode(node.source);
    let from = source?.type === "Literal" && typeof source.value === "string" ? source.value : "";

    if (APPLICATION_MODULES.has(from)) {
      for (let specifier of specifiersOf(node)) {
        let local = nameOf(specifier.local);

        if (local) applicationLocals.add(local);
      }
    }

    if (from === INSPECTOR_PACKAGE || from.startsWith(`${INSPECTOR_PACKAGE}/`)) {
      inspectorImport ??= node;
    }
  }

  let applicationClass =
    classes.find((node) => applicationLocals.has(nameOf(node.superClass))) ?? null;

  let inspectorMember = applicationClass
    ? (classMembers(applicationClass).find(
        (member) => !member.static && !member.computed && nameOf(member.key) === "inspector",
      ) ?? null)
    : null;

  return { tree, imports, inspectorImport, applicationClass, inspectorMember };
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
  let { inspectorImport, inspectorMember } = analyze(code, filePath);

  return Boolean(inspectorImport && inspectorMember);
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
  let { tree, imports, inspectorImport, applicationClass, inspectorMember } = analyze(
    code,
    filePath,
  );

  if (!applicationClass) return code;
  if (inspectorImport && inspectorMember) return code;

  let localName = "setupInspector";

  if (inspectorImport) {
    let defaultSpecifier = specifiersOf(inspectorImport).find(
      (specifier) => specifier.type === "ImportDefaultSpecifier",
    );

    localName = nameOf(defaultSpecifier?.local);

    // an import that binds no default gives the member nothing to call
    if (!localName) return code;
  } else {
    let body = /** @type {ASTNode[]} */ (tree.program.body);
    let lastImport = imports.at(-1);
    let insertAt = lastImport ? body.indexOf(lastImport) + 1 : 0;

    body.splice(insertAt, 0, statement`import ${localName} from "${INSPECTOR_ENTRY}";`);
  }

  if (!inspectorMember) {
    let [member] = classMembers(statement`class _ { inspector = ${localName}(this); }`);

    if (member) classMembers(applicationClass).push(member);
  }

  return print(tree);
}

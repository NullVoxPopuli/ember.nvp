import fs from "node:fs";
import { dirname, extname } from "node:path";
import { toTree, print } from "ember-estree";
import enhancedResolve from "enhanced-resolve";

const { ResolverFactory, CachedInputFileSystem } = enhancedResolve;

/**
 * Candidate extensions the resolver may append when a request has none
 * (or when we retry a request without its original extension).
 */
const RESOLVE_EXTENSIONS = [".js", ".gjs", ".ts", ".gts"];

function createResolver() {
  return ResolverFactory.createResolver({
    // short-lived cache: files are being written while generation runs
    fileSystem: new CachedInputFileSystem(fs, 100),
    useSyncFileSystemCalls: true,
    extensions: RESOLVE_EXTENSIONS,
    // no conditionNames: we only resolve local paths and sub-path
    // self-imports (whose targets in the emitted `imports` field are
    // plain strings, which match regardless of conditions)
  });
}

/**
 * Imports must match files. Generation renames files (e.g. type removal
 * turns .ts into .js), so for every local specifier (./, ../, and #
 * subpath-imports -- expanded against the project's package.json
 * `imports` field) we check what actually exists in the emitted project
 * tree:
 *
 * - the specifier resolves to a file? leave it alone.
 * - it doesn't, but the same specifier with whatever extension IS on
 *   disk does? rewrite it to that.
 * - nothing matches? leave it alone -- we can't know better, and the
 *   project's own build will report it loudly.
 *
 * ember-estree parses gjs natively and its visitors fire on actual module
 * specifiers only (static imports, re-exports, and dynamic import()) --
 * matched specifiers are rewritten on the AST and the File is printed
 * back out (comments included). Formatting is the project's own concern:
 * new projects run their configured lint:fix / format right away (it's
 * in the CLI's "Next steps").
 *
 * Files with no specifiers to rewrite are returned untouched.
 *
 * @param {string} code the source as it will be emitted
 * @param {string} emittedPath the path the file will be written to
 * @returns {string}
 */
export function rewriteImportsToMatchFiles(code, emittedPath) {
  let issuerDirectory = dirname(emittedPath);
  let resolver = createResolver();

  /**
   * @param {string} specifier
   * @returns {string | null} the resolved file path, if any
   */
  function resolveFrom(specifier) {
    try {
      return resolver.resolveSync({}, issuerDirectory, specifier) || null;
    } catch {
      return null;
    }
  }

  let changed = false;

  /**
   * @param {unknown} source
   */
  function consider(source) {
    if (!source || typeof source !== "object") return;

    let node = /** @type {import('ember-estree').ASTNode} */ (source);

    if (node.type !== "Literal" || typeof node.value !== "string") return;

    let specifier = node.value;
    let isLocal =
      specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("#");

    if (!isLocal) return;

    // already matches a file on disk
    if (resolveFrom(specifier)) return;

    let currentExtension = extname(specifier);

    if (!currentExtension) return;

    // check which file actually exists for this specifier
    let base = specifier.slice(0, -currentExtension.length);
    let resolved = resolveFrom(base);

    if (!resolved) return;

    let replacement = base + extname(resolved);

    if (replacement === specifier) return;

    node.value = replacement;
    node.raw = JSON.stringify(replacement);
    changed = true;
  }

  // (not templateOnly, so this is always a FileNode)
  let tree = /** @type {import('ember-estree').FileNode} */ (
    toTree(code, {
      filePath: emittedPath,
      visitors: {
        ImportDeclaration: (node) => consider(node.source),
        ExportNamedDeclaration: (node) => consider(node.source),
        ExportAllDeclaration: (node) => consider(node.source),
        // dynamic import()
        ImportExpression: (node) => consider(node.source),
      },
    })
  );

  if (!changed) return code;

  return print(tree);
}

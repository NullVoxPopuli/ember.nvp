import { Preprocessor } from "content-tag";
import { removeTypes as babelRemoveTypes } from "babel-remove-types";
import { toTree, print } from "ember-estree";
import { format } from "prettier";
import { substringBytes } from "./buffer.js";

/**
 * Inspired by https://github.com/ember-cli/ember-cli/blob/8ea5b2e22d37805f5749a4917e0ef25fac3c9cda/lib/models/blueprint.js#L537
 * @param {*} extension
 * @param {*} code
 * @returns
 */
export async function removeTypes(extension, code) {
  if (extension === ".gts") {
    return await rewriteImportExtensions(
      await wrappedRemoveTypes(code, removeTypesMatchingAppConfig),
      ".gjs",
    );
  }

  if (extension === ".ts") {
    return await rewriteImportExtensions(await removeTypesMatchingAppConfig(code), ".js");
  }

  return code;
}

/**
 * babel-remove-types formats with its own prettier defaults (singleQuote,
 * printWidth 80); the emitted app's prettier config wants double quotes at
 * printWidth 100 -- so pass the app's options through, otherwise every
 * converted file fails the generated project's own `lint:prettier`.
 *
 * @param {string} code
 */
async function removeTypesMatchingAppConfig(code) {
  return await babelRemoveTypes(code, { ...PRETTIER_OPTIONS, singleQuote: false });
}

/** @type {Array<[from: string, to: string]>} */
const EXTENSION_REWRITES = [
  [".gts", ".gjs"],
  [".ts", ".js"],
];

/**
 * Only rewrite specifiers that refer to files within the project
 * (relative paths and package.json#imports subpaths) --
 * those are the files that get renamed when we remove types.
 *
 * @param {string} specifier
 */
function rewriteSpecifier(specifier) {
  let isLocal =
    specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("#");

  if (!isLocal) return specifier;

  for (let [from, to] of EXTENSION_REWRITES) {
    if (specifier.endsWith(from)) {
      return specifier.slice(0, -from.length) + to;
    }
  }

  return specifier;
}

/**
 * Matches the emitted app's .prettierrc.js (src/layers/prettier/files),
 * which is what a generated project's `lint:prettier` checks against.
 *
 * (The template-tag plugin is passed as a module rather than by name:
 * prettier resolves plugin names relative to the process cwd, which is the
 * generated project, not this package.)
 */
const PRETTIER_OPTIONS = {
  printWidth: 100,
};

/**
 * When we remove types, files are renamed (.ts => .js, .gts => .gjs),
 * so import specifiers that mention those extensions have to be updated
 * to match what's on disk.
 *
 * ember-estree parses gjs natively and its visitors fire on actual module
 * specifiers only (static imports, re-exports, and dynamic import()) --
 * each one is rewritten on the AST, the File is printed back out
 * (comments included, as of ember-estree 0.6.11), and prettier formats
 * the result.
 *
 * Files with no specifiers to rewrite are returned untouched.
 *
 * @param {string} code the already-converted (type-free) source
 * @param {".js" | ".gjs"} extension the extension the converted file will have
 * @returns {Promise<string>}
 */
export async function rewriteImportExtensions(code, extension) {
  let changed = false;

  /**
   * @param {unknown} source
   */
  function consider(source) {
    if (!source || typeof source !== "object") return;

    let node = /** @type {import('ember-estree').ASTNode} */ (source);

    if (node.type !== "Literal" || typeof node.value !== "string") return;

    let replacement = rewriteSpecifier(node.value);

    if (replacement === node.value) return;

    node.value = replacement;
    node.raw = JSON.stringify(replacement);
    changed = true;
  }

  // (not templateOnly, so this is always a FileNode)
  let tree = /** @type {import('ember-estree').FileNode} */ (
    toTree(code, {
      filePath: `module${extension}`,
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

  if (extension === ".gjs") {
    let plugin = await import("prettier-plugin-ember-template-tag");

    return await format(print(tree), {
      ...PRETTIER_OPTIONS,
      parser: "ember-template-tag",
      plugins: [plugin.default ?? plugin],
    });
  }

  return await format(print(tree), {
    ...PRETTIER_OPTIONS,
    parser: "babel",
  });
}

/**
 *
 * Support for removeTypes
 *
 */

const preprocessor = new Preprocessor();
/**
 * Builds a class field placeholder for a template block.
 * @param {number} i index of the template occurrence
 */
function replacementClassMember(i = 0) {
  return `template = __TEMPLATE_TAG_${i}__;`;
}

/**
 * Builds an expression placeholder for a template block.
 * @param {number} i index of the template occurrence
 */
function replacementExpression(i = 0) {
  return `__TEMPLATE_TAG_${i}__`;
}

async function wrappedRemoveTypes(code = "", callback = babelRemoveTypes) {
  // Strip template tags
  const templateTagMatches = preprocessor.parse(code);
  let strippedCode = code;

  for (const [i, match] of templateTagMatches.entries()) {
    const templateTag = substringBytes(code, match.range.startByte, match.range.endByte);

    if (match.type === "class-member") {
      strippedCode = strippedCode.replace(templateTag, replacementClassMember(i));
    } else {
      strippedCode = strippedCode.replace(templateTag, replacementExpression(i));
    }
  }

  // Remove types
  const transformed = await callback(strippedCode);

  // Readd stripped template tags
  let transformedWithTemplateTag = transformed;

  for (const [i, match] of templateTagMatches.entries()) {
    const templateTag = substringBytes(code, match.range.startByte, match.range.endByte);

    if (match.type === "class-member") {
      transformedWithTemplateTag = transformedWithTemplateTag.replace(
        replacementClassMember(i),
        templateTag,
      );
    } else {
      // babel-remove-types uses prettier under the hood, and adds trailing `;` where allowed,
      // so we need to take that into account when restoring the template tags:
      transformedWithTemplateTag = transformedWithTemplateTag.replace(
        `${replacementExpression(i)};`,
        templateTag,
      );
      transformedWithTemplateTag = transformedWithTemplateTag.replace(
        replacementExpression(i),
        templateTag,
      );
    }
  }

  return transformedWithTemplateTag;
}

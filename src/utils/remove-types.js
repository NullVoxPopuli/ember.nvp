import { Preprocessor } from "content-tag";
import { removeTypes as babelRemoveTypes } from "babel-remove-types";
import { parse } from "ember-estree";
import { substringBytes } from "./buffer.js";

/**
 * Inspired by https://github.com/ember-cli/ember-cli/blob/8ea5b2e22d37805f5749a4917e0ef25fac3c9cda/lib/models/blueprint.js#L537
 * @param {*} extension
 * @param {*} code
 * @returns
 */
export async function removeTypes(extension, code) {
  if (extension === ".gts") {
    return rewriteImportExtensions(await wrappedRemoveTypes(code, babelRemoveTypes), ".gjs");
  }

  if (extension === ".ts") {
    return rewriteImportExtensions(await babelRemoveTypes(code), ".js");
  }

  return code;
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
 * When we remove types, files are renamed (.ts => .js, .gts => .gjs),
 * so import specifiers that mention those extensions have to be updated
 * to match what's on disk.
 *
 * ember-estree (which parses gjs natively) tells us which strings are
 * actual module specifiers (static imports, re-exports, and dynamic
 * import()), then each changed specifier is swapped out via quoted-string
 * replacement -- no offsets to track, and comments / formatting are
 * untouched.
 *
 * (ember-estree's print() isn't usable here yet: comments live on
 * `File.comments` and aren't printed, so reprinting would strip every
 * comment from the converted files.)
 *
 * @param {string} code the already-converted (type-free) source
 * @param {".js" | ".gjs"} extension the extension the converted file will have
 * @returns {string}
 */
export function rewriteImportExtensions(code, extension) {
  /** @type {Map<string, string>} */
  let rewrites = new Map();

  /**
   * @param {unknown} source
   */
  function consider(source) {
    if (!source || typeof source !== "object") return;

    let node = /** @type {import('ember-estree').ASTNode} */ (source);

    if (node.type !== "Literal" || typeof node.value !== "string") return;

    let replacement = rewriteSpecifier(node.value);

    if (replacement !== node.value) {
      rewrites.set(node.value, replacement);
    }
  }

  parse(code, {
    filePath: `module${extension}`,
    visitors: {
      ImportDeclaration: (node) => consider(node.source),
      ExportNamedDeclaration: (node) => consider(node.source),
      ExportAllDeclaration: (node) => consider(node.source),
      // dynamic import()
      ImportExpression: (node) => consider(node.source),
    },
  });

  for (let [from, to] of rewrites) {
    code = code.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`'${from}'`, `'${to}'`);
  }

  return code;
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

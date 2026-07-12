import { parseAsync, traverse } from "@babel/core";
import { Preprocessor } from "content-tag";
import { removeTypes as babelRemoveTypes } from "babel-remove-types";
import { substringBytes } from "./buffer.js";

/**
 * Inspired by https://github.com/ember-cli/ember-cli/blob/8ea5b2e22d37805f5749a4917e0ef25fac3c9cda/lib/models/blueprint.js#L537
 * @param {*} extension
 * @param {*} code
 * @returns
 */
export async function removeTypes(extension, code) {
  if (extension === ".gts") {
    return await wrappedRemoveTypes(code, removeTypesAndFixImports);
  }

  if (extension === ".ts") {
    return await removeTypesAndFixImports(code);
  }

  return code;
}

/**
 * @param {string} code
 */
async function removeTypesAndFixImports(code) {
  return await rewriteImportExtensions(await babelRemoveTypes(code));
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
 * AST-guided so that only actual module specifiers are touched
 * (static imports, re-exports, and dynamic import()), and applied via
 * string-splicing so the rest of the file's formatting is left alone.
 *
 * @param {string} code
 * @returns {Promise<string>}
 */
export async function rewriteImportExtensions(code) {
  let ast = await parseAsync(code, {
    babelrc: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: ["decorators-legacy"],
    },
  });

  if (!ast) {
    return code;
  }

  /** @type {Array<{ start: number, end: number, replacement: string }>} */
  let edits = [];

  /**
   * @param {import('@babel/core').types.Node | null | undefined} node
   */
  function consider(node) {
    if (!node || node.type !== "StringLiteral") return;

    let replacement = rewriteSpecifier(node.value);

    if (replacement !== node.value && node.start != null && node.end != null) {
      edits.push({ start: node.start, end: node.end, replacement });
    }
  }

  traverse(ast, {
    /** @param {import('@babel/core').NodePath<import('@babel/core').types.ImportDeclaration>} path */
    ImportDeclaration(path) {
      consider(path.node.source);
    },
    /** @param {import('@babel/core').NodePath<import('@babel/core').types.ExportNamedDeclaration>} path */
    ExportNamedDeclaration(path) {
      consider(path.node.source);
    },
    /** @param {import('@babel/core').NodePath<import('@babel/core').types.ExportAllDeclaration>} path */
    ExportAllDeclaration(path) {
      consider(path.node.source);
    },
    /** @param {import('@babel/core').NodePath<import('@babel/core').types.CallExpression>} path */
    CallExpression(path) {
      // dynamic import()
      if (path.node.callee.type === "Import") {
        consider(path.node.arguments[0]);
      }
    },
  });

  // Apply edits from the end of the file backwards so earlier offsets stay valid
  for (let { start, end, replacement } of edits.sort((a, b) => b.start - a.start)) {
    let quote = code[start];

    code = code.slice(0, start) + quote + replacement + quote + code.slice(end);
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

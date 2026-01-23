import { removeTypes } from "babel-remove-types";
import { substringBytes } from "./buffer.js";

/**
 * Inspired by https://github.com/ember-cli/ember-cli/blob/8ea5b2e22d37805f5749a4917e0ef25fac3c9cda/lib/models/blueprint.js#L537
 * @param {*} extension
 * @param {*} code
 * @returns
 */
export async function removeTypes(extension, code) {
  if (extension === ".gts") {
    return await wrappedRemoveTypes(code, (strippedCode) => removeTypes(strippedCode));
  }

  return await removeTypes(code);
}

/**
 *
 * Support for removeTypes
 *
 */

import { Preprocessor } from "content-tag";
import { substringBytes } from "./buffer.js";

const VIRTUAL_IMPORTS = new Set([
  "@ember/application",
  "@ember/application/instance",
  "@ember/array",
  "@ember/component",
  "@ember/component/helper",
  "@ember/component/template-only",
  "@ember/debug",
  "@ember/destroyable",
  "@ember/helper",
  "@ember/modifier",
  "@ember/object",
  "@ember/object/internals",
  "@ember/object/observers",
  "@ember/owner",
  "@ember/reactive",
  "@ember/reactive/collections",
  "@ember/renderer",
  "@ember/routing",
  "@ember/routing/route",
  "@ember/routing/router",
  "@ember/runloop",
  "@ember/service",
  "@ember/template",
  "@ember/template-compilation",
  "@ember/template-factory",
  "@ember/test-helpers",
  "@ember/test-waiters",
  "@ember/test",
  "@ember/utils",
  "@ember/version",
  "@glimmer/destroyable",
  "@glimmer/manager",
  "@glimmer/validator",
  "@glimmer/tracking",
  "@glimmer/tracking/primitives/cache",
]);

function isEmberVirtual(importPath) {
  return VIRTUAL_IMPORTS.has(importPath);
}

const preprocessor = new Preprocessor();

/**
 * Maintains length of positioning of code so that es-module-lexer can provide the right character offsets for imports updating
 *
 * @param {string} code
 */
async function prepareForImportAnalysis(code) {
  const replacementClassMember = (i) => `template = __TEMPLATE_TAG_${i}__;`;
  const replacementExpression = (i) => `__TEMPLATE_TAG_${i}__`;
  const templateTagMatches = preprocessor.parse(code);
  let strippedCode = code;

  for (let i = 0; i < templateTagMatches.length; i++) {
    const match = templateTagMatches[i];
    const templateTag = substringBytes(code, match.range.startByte, match.range.endByte);

    if (match.type === "class-member") {
      strippedCode = strippedCode.replace(templateTag, replacementClassMember(i));
    } else {
      strippedCode = strippedCode.replace(templateTag, replacementExpression(i));
    }
  }

  return strippedCode;
}

async function wrappedRemoveTypes(code, callback) {
  // Strip template tags
  const replacementClassMember = (i) => `template = __TEMPLATE_TAG_${i}__;`;
  const replacementExpression = (i) => `__TEMPLATE_TAG_${i}__`;
  const templateTagMatches = preprocessor.parse(code);
  let strippedCode = code;

  for (let i = 0; i < templateTagMatches.length; i++) {
    const match = templateTagMatches[i];
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

  for (let i = 0; i < templateTagMatches.length; i++) {
    const match = templateTagMatches[i];
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

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
    return await wrappedRemoveTypes(code, babelRemoveTypes);
  }

  if (extension === ".ts") {
    return await babelRemoveTypes(code);
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

export const VITE_CONFIG = "vite.config.mjs";

export const EMBER_PLUGIN_IMPORT =
  /^import \{ ember \} from ["']@nullvoxpopuli\/ember-vite["'];?$/m;

export const EMBER_PLUGIN_CALL = /plugins:\s*\[\s*ember\(\)/;

/**
 * Adds a plugin right after `ember()`.
 * The ssr layer finds `ember()` first in the array, so it must stay first.
 *
 * @param {string} code
 * @param {{ importLine: string, call: string }} plugin
 */
export function addVitePlugin(code, { importLine, call }) {
  /**
   * The codemod only knows the base's config.
   * For any other shape, isSetup reports what is missing.
   */
  if (!EMBER_PLUGIN_IMPORT.test(code) || !EMBER_PLUGIN_CALL.test(code)) return code;

  if (!code.includes(importLine)) {
    code = code.replace(EMBER_PLUGIN_IMPORT, (line) => `${line}\n${importLine}`);
  }

  if (!code.includes(call)) {
    code = code.replace(EMBER_PLUGIN_CALL, (ember) => `${ember}, ${call}`);
  }

  return code;
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {{ importLine: string, call: string }} plugin
 * @param {string} name for the reasons
 */
export async function vitePluginReasons(project, { importLine, call }, name) {
  let code = (await project.read(VITE_CONFIG)) ?? "";
  let reasons = [];

  if (!code.includes(importLine)) {
    reasons.push(`${VITE_CONFIG} does not import ${name}`);
  }

  if (!code.includes(call)) {
    reasons.push(`${VITE_CONFIG} does not use the ${call} plugin`);
  }

  return reasons;
}

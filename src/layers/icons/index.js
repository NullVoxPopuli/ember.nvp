import { packageJson, tsconfig } from "ember-apply";
import { getLatest } from "#utils/npm.js";
import { readManifest } from "#utils/manifest.js";
import * as svgJar from "./svg-jar.js";
import * as unpluginIcons from "./unplugin-icons.js";

/**
 * @typedef {object} Tool
 * @property {Record<string, string>} deps
 * @property {string} types the entry in `compilerOptions.types` that declares the icon modules
 * @property {(project: import('#utils/project.js').Project) => Promise<void>} run
 * @property {(project: import('#utils/project.js').Project) => Promise<string[]>} reasons
 * @property {string} readme
 * @property {string} agents
 */

/**
 * @type {Record<string, Tool>}
 */
const TOOLS = { "svg-jar": svgJar, "unplugin-icons": unpluginIcons };

/**
 * Only apps and extensions build with Vite.
 * The library, custom-element, and widget bases build with tsdown.
 */
const SUPPORTED_TYPES = new Set(["app", "extension"]);

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {Tool | undefined}
 */
function toolFor(project) {
  return TOOLS[project.getLayerOptions("icons").tool];
}

/**
 * @param {Record<string, any>} config
 * @param {Tool} tool
 */
function hasTypes(config, tool) {
  return Boolean(config.compilerOptions?.types?.includes(tool.types));
}

/**
 * `vite/client` declares `*.svg` as a URL string.
 * TypeScript merges the two `*.svg` declarations and takes the first one,
 * so the icon types go before `vite/client`.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {Tool} tool
 */
async function addTypes(project, tool) {
  if (!project.hasFile("tsconfig.json")) return;

  if (hasTypes(await tsconfig.read(project.directory), tool)) return;

  await tsconfig.modify((json) => {
    json.compilerOptions ||= {};
    json.compilerOptions.types ||= [];

    let vite = json.compilerOptions.types.indexOf("vite/client");

    json.compilerOptions.types.splice(vite === -1 ? 0 : vite, 0, tool.types);
  }, project.directory);
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Icons",
  hint: "SVG files and icon sets as components",

  options: {
    tool: {
      type: "select",
      prompt: "Which icon tool?",
      default: "svg-jar",
      options: [
        {
          value: "svg-jar",
          label: "@svg-jar/plugin",
          hint: "import your own .svg files as components, built into a sprite sheet",
        },
        {
          value: "unplugin-icons",
          label: "unplugin-icons",
          hint: "import icons from Iconify icon sets as components",
        },
      ],
      async detect(project) {
        let deps = (await readManifest(project)).devDependencies ?? {};

        return Object.keys(TOOLS).find((name) =>
          Object.keys(TOOLS[name]?.deps ?? {}).every((dep) => deps[dep]),
        );
      },
    },
  },

  async run(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    let tool = toolFor(project);

    if (!tool) return;

    await tool.run(project);
    await addTypes(project, tool);
    await packageJson.addDevDependencies(await getLatest(tool.deps), project.directory);
  },

  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {true} explain
   * @returns {Promise<{ isSetup: boolean; reasons: string[] }>}
   */
  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {boolean | undefined} [explain]
   * @returns {Promise<boolean>}
   */
  async isSetup(project, explain) {
    const reasons = [];
    let tool = toolFor(project);

    if (!SUPPORTED_TYPES.has(project.type)) {
      reasons.push("only apps and extensions build with Vite");
    } else if (tool) {
      let manifest = await packageJson.read(project.directory);

      for (let reason of await tool.reasons(project)) {
        reasons.push(reason);
      }

      for (let dep of Object.keys(tool.deps)) {
        if (!manifest.devDependencies?.[dep] && !manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in devDependencies`);
        }
      }

      if (project.hasFile("tsconfig.json")) {
        if (!hasTypes(await tsconfig.read(project.directory), tool)) {
          reasons.push(`tsconfig.json is missing ${tool.types} in compilerOptions.types`);
        }
      }
    }

    if (explain) {
      return { isSetup: reasons.length === 0, reasons };
    }

    return reasons.length === 0;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  readme(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    return toolFor(project)?.readme;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  agents(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    return toolFor(project)?.agents;
  },
};

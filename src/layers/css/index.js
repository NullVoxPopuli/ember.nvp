import { packageJson } from "ember-apply";
import { getLatest } from "#utils/npm.js";
import { readManifest } from "#utils/manifest.js";
import * as tailwind from "./tailwind.js";
import * as scopedCSS from "./scoped-css.js";

/**
 * @typedef {object} Tool
 * @property {Record<string, string>} deps
 * @property {(project: import('#utils/project.js').Project) => Promise<void>} run
 * @property {(project: import('#utils/project.js').Project) => Promise<string[]>} reasons
 * @property {string} readme
 * @property {string} agents
 */

/**
 * @type {Record<string, Tool>}
 */
const TOOLS = { tailwind, "scoped-css": scopedCSS };

/**
 * Only apps and extensions build with Vite.
 * The library, custom-element, and widget bases build with tsdown.
 */
const SUPPORTED_TYPES = new Set(["app", "extension"]);

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {Tool[]}
 */
function toolsFor(project) {
  /** @type {string[]} */
  let names = project.getLayerOptions("css").tools ?? [];

  return names.map((name) => TOOLS[name]).filter((tool) => tool !== undefined);
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "CSS",
  hint: "Tailwind CSS, scoped CSS, or both",

  options: {
    tools: {
      type: "multiselect",
      prompt: "Which CSS tools?",
      default: ["tailwind", "scoped-css"],
      options: [
        {
          value: "tailwind",
          label: "Tailwind CSS 4",
          hint: "utility classes, built by the Vite plugin",
        },
        {
          value: "scoped-css",
          label: "ember-scoped-css",
          hint: "<style scoped> and co-located .css, scoped to each component",
        },
      ],
      async detect(project) {
        let deps = (await readManifest(project)).devDependencies ?? {};
        let found = Object.keys(TOOLS).filter((name) =>
          Object.keys(TOOLS[name]?.deps ?? {}).every((dep) => deps[dep]),
        );

        return found.length > 0 ? found : undefined;
      },
    },
  },

  async run(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    for (let tool of toolsFor(project)) {
      await tool.run(project);
      await packageJson.addDevDependencies(await getLatest(tool.deps), project.directory);
    }
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

    if (!SUPPORTED_TYPES.has(project.type)) {
      reasons.push("only apps and extensions build with Vite");
    } else {
      let manifest = await packageJson.read(project.directory);

      for (let tool of toolsFor(project)) {
        for (let reason of await tool.reasons(project)) {
          reasons.push(reason);
        }

        for (let dep of Object.keys(tool.deps)) {
          if (!manifest.devDependencies?.[dep] && !manifest.dependencies?.[dep]) {
            reasons.push(`package.json is missing ${dep} in devDependencies`);
          }
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

    let tools = toolsFor(project);

    if (tools.length === 0) return;

    return `### Styling

${tools.map((tool) => tool.readme).join("\n\n")}`;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  agents(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    let tools = toolsFor(project);

    if (tools.length === 0) return;

    return `## Styling

${tools.map((tool) => tool.agents).join("\n\n")}`;
  },
};

import { js } from "ember-apply";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hasConfiguredTSBabel, prependPlugin } from "#utils/babel.js";

const bases = join(import.meta.dirname, "../../bases");
const appBase = join(bases, "minimal-app/files");
const libraryBase = join(bases, "minimal-library/files");

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "TypeScript",

  async run(project) {
    /**
     * if jsconfig exists, switch to tsconfig
     */
    /**
     * if tsconfig exists,
     */
    addTSConfig(project);
    updateBabelConfig(project);
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

    if (!project.hasFile("tsconfig.json")) {
      if (!explain) return false;

      reasons.push("tsconfig.json is missing");
    }

    if (!(await hasConfiguredTSBabel(project))) {
      if (!explain) return false;

      reasons.push(`babel.config is missing @babel/plugin-transform-typescript`);
    }

    if (explain) {
      return {
        isSetup: reasons.length === 0,
        reasons,
      };
    }

    return reasons.length === 0;
  },
};

/**
 * @param {import('#utils/project.js').Project} project
 */
async function addTSConfig(project) {
  if (existsSync(project.path("tsconfig.json"))) {
    return;
  }

  if (project.type === "app") {
    await cp(join(appBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "library") {
    await cp(join(libraryBase, "tsconfig.json"), project.path("tsconfig.json"));
  }
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  await prependPlugin(
    project,
    `[
      "@babel/plugin-transform-typescript",
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ]`,
  );
}

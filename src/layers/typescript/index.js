import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";

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
      reasons.push("tsconfig.json is missing");

      if (!explain) return false;
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
async function updateBabelConfig(project) {}

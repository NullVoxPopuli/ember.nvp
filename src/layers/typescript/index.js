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

  async isSetup(project) {
    if (!project.hasFile("tsconfig.json")) {
      return false;
    }

    return true;
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

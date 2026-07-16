import { packageJson } from "ember-apply";
import { getLatest } from "#utils/npm.js";
import { addTsdownConfigProperty, hasTsdownConfigProperty } from "#utils/tsdown-config.js";

const deps = {
  publint: "^0.3.21",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "publint",
  hint: "validate the publishable package shape on every build",

  async run(project) {
    // Publish checks: apps aren't published
    if (project.type !== "library") return;

    await addTsdownConfigProperty(project, "publint", "publint: true");
    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
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
    /** @type {string[]} */
    const reasons = [];

    // Nothing to set up outside libraries, so nothing can be missing
    if (project.type !== "library") {
      return explain ? { isSetup: true, reasons } : true;
    }

    if (!(await hasTsdownConfigProperty(project, "publint"))) {
      if (!explain) return false;

      reasons.push("tsdown.config.js does not configure publint");
    }

    let manifest = await packageJson.read(project.directory);

    if (!manifest.devDependencies?.["publint"]) {
      if (!explain) return false;

      reasons.push("package.json is missing publint in devDependencies");
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

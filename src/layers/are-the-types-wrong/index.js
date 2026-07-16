import { packageJson } from "ember-apply";
import { getLatest } from "#utils/npm.js";
import { addTsdownConfigProperty, hasTsdownConfigProperty } from "#utils/tsdown-config.js";

const deps = {
  "@arethetypeswrong/core": "^0.18.5",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Are The Types Wrong?",
  hint: "validate the published declarations on every build",

  async run(project) {
    // Publish checks: apps aren't published
    if (project.type !== "library") return;

    // Declarations are the thing being checked
    if (!(await project.hasOrWantsLayer("typescript"))) return;

    // ESM-only packages don't offer the CJS resolution modes the strict
    // profile requires
    await addTsdownConfigProperty(project, "attw", `attw: { profile: "esm-only" }`);
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

    // Nothing to set up outside TypeScript libraries, so nothing can be
    // missing
    if (project.type !== "library" || !(await project.hasOrWantsLayer("typescript"))) {
      return explain ? { isSetup: true, reasons } : true;
    }

    if (!(await hasTsdownConfigProperty(project, "attw"))) {
      if (!explain) return false;

      reasons.push("tsdown.config.js does not configure attw");
    }

    let manifest = await packageJson.read(project.directory);

    if (!manifest.devDependencies?.["@arethetypeswrong/core"]) {
      if (!explain) return false;

      reasons.push("package.json is missing @arethetypeswrong/core in devDependencies");
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

import { packageJson } from "ember-apply";
import { join } from "node:path";
import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";

const deps = {
  "expect-type": "^1.3.0",
};

/**
 * The library tsconfig only includes `src` (it drives declaration output),
 * so type tests get their own project.
 */
const scripts = {
  "lint:type-tests": "ember-tsc --noEmit --project type-tests",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "expect-type",
  hint: "type tests for the published API",

  async run(project) {
    // Apps aren't published, so they have no public API to pin
    if (!project.isLibrary) return;

    if (!(await project.hasOrWantsLayer("typescript"))) return;

    await applyFolderTo(join(import.meta.dirname, "files"), project);
    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
    await packageJson.addScripts(scripts, project.directory);
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

    // Nothing to set up outside TypeScript libraries,
    // so nothing can be missing
    if (!project.isLibrary || !(await project.hasOrWantsLayer("typescript"))) {
      return explain ? { isSetup: true, reasons } : true;
    }

    if (!project.hasFile("type-tests/tsconfig.json")) {
      if (!explain) return false;

      reasons.push("type-tests/tsconfig.json is missing");
    }

    let manifest = await packageJson.read(project.directory);

    for (let script of Object.keys(scripts)) {
      if (!manifest.scripts?.[script]) {
        if (!explain) return false;

        reasons.push(`package.json is missing the "${script}" script`);
      }
    }

    for (let dep of Object.keys(deps)) {
      if (!manifest.devDependencies?.[dep]) {
        if (!explain) return false;

        reasons.push(`package.json is missing ${dep} in devDependencies`);
      }
    }

    if (explain) {
      return {
        isSetup: reasons.length === 0,
        reasons,
      };
    }

    return reasons.length === 0;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async readme(project) {
    if (!project.isLibrary || !(await project.hasOrWantsLayer("typescript"))) return;

    return `### Type tests

Type tests in \`type-tests/\` use [expect-type](https://github.com/mmkal/expect-type) to pin the types of the public API.

- \`${project.runPrefix} lint:type-tests\` - Typecheck the type tests`;
  },
};

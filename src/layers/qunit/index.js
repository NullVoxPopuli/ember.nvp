import { packageJson, files } from "ember-apply";
import { join } from "node:path";

const deps = {
  "@ember/test-helpers": "^5.4.1",
  "@ember/test-waiters": "^4.1.0",
  "ember-qunit": "^9.0.4",
  "qunit-theme-ember": "^1.0.0",
  qunit: "^2.25.0",
  "qunit-dom": "3.5.0",
  testem: "3.17.0",
};
const tsDeeps = {
  "@types/qunit": "^2.19.12",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "QUnit",

  async run(project) {
    // Apply test files
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    // Add dependencies
    await packageJson.addDependencies(
      {
        "@ember/test-helpers": "^4.0.4",
      },
      project.directory,
    );

    // Add devDependencies
    await packageJson.addDevDependencies(
      {
        qunit: "^2.22.0",
        "@ember/test-waiters": "^3.1.0",
        playwright: "^1.49.1",
      },
      project.directory,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        test: "vite build && node ./run-tests.mjs",
      },
      project.directory,
    );
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
    const reasons = ["QUnit setup detection not implemented"];

    if (explain) {
      return {
        isSetup: false,
        reasons,
      };
    }

    return false;
  },
};

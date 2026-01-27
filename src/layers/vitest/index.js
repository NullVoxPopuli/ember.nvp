import { getLatest } from "#utils/npm.js";
import { packageJson, files } from "ember-apply";
import { join } from "node:path";

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Vitest",

  async run(project) {
    // Apply test files
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    // Add devDependencies
    await packageJson.addDevDependencies(
      await getLatest({
        "@ember/test-helpers": "^5.4.1",
        "@ember/test-waiters": "^4.1.1",
        "@testing-library/dom": "^10.4.1",
        "ember-vitest": "^0.3.3",
        vitest: "^4.0.0",
        "@vitest/ui": "^4.0.0",
        "@vitest/browser": "^4.0.0",
        "@vitest/browser-webdriverio": "^4.0.0",
        webdriverio: "^9.23.2",
      }),
      project.directory,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        test: "vitest run",
        "test:watch": "vitest",
        "test:ui": "vitest --ui",
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
    const reasons = ["Vitest setup detection not implemented"];

    if (explain) {
      return {
        isSetup: false,
        reasons,
      };
    }

    return false;
  },
};

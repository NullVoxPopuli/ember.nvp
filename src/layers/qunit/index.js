import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

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
  async isSetup(project) {
    return false;
  },
};

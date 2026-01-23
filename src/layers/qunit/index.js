import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * QUnit Layer
 *
 * Adds QUnit testing support (Ember's traditional testing framework)
 */
export default {
  label: "QUnit",
  description: "Testing with QUnit",

  async run({ targetDir, projectName }) {
    // Apply test files
    await files.applyFolder(join(import.meta.dirname, "files"), targetDir);

    // Replace __PROJECT_NAME__ in tests/index.html
    const testHtmlPath = join(targetDir, "tests", "index.html");
    const content = await readFile(testHtmlPath, "utf-8");
    const updated = content.replaceAll("__PROJECT_NAME__", projectName);
    await files.copyFileTo(testHtmlPath, { content: updated });

    // Add dependencies
    await packageJson.addDependencies(
      {
        "@ember/test-helpers": "^4.0.4",
      },
      targetDir,
    );

    // Add devDependencies
    await packageJson.addDevDependencies(
      {
        qunit: "^2.22.0",
        "@ember/test-waiters": "^3.1.0",
        playwright: "^1.49.1",
      },
      targetDir,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        test: "vite build && node ./run-tests.mjs",
      },
      targetDir,
    );
  },
};

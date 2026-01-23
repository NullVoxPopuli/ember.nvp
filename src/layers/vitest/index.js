import { packageJson, files } from "ember-apply";
import { join } from "node:path";

export default {
  label: "Vitest",
  description: "Testing with Vitest",

  async run({ targetDir }) {
    // Apply test files
    await files.applyFolder(join(import.meta.dirname, "files"), targetDir);

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
      targetDir,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        test: "vitest run",
        "test:watch": "vitest",
        "test:ui": "vitest --ui",
      },
      targetDir,
    );
  },
};

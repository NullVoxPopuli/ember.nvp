import { packageJson, files } from "ember-apply";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * ESLint Layer
 *
 * Adds ESLint support with modern configuration
 */
export default {
  label: "ESLint",
  description: "Code linting with ESLint",

  async run({ targetDir }) {
    // Apply config files
    await files.applyFolder(join(__dirname, "files"), targetDir);

    // Add devDependencies
    await packageJson.addDevDependencies(
      {
        eslint: "^9.18.0",
        "@typescript-eslint/eslint-plugin": "^8.19.1",
        "@typescript-eslint/parser": "^8.19.1",
        "eslint-config-prettier": "^10.0.1",
        "eslint-plugin-ember": "^12.2.1",
        globals: "^15.14.0",
      },
      targetDir,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        lint: "eslint . --cache",
        "lint:fix": "eslint . --fix",
      },
      targetDir,
    );
  },
};

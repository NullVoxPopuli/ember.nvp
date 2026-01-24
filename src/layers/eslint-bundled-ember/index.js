import { getLatest } from "#utils/npm.js";
import { files, packageJson } from "ember-apply";
import { formatLabel } from "#utils/cli.js";
import { maybeLintWithConcurrently } from "#consolidators/linting.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hasDevDeps } from "#utils/manifest.js";

/**
 * @type {import('#types').Layer}
 */
export default {
  label: formatLabel("ESLint", "ember's encapsulated config"),
  hint: `Minimal dependencies added to package.json. Not official, but follows the official configuration`,

  async run(project) {
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDevDependencies(
      await getLatest({
        "ember-eslint": "^0.6.1",
        eslint: "^9.39.2",
      }),
      project.directory,
    );

    await packageJson.addScripts(
      {
        "lint:eslint": "eslint . --cache",
        "lint:eslint:fix": "eslint . --fix",
      },
      project.directory,
    );

    await maybeLintWithConcurrently(project);
  },

  async isSetup(project) {
    if (!existsSync(join(project.directory, "eslint.config.js"))) {
      return false;
    }

    let manifest = await packageJson.read(project.directory);

    if (!hasDevDeps(manifest, ["ember-eslint", "eslint"])) {
      return false;
    }

    let scripts = Object.values(manifest.scripts ?? {}).filter((script) =>
      script.includes("eslint"),
    );

    if (!scripts.some((script) => script.includes("--cache"))) {
      return false;
    }
    if (!scripts.some((script) => script.includes("--fix"))) {
      return false;
    }

    return true;
  },
};

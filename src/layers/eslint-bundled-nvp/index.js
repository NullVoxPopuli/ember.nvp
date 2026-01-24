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
  label: formatLabel("ESLint", "NullVoxPopuli's encapsulated config"),
  hint: `Minimal dependencies added to package.json`,

  async run(project) {
    if (await this.isSetup(project)) {
      return;
    }

    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDevDependencies(
      await getLatest({
        "@nullvoxpopuli/eslint-configs": "^5.5.0",
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

    if (!hasDevDeps(manifest, ["@nullvoxpopuli/eslint-configs", "eslint"])) {
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

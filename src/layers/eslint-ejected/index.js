import { getLatest } from "#utils/npm.js";
import { packageJson } from "ember-apply";
import { formatLabel } from "#utils/cli.js";
import { hasDevDeps } from "#utils/manifest.js";
import { maybeLintWithConcurrently } from "#consolidators/linting.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const toInstall = {
  "@babel/eslint-parser": "^7.28.6",
  "@eslint/js": "^9.39.2",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-ember": "^12.7.5",
  "eslint-plugin-n": "^17.23.2",
  "eslint-plugin-qunit": "^8.2.5",
  "typescript-eslint": "^8.53.0",
  eslint: "^9.39.2",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: formatLabel("ESLint", "fully ejected, all of the dependencies"),

  async run(project) {
    await packageJson.addDevDependencies(await getLatest(toInstall), project.directory);

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

    if (!hasDevDeps(manifest, toInstall)) {
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

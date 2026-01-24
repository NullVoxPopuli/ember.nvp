import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getLatest } from "#utils/npm.js";
import { formatLabel } from "#utils/cli.js";
import { maybeLintWithConcurrently } from "#consolidators/linting.js";

/**
 * Prettier Layer
 *
 * Adds Prettier for code formatting
 */
export default {
  label: formatLabel("Prettier", "code formatting"),
  hint: "the defaults",

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDevDependencies(
      await getLatest({
        prettier: "^3.8.1",
        "prettier-plugin-ember-template-tag": "^2.1.2",
      }),
      project.directory,
    );

    await packageJson.addScripts(
      {
        format: "prettier --write .",
        "lint:prettier": "prettier --check .",
      },
      project.directory,
    );

    await maybeLintWithConcurrently(project);
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    let manifest = await packageJson.read(project.directory);

    let scripts = Object.values(manifest.scripts ?? {}).filter((script) =>
      script.includes("prettier"),
    );

    if (!scripts.some((script) => script.includes("--write"))) {
      return false;
    }
    if (!scripts.some((script) => script.includes("--check"))) {
      return false;
    }

    if (!existsSync(join(project.directory, ".prettierrc.js"))) {
      return false;
    }

    return true;
  },
};

import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getLatest } from "#utils/npm.js";
import { formatLabel } from "#utils/cli.js";
import { maybeLintWithConcurrently } from "#consolidators/linting.js";

/**
 * Config files that an existing project can have, so that a migration
 * from an older blueprint keeps the old quote style.
 */
const CONFIG_FILES = [".prettierrc.js", ".prettierrc.mjs", ".prettierrc.cjs"];

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {Promise<string | undefined>}
 */
async function detectPreset(project) {
  for (let name of CONFIG_FILES) {
    let path = join(project.directory, name);

    if (!existsSync(path)) continue;

    let config = await readFile(path, "utf-8");

    if (/singleQuote:\s*true/.test(config)) return "ember";
    if (/printWidth:\s*100\b/.test(config)) return "nvp";

    return "default";
  }

  return undefined;
}

/**
 * Prettier Layer
 *
 * Adds Prettier for code formatting
 */
export default {
  label: formatLabel("Prettier", "code formatting"),
  hint: "the defaults, or the official Ember config",

  options: {
    preset: {
      type: "select",
      prompt: "Which Prettier config?",
      default: "nvp",
      options: [
        {
          value: "nvp",
          label: "nvp",
          hint: "Prettier's defaults, with a print width of 100",
        },
        {
          value: "default",
          label: "default",
          hint: "Prettier's defaults",
        },
        {
          value: "ember",
          label: "ember",
          hint: "The official Ember blueprints' config, with single quotes",
        },
      ],
      detect: detectPreset,
    },
  },

  /**
   * @param {import('#utils/project.js').Project} project
   * @param {Record<string, any>} options
   */
  async run(project, { preset }) {
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);
    /** Each preset is a folder in presets/ with only its .prettierrc.js */
    await files.applyFolder(join(import.meta.dirname, "presets", preset), project.directory);

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

  /**
   * @param {import('#utils/project.js').Project} project
   */
  readme(project) {
    return `### Prettier

Code formatting is managed with [Prettier](https://prettier.io/).

- \`${project.runPrefix} format\` - Format code
- \`${project.runPrefix} lint:prettier\` - Check code formatting`;
  },
};

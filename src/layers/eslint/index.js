import * as p from "@clack/prompts";

import { styleText } from "node:util";
import { getLatest } from "#utils/npm.js";
import { packageJson, files } from "ember-apply";
import { formatLabel } from "#utils/cli.js";

const configs = {
  /**
   * Closest to what the official blueprint does
   */
  eject: {
    "@babel/eslint-parser": "^7.28.6",
    "@eslint/js": "^9.39.2",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-ember": "^12.7.5",
    "eslint-plugin-n": "^17.23.2",
    "eslint-plugin-qunit": "^8.2.5",
    "typescript-eslint": "^8.53.0",
  },
  /**
   * Abstracts what the official blueprint does
   */
  ember: {
    deps: {
      "ember-eslint": "^0.6.1",
    },
  },
  /**
   * More abstract, more plugins
   */
  nvp: {
    deps: {
      "@nullvoxpopuli/eslint-configs": "^5.5.0",
    },
  },
};

export default {
  label: formatLabel("ESLint", "linting"),

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    let variant = await askVariant();

    let deps = configs[variant].deps;

    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
    await packageJson.addScripts(
      {
        lint: "eslint . --cache",
        "lint:fix": "eslint . --fix",
      },
      project.directory,
    );
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    let manifest = await packageJson.read(project.directory);

    let scripts = Object.values(manifest.scripts ?? {}).filter((script) =>
      script.includes("eslint"),
    );

    if (!scripts.some((script) => script.includes("--cache"))) {
      return false;
    }
    if (!scripts.some((script) => script.includes("--fix"))) {
      return false;
    }

    if (!existsSync(join(project.directory, "eslint.config.js"))) {
      return false;
    }

    return true;
  },
};

async function askVariant() {
  const layer = await p.select({
    required: true,
    message: "Which eslint config would you like to use?",
    options: [
      {
        value: "nvp",
        label: `NullVoxPopuli's config ${styleText("gray", "(some opinions and more automatic variant support without config changes)")}`,
      },
      {
        value: "ember",
        label: `ember-eslint ${styleText("gray", "(encapsulateed, follows official config)")}`,
      },
      {
        value: "eject",
        label: `fully ejected ${styleText("gray", "(you control all config and dependency versions)")}`,
      },
    ],
  });

  return layer;
}

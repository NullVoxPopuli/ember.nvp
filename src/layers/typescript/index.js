import { js, packageJson } from "ember-apply";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hasConfiguredTSBabel, prependPlugin } from "#utils/babel.js";
import { getLatest } from "#utils/npm.js";

const bases = join(import.meta.dirname, "../../bases");
const appBase = join(bases, "minimal-app/files");
const libraryBase = join(bases, "minimal-library/files");

const deps = {
  "@babel/plugin-transform-typescript": "^7.28.5",
  "@ember/app-tsconfig": "^2.0.0",
  "@glint/ember-tsc": "^1.0.8",
  "@glint/template": "^1.7.3",
  "@glint/tsserver-plugin": "^2.0.8",
  typescript: "^5.9.3",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "TypeScript",

  async run(project) {
    /**
     * if jsconfig exists, switch to tsconfig
     */
    /**
     * if tsconfig exists,
     */
    addTSConfig(project);
    updatePackageJson(project);
    updateBabelConfig(project);
  },

  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {true} explain
   * @returns {Promise<{ isSetup: boolean; reasons: string[] }>}
   */
  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {boolean | undefined} [explain]
   * @returns {Promise<boolean>}
   */
  async isSetup(project, explain) {
    const reasons = [];

    if (!project.hasFile("tsconfig.json")) {
      if (!explain) return false;

      reasons.push("tsconfig.json is missing");
    }

    if (!(await hasConfiguredTSBabel(project))) {
      if (!explain) return false;

      reasons.push(`babel.config is missing @babel/plugin-transform-typescript`);
    }

    let manifest = await packageJson.read(project.directory);

    if (!manifest.scripts?.["lint:types"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "lint:types" script`);
    }

    for (let dep of Object.keys(deps)) {
      if (!manifest.devDependencies?.[dep]) {
        if (!explain) return false;

        reasons.push(`package.json is missing ${dep} in devDependencies`);
      }
    }

    if (explain) {
      return {
        isSetup: reasons.length === 0,
        reasons,
      };
    }

    return reasons.length === 0;
  },
};

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updatePackageJson(project) {
  await packageJson.modify(async (json) => {
    json.scripts ||= {};
    json.devDependencies ||= {};

    Object.assign(json.scripts, {
      "lint:types": "ember-tsc --noEmit",
    });
    Object.assign(json.devDependencies, getLatest(deps));
  }, project.directory);
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function addTSConfig(project) {
  if (existsSync(project.path("tsconfig.json"))) {
    return;
  }

  if (project.type === "app") {
    await cp(join(appBase, "tsconfig.json"), project.path("tsconfig.json"));
    return;
  }

  if (project.type === "library") {
    await cp(join(libraryBase, "tsconfig.json"), project.path("tsconfig.json"));
  }
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updateBabelConfig(project) {
  if (await hasConfiguredTSBabel(project)) {
    return;
  }

  await prependPlugin(
    project,
    `[
      "@babel/plugin-transform-typescript",
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ]`,
  );
}

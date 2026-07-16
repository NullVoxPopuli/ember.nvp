import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { packageJson } from "ember-apply";
import { join } from "node:path";

const deps = {
  "@babel/core": "^7.28.10",
  "@babel/plugin-transform-typescript": "^7.28.5",
  "@ember/test-helpers": "^5.4.3",
  "@embroider/core": "^4.6.2",
  "@embroider/macros": "^1.20.5",
  "@embroider/vite": "^1.7.8",
  "@rollup/plugin-babel": "^7.1.0",
  "@vitest/browser": "^4.1.10",
  "@vitest/browser-webdriverio": "^4.1.10",
  "@vitest/ui": "^4.1.10",
  "babel-plugin-ember-template-compilation": "^4.0.0",
  "ember-vitest": "^0.4.0",
  vite: "^8.0.14",
  vitest: "^4.1.10",
  webdriverio: "^9.29.1",
};

const scripts = {
  test: "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
};

/**
 * ember-vitest's app-level testing API is experimental (not covered by
 * semver), so this layer only wires up libraries.
 *
 * @param {import('#utils/project.js').Project} project
 */
function isSupported(project) {
  return project.type === "library";
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Vitest",

  async run(project) {
    if (!isSupported(project)) return;

    await applyFolderTo(join(import.meta.dirname, "files"), project);

    await packageJson.addDevDependencies(await getLatest(deps), project.directory);

    await packageJson.addScripts(scripts, project.directory);
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

    if (!isSupported(project)) {
      if (!explain) return false;

      reasons.push(`vitest does not support ${project.type} projects`);
    }

    if (!project.hasFile("vitest.config.mjs")) {
      if (!explain) return false;

      reasons.push("vitest.config.mjs is missing");
    }

    let manifest = await packageJson.read(project.directory);

    for (let script of Object.keys(scripts)) {
      if (!manifest.scripts?.[script]) {
        if (!explain) return false;

        reasons.push(`package.json is missing the "${script}" script`);
      }
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

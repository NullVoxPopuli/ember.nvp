import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { packageJson } from "ember-apply";
import { join } from "node:path";

const deps = {
  "@ember/test-helpers": "^5.4.3",
  "@vitest/browser": "^4.1.10",
  "@vitest/browser-webdriverio": "^4.1.10",
  "@vitest/ui": "^4.1.10",
  "ember-vitest": "^0.4.0",
  vitest: "^4.1.10",
  webdriverio: "^9.29.1",
};

// Apps already get these from their base. The babel plugins are resolved
// by name from the project by @nullvoxpopuli/ember-vite's no-config babel
// fallback (decorator-transforms is already a base dependency).
const libraryDeps = {
  "@babel/plugin-transform-typescript": "^7.28.10",
  "@nullvoxpopuli/ember-vite": "workspace:*",
  "babel-plugin-ember-template-compilation": "^4.0.0",
  vite: "^8.0.14",
};

const scripts = {
  test: "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
};

/**
 * @param {import('#utils/project.js').Project} project
 */
function depsFor(project) {
  return {
    ...deps,
    ...(project.type === "library" ? libraryDeps : {}),
  };
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Vitest",

  async run(project) {
    await applyFolderTo(join(import.meta.dirname, "files"), project);

    await packageJson.addDevDependencies(await getLatest(depsFor(project)), project.directory);

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

    for (let dep of Object.keys(depsFor(project))) {
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

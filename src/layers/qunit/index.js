import { getLatest } from "#utils/npm.js";
import { packageJson, files } from "ember-apply";
import { join } from "node:path";

const deps = {
  "@ember/test-helpers": "^5.4.1",
  "@ember/test-waiters": "^4.1.0",
  "ember-qunit": "^9.0.4",
  "qunit-theme-ember": "^1.0.0",
  qunit: "^2.25.0",
  "qunit-dom": "3.5.0",
  testem: "3.17.0",
};
const tsDeps = {
  "@types/qunit": "^2.19.12",
};

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "QUnit",

  async run(project) {
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDevDependencies(
      {
        ...(await getLatest(deps)),
        ...(project.wantsTypeScript ? await getLatest(tsDeps) : {}),
      },
      project.directory,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        "build:test": "vite build --mode development",
        "test:browser": "testem --port 0",
        test: "pnpm build:test && pnpm test:browser",
      },
      project.directory,
    );
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
    let depsToCheck = [Object.keys(deps), project.wantsTypeScript ? Object.keys(tsDeps) : ""]
      .flat()
      .filter(Boolean);

    let manifest = await packageJson.read(project.directory);

    if (!manifest.scripts?.["build:test"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "build:test" script`);
    }

    if (!manifest.scripts?.["test:browser"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "build:browser" script`);
    }
    if (!manifest.scripts?.["test"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "test" script`);
    }

    for (let dep of depsToCheck) {
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

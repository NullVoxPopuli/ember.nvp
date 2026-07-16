import { packageJson } from "ember-apply";
import { writeFile } from "node:fs/promises";
import { getLatest } from "#utils/npm.js";
import {
  hasInspectorSupport,
  INSPECTOR_PACKAGE,
  wireInspectorSupport,
} from "#utils/inspector-support.js";

const deps = {
  [INSPECTOR_PACKAGE]: "^0.1.3",
};

const APPLICATION_FILES = ["app/app.ts", "app/app.js"];

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {string | undefined}
 */
function findApplicationFile(project) {
  return APPLICATION_FILES.find((file) => project.hasFile(file));
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "Inspector Support",
  hint: "Make the app inspectable by the Ember Inspector browser extension",

  async run(project) {
    let file = findApplicationFile(project);

    // libraries have no Application to wire
    if (!file) return;

    let path = project.path(file);
    let code = (await project.read(file)) ?? "";
    let wired = wireInspectorSupport(code, path);

    if (wired !== code) {
      await writeFile(path, wired);
    }

    // the dependency is only useful once the Application actually got
    // wired (the codemod leaves unrecognized Application shapes alone)
    if (!hasInspectorSupport(wired, path)) return;

    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
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
    let file = findApplicationFile(project);

    if (!file) {
      if (!explain) return false;

      reasons.push("there is no Application to wire (no app/app.ts or app/app.js)");
    } else {
      let code = (await project.read(file)) ?? "";

      if (!hasInspectorSupport(code, project.path(file))) {
        if (!explain) return false;

        reasons.push(`${file} does not wire ${INSPECTOR_PACKAGE} into the Application`);
      }
    }

    let manifest = await packageJson.read(project.directory);

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

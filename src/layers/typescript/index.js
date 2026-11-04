import { packageJson } from "ember-apply";
import { readManifest } from "#utils/manifest.js";
import { isLibraryType } from "#utils/project-type.js";
import { usesTypeScript7 } from "#utils/typescript.js";
import * as typescript6 from "./typescript-6.js";
import * as typescript7 from "./typescript-7.js";

/**
 * A project that has TypeScript 7 keeps it, even when version 6 is selected.
 * Nothing moves a project from 7 back to 6 yet.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function setupFor(project) {
  let manifest = await packageJson.read(project.directory);

  return usesTypeScript7(project, manifest) ? typescript7 : typescript6;
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "TypeScript",

  /**
   * Libraries publish declarations,
   * so they are TypeScript unless the user opts out.
   *
   * @param {import('#types').ProjectType} projectType
   */
  defaultValue(projectType) {
    return isLibraryType(projectType);
  },

  options: {
    version: {
      type: "select",
      prompt: "Which TypeScript version?",
      default: "7",
      options: [
        {
          value: "7",
          label: "TypeScript 7.1+",
          hint: "native tsc, checks .gts and .gjs with ember-content-mapper",
        },
        {
          value: "6",
          label: "TypeScript 6",
          hint: "checks with Glint's ember-tsc",
        },
      ],
      async detect(project) {
        let deps = (await readManifest(project)).devDependencies ?? {};

        if (deps["@typescript/native"]) return "7";
        if (deps.typescript) return "6";

        return undefined;
      },
    },
  },

  async run(project) {
    let setup = await setupFor(project);

    await setup.run(project);
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
    let manifest = await packageJson.read(project.directory);
    let setup = usesTypeScript7(project, manifest) ? typescript7 : typescript6;
    let reasons = await setup.reasons(project, manifest);

    if (explain) {
      return {
        isSetup: reasons.length === 0,
        reasons,
      };
    }

    return reasons.length === 0;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async readme(project) {
    let setup = await setupFor(project);

    return setup.readme(project);
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async agents(project) {
    let setup = await setupFor(project);

    return setup.agents(project);
  },
};

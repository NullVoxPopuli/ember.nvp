import { files } from "ember-apply";
import { hasGit, initGit, isInGit } from "#utils/git.js";
import { formatLabel } from "#utils/cli.js";
import { join } from "node:path";

export default {
  label: formatLabel("git init"),
  hint: "set up this project as a fresh git repository",

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async defaultValue(project) {
    return !isInGit();
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    if (hasGit(project.directory)) {
      return;
    }

    let initOk = initGit(project.directory);
    if (initOk) {
      await files.applyFolder(join(import.meta.dirname, "files"), project.directory);
    }
    return initOk;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    return hasGit(project.directory);
  },
};

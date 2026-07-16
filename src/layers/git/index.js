import { hasGit, initGit, isInGit } from "#utils/git.js";
import { formatLabel } from "#utils/cli.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cp } from "node:fs/promises";

export default {
  label: formatLabel("git init"),
  hint: "set up this project as a fresh git repository",

  async defaultValue() {
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
      let gitIgnorePath = join(import.meta.dirname, "files/gitignore");
      let targetPath = join(project.directory, ".gitignore");

      // Don't clobber a .gitignore provided by a base or by the user
      if (!existsSync(targetPath)) {
        await cp(gitIgnorePath, targetPath);
      }
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

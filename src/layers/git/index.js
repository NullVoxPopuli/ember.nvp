import * as p from "@clack/prompts";
import { hasGit, initGit, isInGit } from "#utils/git.js";

export default {
  name: "git",
  description: "set up this project as a fresh git repository",

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async defaultValue() {
    return !isInGit();
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    if (hasGit(project.directory)) {
      p.log.info(`.git directory already exists. skipping git init`);
      return;
    }

    return initGit(project.directory);
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    return hasGit(project.directory);
  },
};

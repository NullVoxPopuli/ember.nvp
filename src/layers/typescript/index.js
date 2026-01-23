import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * QUnit Layer
 *
 * Adds QUnit testing support (Ember's traditional testing framework)
 */
export default {
  label: "TypeScript",
  description: "Testing with QUnit",

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    /**
     * if jsconfig exists, switch to tsconfig
     */

    /**
     * if tsconfig exists,
     */
    throw new Error("Not implemented");
  },
};

import { packageJson, files } from "ember-apply";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

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
  },

  async isSetup() {
    return true;
  },
};

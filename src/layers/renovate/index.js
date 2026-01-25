import { files } from "ember-apply";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "renovate [bot]",
  hint: "Automatically have dependencies upgrade for you on a schedule",
  async run(project) {
    if (hasRenovateConfig(project)) {
      return;
    }

    let source =
      project.type === "app"
        ? join(import.meta.dirname, "files/app.json5")
        : join(import.meta.dirname, "files/library.json5");

    let destination = join(project.directory, ".github/renovate.json5");

    await mkdir(join(project.directory, ".github"), { recursive: true });
    await files.copyFileTo(destination, { source });
  },

  async isSetup(project) {
    return hasRenovateConfig(project);
  },
};

/**
 *
 * @param {import('#utils/project.js').Project} project
 * @returns
 */
function hasRenovateConfig(project) {
  let destination = join(project.directory, ".github/renovate.json5");
  return existsSync(destination);
}

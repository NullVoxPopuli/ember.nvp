import { mkdir } from "node:fs/promises";

import baseApp from "#bases/minimal-app";
import baseLibrary from "#bases/minimal-library";
/**
 * Generate project files by running layer functions
 *
 * @param {import('#utils/project.js').Project} project
 */
export async function generateProject(project) {
  await mkdir(project.directory, { recursive: true });

  switch (project.desires.type) {
    case "app":
      await baseApp.run();
      break;
    case "library":
      await baseLibrary.run();
      break;
  }

  for (const layer of project.desires.layers) {
    if (typeof layer.run === "function") {
      await layer.run({
        targetDir: project.directory,
        projectName,
      });
    }
  }
}

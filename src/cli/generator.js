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
      await baseApp.run(project);
      break;
    case "library":
      await baseLibrary.run(project);
      break;
  }

  for (const layer of project.desires.layers) {
    if (typeof layer.run !== "function") {
      console.warn(`${layer.name} is not implemented`);
      continue;
    }

    await layer.run(project);
  }
}

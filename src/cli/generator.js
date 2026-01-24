import { mkdir } from "node:fs/promises";

import baseApp from "#bases/minimal-app";
import baseLibrary from "#bases/minimal-library";
import { consolidateLintingScripts } from "../consolidators/linting.js";
/**
 * Generate project files by running layer functions
 *
 * @param {import('#types').Project} project
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

  /**
   * We could run these in a loop until there is no git diff
   */
  await runLap(project);
  await runLap(project);
}

async function runLap(project) {
  for (const layer of project.desires.layers) {
    if (typeof layer.isSetup === "function") {

      let isSetup = await layer.isSetup(project);

      if (typeof isSetup === 'boolean') {
        if (isSetup) {
          continue;
        }
      }
    }
    if (typeof layer.run !== "function") {
      console.warn(`${layer.name} is not implemented`);
      continue;
    }

    await layer.run(project);
  }

  await consolidateLintingScripts(project);
}

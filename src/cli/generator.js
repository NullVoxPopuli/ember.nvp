import { mkdir } from "node:fs/promises";

import baseApp from "#bases/minimal-app";
import baseLibrary from "#bases/minimal-library";
import { consolidateLintingScripts } from "../consolidators/linting.js";
import { hasGit } from "#utils/git.js";
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

  /**
   * We could run these in a loop until there is no git diff
   */
  await runLap(project);

  if (hasGit(project.directory)) {
    await project.gitAdd();

    if (await project.gitHasDiff()) {
      let layerNames = project.desires.layers.map((l) => l.name).join(", ");
      await project.gitCommit(
        `[ember.nvp] Applied ${layerNames} to ${project.type}: ${project.name} -- Please report issues to https://github.com/NullVoxPopuli/ember.nvp/`,
      );
    }
  }

  await runLap(project);

  if (hasGit(project.directory) && (await project.gitHasDiff())) {
    await project.gitAdd();
    await project.gitCommit(
      `[ember.nvp] Consolidation commit -- Please report issues to https://github.com/NullVoxPopuli/ember.nvp/`,
    );
  }
}

/**
 *
 * @param {import('#utils/project.js').Project} project
 */
async function runLap(project) {
  for (const layer of project.desires.layers) {
    if (typeof layer.run !== "function") {
      console.warn(`${layer.name} is not implemented`);
      continue;
    }

    await layer.run(project);
  }

  await consolidateLintingScripts(project);
}

import { mkdir, rm } from "node:fs/promises";

import { bases } from "#bases";
import { migrate } from "#migration-from";
import { consolidateLintingScripts } from "../consolidators/linting.js";
import { hasGit } from "#utils/git.js";
/**
 * Generate project files by running layer functions
 *
 * A project from an older blueprint is migrated first.
 * When it uses features that ember.nvp does not support,
 * this throws a `MigrationError` that lists them, before anything changes.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {string} [replaceOrUpdate]
 * @returns {Promise<{ todo: import('#types').Finding[] }>} work left for the user after a migration
 */
export async function generateProject(project, replaceOrUpdate) {
  if (replaceOrUpdate === "replace") {
    await rm(project.directory, { recursive: true });
  }

  await mkdir(project.directory, { recursive: true });

  let migration = await migrate(project);

  await bases[project.desires.type].run(project);

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

  await runLap(project);

  if (hasGit(project.directory) && (await project.gitHasDiff())) {
    await project.gitAdd();
    await project.gitCommit(
      `[ember.nvp] Consolidation commit -- Please report issues to https://github.com/NullVoxPopuli/ember.nvp/`,
    );
  }

  return { todo: migration?.report.todo ?? [] };
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

    const options = project.getLayerOptions(layer.name);
    await layer.run(project, options);
  }

  await consolidateLintingScripts(project);
}

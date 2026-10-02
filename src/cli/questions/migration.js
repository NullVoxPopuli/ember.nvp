import * as p from "@clack/prompts";
import { styleText } from "node:util";
import { checkMigration, formatFindings } from "#migration-from";
import { Project } from "#utils/project.js";

/**
 * A project from an older blueprint is migrated during the update.
 *
 * The check runs before the layer questions,
 * so that a project that ember.nvp cannot migrate stops here,
 * with the list of what to change first.
 *
 * @param {string} projectPath
 * @param {string} name
 * @param {import('#types').ProjectType} type
 * @returns {Promise<string[]>} layers that replace the old blueprint's tooling
 */
export async function checkForMigration(projectPath, name, type) {
  let project = new Project(projectPath, {
    name,
    type,
    path: projectPath,
    layers: [],
    packageManager: "pnpm",
  });

  let spinner = p.spinner();

  spinner.start("Checking for an older blueprint");

  let result = await checkMigration(project);

  if (!result) {
    spinner.stop("No older blueprint found");
    return [];
  }

  let { migration, report } = result;

  if (report.unsupported.length > 0) {
    spinner.stop(`This project is from ${migration.label}`);
    p.log.error(
      `ember.nvp cannot migrate this project yet. Change these first:\n\n` +
        formatFindings(report.unsupported),
    );

    if (report.todo.length > 0) {
      p.log.info(
        `After that, the migration leaves these for you:\n\n${formatFindings(report.todo)}`,
      );
    }

    p.cancel("Nothing was written");
    return process.exit(1);
  }

  spinner.stop(`Migrating from ${styleText("cyan", migration.label)}`);

  return report.layers;
}

/**
 * @param {import('#types').Finding[]} todo
 */
export function showTodo(todo) {
  if (todo.length === 0) return;

  p.note(formatFindings(todo), "Left to do after the migration");
}

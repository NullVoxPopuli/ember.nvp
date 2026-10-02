import addonBlueprint from "./at-ember/addon-blueprint/index.js";
import appBlueprint from "./at-ember/app-blueprint/index.js";
import classicAddon from "./at-ember-tooling/classic-build-addon-blueprint/index.js";
import classicApp from "./at-ember-tooling/classic-build-app-blueprint/index.js";
import { MigrationError } from "./findings.js";

export { MigrationError, formatFindings } from "./findings.js";

/**
 * The older blueprints that ember.nvp migrates from.
 *
 * Detection asks them in this order.
 * The markers of each one are its own, so the order only decides ties:
 * - a v2 addon builds with rollup and @embroider/addon-dev
 * - a classic addon has an index.js for ember-cli, and a dummy app in tests/
 * - a Vite app still has an ember-cli-build for @embroider/compat
 * - a classic app has an ember-cli-build without Vite
 *
 * @type {import('#types').Migration[]}
 */
export const migrations = [addonBlueprint, classicAddon, appBlueprint, classicApp];

/**
 * @param {string} directory an existing project
 * @returns {import('#types').Migration | undefined}
 */
export function detectMigration(directory) {
  return migrations.find((migration) => migration.detect(directory));
}

/**
 * Checks the project, and changes nothing.
 *
 * @param {import('#utils/project.js').Project} project
 * @returns {Promise<{ migration: import('#types').Migration, report: import('#types').MigrationReport } | undefined>}
 *   undefined when the project is not from an older blueprint
 */
export async function checkMigration(project) {
  let migration = detectMigration(project.directory);

  if (!migration) return;

  let report = await migration.check(project);

  if (migration.type !== project.type) {
    report.unsupported.unshift({
      title: `A ${migration.type} from ${migration.label}`,
      where: [`selected type: ${project.type}`],
      action: `Select "${migration.type}" as the project type.`,
    });
  }

  return { migration, report };
}

/**
 * Moves a project from an older blueprint to the ember.nvp base,
 * so that the base and the layers can run over it.
 *
 * Throws a MigrationError, before any change,
 * when the project uses features that ember.nvp does not support.
 *
 * @param {import('#utils/project.js').Project} project
 * @returns {Promise<{ migration: import('#types').Migration, report: import('#types').MigrationReport } | undefined>}
 *   undefined when the project is not from an older blueprint
 */
export async function migrate(project) {
  let result = await checkMigration(project);

  if (!result) return;

  let { migration, report } = result;

  if (report.unsupported.length > 0) {
    throw new MigrationError(migration.label, report.unsupported);
  }

  await migration.run(project, report);

  return result;
}

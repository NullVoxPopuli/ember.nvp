/**
 * @typedef {import('#types').Finding} Finding
 */

/**
 * Past this many, a finding's `where` list ends with "and N more".
 */
const LISTED = 8;

/**
 * Thrown when a project uses features that ember.nvp cannot migrate.
 *
 * Nothing is written before this is thrown.
 */
export class MigrationError extends Error {
  /**
   * @param {string} from the old blueprint
   * @param {Finding[]} findings
   */
  constructor(from, findings) {
    super(
      `ember.nvp cannot migrate this project from ${from}.\n` +
        `Fix these items, then run ember.nvp again:\n\n` +
        formatFindings(findings),
    );

    this.name = "MigrationError";
    this.from = from;
    this.findings = findings;
  }
}

/**
 * A numbered list:
 *
 *   1. Templates in .hbs files
 *      - src/components/foo.hbs
 *      Move each template into its component as <template>.
 *
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  /** @type {string[]} */
  let lines = [];

  for (let i = 0; i < findings.length; i++) {
    let finding = /** @type {Finding} */ (findings[i]);
    let where = finding.where ?? [];

    lines.push(`${i + 1}. ${finding.title}`);

    for (let j = 0; j < where.length && j < LISTED; j++) {
      lines.push(`   - ${where[j]}`);
    }

    if (where.length > LISTED) {
      lines.push(`   - and ${where.length - LISTED} more`);
    }

    for (let line of finding.action.split("\n")) {
      lines.push(`   ${line}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

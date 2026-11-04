import * as p from "@clack/prompts";
import { printArgInUse } from "#args";

/**
 * Prompts need a terminal.
 * Without one (CI, scripts, coding agents), clack ends each prompt as cancelled,
 * and the CLI would stop without writing anything.
 */
export function isTTY() {
  return Boolean(process.stdin.isTTY);
}

/**
 * Answers a question without asking it:
 * with the question's default, or by exiting with the flag to pass.
 *
 * @template T
 * @param {string} flag
 * @param {T | undefined} fallback the answer that Enter would choose
 * @param {{ given?: unknown, reason?: string }} [invalid] a flag value that was passed, but is not valid
 * @returns {T}
 */
export function answer(flag, fallback, invalid = {}) {
  if (invalid.given !== undefined) {
    return exit(
      `Invalid value '${String(invalid.given)}' for --${flag}.${invalid.reason ? ` ${invalid.reason}` : ""}`,
    );
  }

  if (fallback === undefined) {
    return exit(`--${flag} is required.`);
  }

  printArgInUse(flag, `${show(fallback)} (default)`);

  return fallback;
}

/**
 * @param {unknown} value
 */
function show(value) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "none";

  return String(value);
}

/**
 * @param {string} message
 * @returns {never}
 */
function exit(message) {
  p.log.error(message);
  p.cancel("Nothing was written");

  return process.exit(1);
}

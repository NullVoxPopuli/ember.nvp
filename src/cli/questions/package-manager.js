import * as p from "@clack/prompts";
import { answers, printArgInUse } from "#args";

const SUPPORTED = new Set(["pnpm", "npm"]);

/**
 *
 * @param {string | undefined} selected
 * @returns {selected is 'pnpm' | 'npm'}
 */
function isValid(selected) {
  if (!selected) return false;

  return SUPPORTED.has(selected);
}

/**
 *
 * @returns {Promise<import('#types').PackageManager>}
 */
export async function askPackageManager() {
  if (isValid(answers.packageManager)) {
    printArgInUse("packageManager", answers.packageManager);

    return answers.packageManager;
  }

  const packageManager = await p.select({
    message: "Which package manager?",
    options: [
      { value: "pnpm", label: "pnpm", hint: "Fast, disk space efficient" },
      { value: "npm", label: "npm", hint: "Node default" },
    ],
  });

  if (p.isCancel(packageManager)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return packageManager;
}

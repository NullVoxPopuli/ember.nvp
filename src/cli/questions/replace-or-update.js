import * as p from "@clack/prompts";

import { join } from "node:path";
import { answers, printArgInUse } from "#args";
import { cwd } from "#utils/cwd.js";
import { existsSync } from "node:fs";

/**
 *
 * @param {string | undefined} value
 * @returns
 */
function isValid(value) {
  if (!value) return false;

  return value === "replace" || value === "update";
}

/**
 * @param {string} name -- the projectName
 */
export async function askReplaceOrUpdate(projectPath) {
  if (!existsSync(projectPath)) {
    return;
  }

  if (answers.replaceOrUpdate) {
    if (isValid(answers.replaceOrUpdate)) {
      printArgInUse("replaceOrUpdate", answers.replaceOrUpdate);

      return answers.replaceOrUpdate;
    }
  }

  const defaultValue = "update";

  const answer = await p.select({
    message: "Replace or update at the selected path",
    initialValue: "update",
    options: [
      {
        value: "update",
        label: "update",
        hint: "Updates the project in the target directory, if one exists",
      },
      {
        value: "replace",
        label: "replace",
        hint: "Deletes the target directory and generates a new project",
      },
    ],
  });

  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return defaultValue;
}

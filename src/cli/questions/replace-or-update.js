import * as p from "@clack/prompts";

import { answers, printArgInUse } from "#args";
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
 * @param {string} projectPath -- the path the project will be generated in
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

  return answer;
}

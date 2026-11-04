import * as p from "@clack/prompts";

import { answers, printArgInUse } from "#args";
import { answerWithoutTerminal, isTTY } from "./terminal.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "#utils/cwd.js";

/**
 *
 * @param {string | undefined} value
 * @returns {value is "replace" | "update"}
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

  if (!isTTY()) {
    return answerWithoutTerminal("replaceOrUpdate", "update", { given: answers.replaceOrUpdate });
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

/**
 * A package.json in the current directory is most likely the project to work on.
 * This question comes before the name, so that an update can default to that project's name.
 *
 * Skipped when `--path` picks the target.
 *
 * @returns {Promise<"replace" | "update" | undefined>} undefined for a new project in another directory
 */
export async function askAboutProjectHere() {
  if (answers.path) return;
  if (!existsSync(join(cwd, "package.json"))) return;

  if (isValid(answers.replaceOrUpdate)) {
    printArgInUse("replaceOrUpdate", answers.replaceOrUpdate);

    return answers.replaceOrUpdate;
  }

  if (!isTTY()) {
    return answerWithoutTerminal("replaceOrUpdate", "update", { given: answers.replaceOrUpdate });
  }

  const answer = await p.select({
    message: "This directory has a package.json. What would you like to do?",
    initialValue: "update",
    options: [
      {
        value: "update",
        label: "update",
        hint: "Updates the project in this directory",
      },
      {
        value: "replace",
        label: "replace",
        hint: "Deletes this directory and generates a new project in it",
      },
      {
        value: "new",
        label: "new",
        hint: "Generates a new project in another directory",
      },
    ],
  });

  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return isValid(answer) ? answer : undefined;
}

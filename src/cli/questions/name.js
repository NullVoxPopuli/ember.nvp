import { cancel, isCancel, text } from "@clack/prompts";
import packageNameRegex from "package-name-regex";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { answers, printArgInUse } from "#args";
import { answerWithoutTerminal, hasTerminal } from "./terminal.js";

const DEFAULT = "my-app";

/**
 * @param {string} [existingProject] a directory whose package.json name fills in the answer
 */
export async function askName(existingProject) {
  if (answers.name) {
    let isValid = packageNameRegex.test(answers.name);
    if (isValid) {
      printArgInUse("name", answers.name);

      return answers.name;
    }
  }

  let existingName = existingProject ? readName(existingProject) : undefined;
  let fallback = existingName ?? DEFAULT;

  if (!hasTerminal()) {
    return answerWithoutTerminal("name", fallback, {
      given: answers.name,
      reason: "It must be a valid npm package name.",
    });
  }

  const projectName = await text({
    message: "What is your project name?",
    placeholder: fallback,
    defaultValue: fallback,
    initialValue: existingName,
    validate(value) {
      if (!value || value.length === 0) return;

      let isValid = packageNameRegex.test(value);

      if (!isValid) {
        return "Project name must be a valid npm package-name";
      }
    },
  });

  if (isCancel(projectName)) {
    cancel("Operation cancelled");
    return process.exit(0);
  }

  return projectName ?? fallback;
}

/**
 * @param {string} directory
 * @returns {string | undefined}
 */
function readName(directory) {
  let { name } = JSON.parse(readFileSync(join(directory, "package.json"), "utf-8"));

  if (typeof name === "string" && packageNameRegex.test(name)) {
    return name;
  }
}

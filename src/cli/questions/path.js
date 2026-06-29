import { cancel, isCancel, text } from "@clack/prompts";
import { join } from "node:path";
import { answers, printArgInUse } from "#args";
import { cwd } from "#utils/cwd.js";

/**
 *
 * @param {string | undefined} value
 * @returns
 */
function isValid(value) {
  if (!value) return false;

  return value.startsWith(".") || value.startsWith("/");
}

/**
 * @param {string} name -- the projectName
 */
export async function askPath(name) {
  if (answers.path) {
    if (isValid(answers.path)) {
      printArgInUse("path", answers.path);

      return answers.path;
    }
  }

  const defaultValue = join(cwd, name);

  const answer = await text({
    message: "Where would you like to place your project?",
    placeholder: defaultValue.replace(cwd, "."),
    defaultValue: defaultValue,
    validate(value) {
      if (!value || value.length === 0) return;

      if (!isValid(value)) {
        return `Path must start with a '.' or '/' (be either a relative or absolute path)`;
      }
    },
  });

  if (isCancel(answer)) {
    cancel("Operation cancelled");
    return process.exit(0);
  }

  if (answer) {
    if (answer.startsWith(".")) {
      return join(cwd, answer);
    }

    return answer;
  }

  return defaultValue;
}

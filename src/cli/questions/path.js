import * as p from "@clack/prompts";

import { join } from "node:path";
import { answers, printArgInUse } from "#args";
import { cwd } from "#utils/cwd.js";

/**
 * @param {string} name -- the projectName
 */
export async function askPath(name) {
  if (answers.path) {
    if (isValid) {
      printArgInUse("path", answers.path);

      return answers.path;
    }
  }

  const defaultValue = join(cwd, name);

  const answer = await p.text({
    message: "Where would you like to place your project?",
    placeholder: defaultValue.replace(cwd, "."),
    defaultValue: defaultValue,
  });

  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return answer ?? defaultValue;
}

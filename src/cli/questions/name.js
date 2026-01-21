import * as p from "@clack/prompts";

import packageNameRegex from "package-name-regex";
import { answers } from "#args";

const DEFAULT = "my-app";

export async function askName() {
  if (answers.name) {
    let isValid = packageNameRegex.test(answers.name);
    if (isValid) {
      return answers.name;
    }
  }
  const projectName = await p.text({
    message: "What is your project name?",
    placeholder: DEFAULT,
    defaultValue: DEFAULT,
    validate(value) {
      if (value.length === 0) return;

      let isValid = packageNameRegex.test(value);

      if (!isValid) {
        return "Project name must be a valid npm package-name";
      }
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return projectName ?? DEFAULT;
}

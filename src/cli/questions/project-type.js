import * as p from "@clack/prompts";
import { answers } from "#args";

/**
 * addon is alias for library
 */
const SUPPORTED = new Set(["app", "library", "addon"]);

function isValid(selected) {
  if (!selected) return false;

  return SUPPORTED.has(selected);
}

export async function askProjectType() {
  if (isValid(answers.type)) {
    if (answers.type === "addon") return "library";

    return answers.type;
  }

  const packageManager = await p.select({
    message: "Which type of project?",
    options: [
      { value: "app", label: "web app", hint: "generates html, js, and css to deploy to the web" },
      {
        value: "library",
        label: "library",
        hint: "sharable code, usable by other libraries and apps alike",
      },
    ],
  });

  if (p.isCancel(packageManager)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return packageManager;
}

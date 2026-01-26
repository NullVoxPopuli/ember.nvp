import * as p from "@clack/prompts";
import { answers, printArgInUse } from "#args";

/**
 * addon is alias for library
 */
const SUPPORTED = new Set(["app", "library", "addon"]);

/**
 * @param {string | undefined} selected
 * @returns {selected is "app" | "library" | "addon"}
 */
function isValid(selected) {
  if (!selected) return false;

  return SUPPORTED.has(selected);
}

/**
 *
 * @return {Promise<import('#types').ProjectType>}
 */
export async function askProjectType() {
  if (isValid(answers.type)) {
    printArgInUse("type", answers.type);

    if (answers.type === "addon") return "library";

    return answers.type;
  }

  const answer = await p.select({
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

  if (answer === "library") {
    p.cancel("Not implemented yet, apologies!");
    return process.exit(0);
  }

  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return answer;
}

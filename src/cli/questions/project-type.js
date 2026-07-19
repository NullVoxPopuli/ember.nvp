import * as p from "@clack/prompts";
import { answers, printArgInUse } from "#args";

/**
 * addon is alias for library
 * web-extension is alias for extension
 */
const SUPPORTED = new Set(["app", "library", "addon", "extension", "web-extension"]);

/**
 * @param {string | undefined} selected
 * @returns {selected is "app" | "library" | "addon" | "extension" | "web-extension"}
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
    if (answers.type === "web-extension") return "extension";

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
      {
        value: "extension",
        label: "browser extension",
        hint: "Manifest V3 extension whose popup is an Ember app",
      },
    ],
  });

  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return answer;
}

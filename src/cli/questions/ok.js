import * as p from "@clack/prompts";
import { answers, printArgInUse } from "#args";

const SUPPORTED = new Set(["yes", "no"]);

/**
 *
 * @param {string | undefined} selected
 * @returns {selected is 'yes' | 'no'}
 */
function isValid(selected) {
  if (!selected) return false;

  return SUPPORTED.has(selected);
}

export async function askIfOK() {
  if (isValid(answers.confirm)) {
    printArgInUse("confirm", answers.confirm);

    return answers.confirm;
  }

  const answer = await p.select({
    message: "Do all the selections above look ok?",
    options: [
      { value: "yes", label: "yes, generate the project" },
      { value: "no", label: "no, cancel" },
    ],
  });

  if (p.isCancel(answer) || answer === "no") {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return answer;
}

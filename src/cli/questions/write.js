import * as p from "@clack/prompts";
import { styleText } from "node:util";

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

/**
 * Nothing has been written to the target directory yet -- everything so
 * far only exists in the stage. Ask whether to write the staged changes,
 * with the option to view the diff first.
 *
 * @param {import('#utils/stage.js').Stage} stage
 * @param {import('#utils/stage.js').Change[]} changes
 * @returns {Promise<boolean>} true when the changes should be written
 */
export async function askToWrite(stage, changes) {
  if (isValid(answers.write)) {
    printArgInUse("write", answers.write);

    return answers.write === "yes";
  }

  p.note(summarize(changes), `${changes.length} staged change${changes.length === 1 ? "" : "s"}`);

  while (true) {
    const answer = await p.select({
      message: `Write these changes to ${stage.targetDirectory}?`,
      options: [
        { value: "yes", label: "write the files", hint: "apply the staged changes" },
        { value: "diff", label: "view the diff", hint: "see exactly what would change" },
        { value: "no", label: "cancel", hint: "discard the staged changes, touching nothing" },
      ],
    });

    if (p.isCancel(answer) || answer === "no") {
      return false;
    }

    if (answer === "yes") {
      return true;
    }

    // Bypass clack for the diff itself: diffs are long, and clack's
    // log decorations wrap every line.
    console.log("\n" + (await stage.diff(changes)));
  }
}

/**
 * @param {import('#utils/stage.js').Change[]} changes
 * @returns {string}
 */
function summarize(changes) {
  const colors = /** @type {const} */ ({
    added: "green",
    modified: "yellow",
    deleted: "red",
  });

  return changes
    .map((change) => {
      const letter = change.status[0]?.toUpperCase() ?? "?";

      return `${styleText(colors[change.status], letter)} ${change.path}`;
    })
    .join("\n");
}

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
 * with the option to review the diff change-by-change, accepting or
 * rejecting each one.
 *
 * @param {import('#utils/stage.js').Stage} stage
 * @param {import('#utils/stage.js').Change[]} changes
 * @returns {Promise<import('#utils/stage.js').Change[] | null>}
 *   the changes to write, or null to cancel without writing anything
 */
export async function askToWrite(stage, changes) {
  if (isValid(answers.write)) {
    printArgInUse("write", answers.write);

    return answers.write === "yes" ? changes : null;
  }

  p.note(summarize(changes), `${changes.length} staged change${changes.length === 1 ? "" : "s"}`);

  const answer = await p.select({
    message: `Write these changes to ${stage.targetDirectory}?`,
    options: [
      { value: "yes", label: "write the files", hint: "apply all staged changes" },
      {
        value: "review",
        label: "review the diff",
        hint: "step through each change, accepting or rejecting it",
      },
      { value: "no", label: "cancel", hint: "discard the staged changes, touching nothing" },
    ],
  });

  if (p.isCancel(answer) || answer === "no") {
    return null;
  }

  if (answer === "yes") {
    return changes;
  }

  return reviewEachChange(stage, changes);
}

/**
 * Show each change's diff and ask what to do with it. "accept remaining"
 * and "reject remaining" finish the review early, so they require an
 * extra confirmation; declining the confirmation returns to the change
 * being reviewed.
 *
 * @param {import('#utils/stage.js').Stage} stage
 * @param {import('#utils/stage.js').Change[]} changes
 * @returns {Promise<import('#utils/stage.js').Change[] | null>}
 *   the accepted changes, or null to cancel the whole run
 */
async function reviewEachChange(stage, changes) {
  /** @type {import('#utils/stage.js').Change[]} */
  const accepted = [];
  let index = 0;

  while (index < changes.length) {
    const change = changes[index];

    if (!change) break;

    const remaining = changes.length - index;

    // Bypass clack for the diff itself: diffs are long, and clack's
    // log decorations wrap every line.
    console.log("\n" + (await stage.diff([change])));

    const answer = await p.select({
      message: `${change.path} (${index + 1} of ${changes.length})`,
      options: [
        { value: "accept", label: "accept", hint: "write this change" },
        { value: "reject", label: "reject", hint: "skip this change" },
        ...(remaining > 1
          ? /** @type {const} */ ([
              {
                value: "accept-remaining",
                label: "accept remaining",
                hint: `accept this and the ${remaining - 1} unreviewed change${remaining - 1 === 1 ? "" : "s"} after it`,
              },
              {
                value: "reject-remaining",
                label: "reject remaining",
                hint: `reject this and the ${remaining - 1} unreviewed change${remaining - 1 === 1 ? "" : "s"} after it`,
              },
            ])
          : []),
      ],
    });

    if (p.isCancel(answer)) {
      return null;
    }

    if (answer === "accept") {
      accepted.push(change);
      index++;
      continue;
    }

    if (answer === "reject") {
      index++;
      continue;
    }

    const bulkAccept = answer === "accept-remaining";
    const confirmed = await p.confirm({
      message: `${bulkAccept ? "Accept" : "Reject"} all ${remaining} remaining change${remaining === 1 ? "" : "s"} without reviewing them?`,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      // return to the change being reviewed
      continue;
    }

    if (bulkAccept) {
      accepted.push(...changes.slice(index));
    }

    break;
  }

  p.log.info(
    `Accepted ${accepted.length} of ${changes.length} change${changes.length === 1 ? "" : "s"}`,
  );

  return accepted;
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

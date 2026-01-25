import * as p from "@clack/prompts";
import { styleText, parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: {
      type: "string",
    },

    path: {
      type: "string",
    },

    type: {
      type: "string",
      choices: ["app", "addon", "library"],
    },

    confirm: {
      type: "string",
      choices: ["yes", "no"],
    },

    layers: {
      type: "string",
      multiple: true,
    },

    packageManager: {
      type: "string",
      choices: ["npm", "pnpm"],
    },
  },
});

const { name, type, layers = [], packageManager, path, confirm } = values;

export const answers = {
  name,
  type,
  layers,
  packageManager,
  path,
  confirm,
};

/**
 *
 * @param {string} label
 * @param {string} value
 */
export function printArgInUse(label, value) {
  let l = styleText(["gray", "bold"], label);
  let v = styleText(["yellow", "italic"], value);
  let u = styleText("dim", "using");
  p.log.info(`${u} ${l}: ${v}`);
}

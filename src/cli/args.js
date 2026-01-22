import * as p from "@clack/prompts";
import { styleText, parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: {
      type: "string",
    },

    type: {
      type: "string",
      choices: ["app", "addon", "library"],
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

const { name, type, layers = [], packageManager } = values;

export const answers = { name, type, layers, packageManager };

export function printArgInUse(label, value) {
  let l = styleText(["gray", "bold"], label);
  let v = styleText(["yellow", "italic"], value);
  let u = styleText("dim", "using");
  p.log.info(`${u} ${l}: ${v}`);
}

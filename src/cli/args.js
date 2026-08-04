import * as p from "@clack/prompts";
import { styleText, parseArgs } from "node:util";

const options = /** @type {const} */ ({
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

  replaceOrUpdate: {
    type: "string",
    choices: ["replace", "update"],
  },

  write: {
    type: "string",
    choices: ["yes", "no"],
  },
});

const knownOptions = new Set(Object.keys(options));

function filterKnownArgs(/** @type {string[]} */ argv) {
  /** @type {string[]} */
  const filtered = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg.startsWith("--")) {
      const flagName = arg.slice(2).split("=")[0] ?? "";
      if (knownOptions.has(flagName)) {
        filtered.push(arg);
        const nextArg = argv[i + 1];
        if (!arg.includes("=") && nextArg !== undefined && !nextArg.startsWith("--")) {
          filtered.push(nextArg);
          i++;
        }
      }
    }
  }
  return filtered;
}

const { values } = parseArgs({
  args: filterKnownArgs(process.argv.slice(2)),
  options,
});

const { replaceOrUpdate, name, type, layers = [], packageManager, path, confirm, write } = values;

export const answers = {
  name,
  type,
  layers,
  packageManager,
  path,
  confirm,
  replaceOrUpdate,
  write,
};

/**
 * Parse CLI args for layer options in format:
 * --<layerName>.<optionKey> <val>
 *
 * @param {import('#types').DiscoveredLayer[]} layers
 * @param {string[]} [argv]
 * @returns {Record<string, Record<string, any>>}
 */
export function parseLayerOptionsFromArgv(layers = [], argv = process.argv.slice(2)) {
  /** @type {Record<string, Record<string, any>>} */
  const result = {};

  const camelize = (/** @type {string} */ str) =>
    str.replace(/[-_]([a-z])/gi, (/** @type {string} */ _, /** @type {string} */ letter) =>
      letter.toUpperCase(),
    );

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;

    let flagName = arg.slice(2);
    /** @type {string | undefined} */
    let val = undefined;

    if (flagName.includes("=")) {
      const parts = flagName.split("=");
      flagName = parts[0] ?? "";
      val = parts.slice(1).join("=");
    } else if (i + 1 < argv.length && !argv[i + 1]?.startsWith("--")) {
      val = argv[i + 1];
    } else {
      val = "true";
    }

    for (const layer of layers) {
      if (!layer.options) continue;

      if (!flagName.startsWith(`${layer.name}.`)) continue;
      const optionKey = flagName.slice(layer.name.length + 1);

      const camelKey = camelize(optionKey);
      const matchedKey = Object.keys(layer.options).find(
        (k) => k === optionKey || k === camelKey || k.toLowerCase() === optionKey.toLowerCase(),
      );

      if (matchedKey) {
        const schema = layer.options[matchedKey];
        if (!schema) continue;

        /** @type {any} */
        let parsedVal = val;
        if (schema.type === "number") {
          parsedVal = Number(val);
        } else if (schema.type === "confirm") {
          parsedVal = val === "true" || val === "yes";
        }

        const layerObj = (result[layer.name] ??= {});
        layerObj[matchedKey] = parsedVal;
      }
    }
  }

  return result;
}

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

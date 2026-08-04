import * as p from "@clack/prompts";
import { styleText, parseArgs } from "node:util";
import { layers as discoveredLayers } from "#layers";

const coreOptions = /** @type {const} */ ({
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

/** @type {Record<string, import("node:util").ParseArgsOptionDescriptor>} */
const options = { ...coreOptions };

for (const layer of discoveredLayers) {
  if (!layer.options) continue;
  for (const [optionKey, schema] of Object.entries(layer.options)) {
    options[`${layer.name}.${optionKey}`] = {
      type: schema.type === "confirm" ? "boolean" : "string",
    };
  }
}

/**
 * The CLI options are parsed by combining the static core flags (--name, --type, etc.) with
 * dynamic options discovered at startup from each layer in #layers (formatted as
 * --<layerName>.<optionKey>).  This lets us use Node's `parseArgs` in default strict mode.
 */
const { values } = parseArgs({
  args: process.argv.slice(2),
  options,
});

const typedValues =
  /** @type {ReturnType<typeof parseArgs<{ options: typeof coreOptions }>>['values']} */ (values);

export const answers = {
  ...typedValues,
  layers: typedValues.layers ?? [],
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

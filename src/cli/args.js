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
 * Extract layer options from parsed CLI values.
 *
 * @param {import('#types').DiscoveredLayer[]} layers
 * @param {Record<string, any>} [parsedValues] Defaults to module-level `values` from parseArgs
 * @returns {Record<string, Record<string, any>>}
 */
export function parseLayerOptionsFromParsedArgs(layers = [], parsedValues = values) {
  /** @type {Record<string, Record<string, any>>} */
  const result = {};

  for (const layer of layers) {
    if (!layer.options) continue;

    for (const [optionKey, schema] of Object.entries(layer.options)) {
      const flagKey = `${layer.name}.${optionKey}`;
      const rawVal = parsedValues[flagKey];

      if (rawVal !== undefined) {
        /** @type {any} */
        let parsedVal = rawVal;
        if (schema.type === "number") {
          parsedVal = Number(rawVal);
        } else if (schema.type === "confirm") {
          parsedVal = Boolean(rawVal);
        }

        const layerObj = (result[layer.name] ??= {});
        layerObj[optionKey] = parsedVal;
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

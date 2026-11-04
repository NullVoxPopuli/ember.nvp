import * as p from "@clack/prompts";
import { styleText, parseArgs } from "node:util";
import { layers as discoveredLayers, layerNames } from "#layers";
import { validateOption } from "./questions/validate-option.js";
import { printHelp } from "./help.js";

export const coreOptions = /** @type {const} */ ({
  help: {
    type: "boolean",
    short: "h",
    description: "Show CLI help and option details",
  },

  name: {
    type: "string",
    description: "Name of the project",
  },

  path: {
    type: "string",
    description: "Target directory path for the project",
  },

  type: {
    type: "string",
    choices: ["app", "addon", "library", "extension", "custom-element"],
    description: "Type of project to generate",
  },

  confirm: {
    type: "string",
    choices: ["yes", "no"],
    description: "Bypass target confirmation step",
  },

  layers: {
    type: "string",
    multiple: true,
    choices: layerNames,
    description: "Layers to apply to the project, in addition to the default layers",
  },

  "skip-layers": {
    type: "string",
    multiple: true,
    choices: layerNames,
    description: "Default layers to leave out",
  },

  packageManager: {
    type: "string",
    choices: ["npm", "pnpm"],
    description: "Package manager to configure for the project",
  },

  replaceOrUpdate: {
    type: "string",
    choices: ["replace", "update"],
    description: "Strategy to use if target directory exists",
  },

  write: {
    type: "string",
    choices: ["yes", "no"],
    description: "Confirm writing changes to disk",
  },
});

/**
 * This lightweight check is here because Node's `parseArgs` is in strict mode.
 * If a user runs `npx ember.nvp --help` alongside invalid or unknown flags,
 * standard strict parsing would throw a `TypeError (ERR_PARSE_ARGS_UNKNOWN_OPTION)`
 * before reaching any help handler. Pre-checking raw arguments ensures `--help`
 * always prints successfully regardless of invalid flags.
 */
const isHelpRequested = process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h");
if (isHelpRequested) {
  printHelp(coreOptions, discoveredLayers);
  process.exit(0);
}

/**
 * Parse the core flags, plus one `--<layer>.<option>` flag per layer option.
 *
 * Every layer adds its flags, not only the selected ones,
 * because layers are selected after parsing.
 *
 * Throws on an unknown flag, or on a value given to a boolean flag.
 *
 * @param {string[]} args
 * @param {import('#types').DiscoveredLayer[]} layers
 */
export function parseCliArgs(args, layers) {
  /** @type {Record<string, import("node:util").ParseArgsOptionDescriptor>} */
  const options = { ...coreOptions };

  for (const layer of layers) {
    for (const [key, schema] of Object.entries(layer.options ?? {})) {
      options[`${layer.name}.${key}`] = {
        type: schema.type === "confirm" ? "boolean" : "string",
        multiple: schema.type === "multiselect",
      };
    }
  }

  // allowNegative makes `--no-<layer>.<option>` turn a "confirm" option off
  return parseArgs({ args, options, allowNegative: true }).values;
}

/** @type {ReturnType<typeof parseCliArgs>} */
let values;

try {
  values = parseCliArgs(process.argv.slice(2), discoveredLayers);
} catch (error) {
  // parseArgs errors name the flag, so a stack trace adds nothing for the user
  p.cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const typedValues =
  /** @type {ReturnType<typeof parseArgs<{ options: typeof coreOptions }>>['values']} */ (values);

export const answers = {
  ...typedValues,
  layers: typedValues.layers ?? [],
  "skip-layers": typedValues["skip-layers"] ?? [],
};

/**
 * Extract layer options from parsed CLI values.
 *
 * Exits when a value does not pass the option's validation.
 *
 * @param {import('#types').DiscoveredLayer[]} layers
 * @param {Record<string, any>} [parsedValues] Defaults to the parsed `process.argv`
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

      if (rawVal === undefined) continue;

      const validation = validateOption(
        schema,
        schema.type === "multiselect" ? splitCommas(rawVal) : rawVal,
      );

      if (!validation.ok) {
        p.cancel(`Invalid CLI argument '--${flagKey}': ${validation.error}`);
        process.exit(1);
      }

      (result[layer.name] ??= {})[optionKey] = validation.value;
    }
  }

  return result;
}

/**
 * `--x.y a,b` means the same as `--x.y a --x.y b`
 *
 * @param {string[]} values
 * @returns {string[]}
 */
function splitCommas(values) {
  /** @type {string[]} */
  const result = [];

  for (const value of values) {
    for (const part of value.split(",")) {
      const trimmed = part.trim();

      if (trimmed) result.push(trimmed);
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

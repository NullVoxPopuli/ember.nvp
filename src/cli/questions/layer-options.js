import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { printArgInUse, parseLayerOptionsFromParsedArgs } from "#args";
import { validateOption } from "./validate-option.js";

/**
 * Prompt the user for options defined on the selected layers.
 * Skips options that were explicitly provided via CLI flags.
 *
 * @param {import('#types').DiscoveredLayer[]} selectedLayers
 * @returns {Promise<Record<string, Record<string, any>>>}
 */
export async function askLayerOptions(selectedLayers) {
  const cliOptions = parseLayerOptionsFromParsedArgs(selectedLayers);
  /** @type {Record<string, Record<string, any>>} */
  const result = {};

  for (const layer of selectedLayers) {
    if (!layer.options || Object.keys(layer.options).length === 0) {
      continue;
    }

    const layerResult = (result[layer.name] ??= {});

    for (const [key, schema] of Object.entries(layer.options)) {
      const layerCliOpts = cliOptions[layer.name];
      if (layerCliOpts && layerCliOpts[key] !== undefined) {
        layerResult[key] = layerCliOpts[key];
        printArgInUse(`${layer.name}.${key}`, String(layerCliOpts[key]));
        continue;
      }

      let answer;
      const layerNamePrefix = styleText("magentaBright", layer.name);
      const promptMessage = `${layerNamePrefix}: ${schema.prompt ?? key}`;

      switch (schema.type) {
        case "number": {
          const raw = await p.text({
            message: promptMessage,
            placeholder: schema.default !== undefined ? String(schema.default) : undefined,
            defaultValue: schema.default !== undefined ? String(schema.default) : undefined,
            validate: (input) => {
              const res = validateOption(schema, input);
              return res.ok ? undefined : res.error;
            },
          });

          if (p.isCancel(raw)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }

          const valStr =
            (!raw || raw.length === 0) && schema.default !== undefined
              ? String(schema.default)
              : raw;
          // @clack/prompts p.text returns a string, so coerce to a number for schema type "number"
          answer = Number(valStr);
          break;
        }
        case "text": {
          const raw = await p.text({
            message: promptMessage,
            placeholder: schema.default !== undefined ? String(schema.default) : undefined,
            defaultValue: schema.default !== undefined ? String(schema.default) : undefined,
            validate: (input) => {
              const res = validateOption(schema, input);
              return res.ok ? undefined : res.error;
            },
          });

          if (p.isCancel(raw)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }

          answer =
            (!raw || raw.length === 0) && schema.default !== undefined
              ? String(schema.default)
              : raw;
          break;
        }
        case "confirm": {
          answer = await p.confirm({
            message: promptMessage,
            initialValue: schema.default !== undefined ? Boolean(schema.default) : true,
          });

          if (p.isCancel(answer)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }
          break;
        }
        case "select": {
          answer = await p.select({
            message: promptMessage,
            options: schema.options ?? [],
            initialValue: schema.default,
          });

          if (p.isCancel(answer)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }
          break;
        }
        default: {
          console.warn(`Unknown option type '${schema.type}' for layer ${layer.name}.${key}`);
          answer = schema.default;
        }
      }

      layerResult[key] = answer;
    }
  }

  return result;
}

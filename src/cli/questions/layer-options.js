import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { printArgInUse, parseLayerOptionsFromArgv } from "#args";

/**
 * Prompt the user for options defined on the selected layers.
 * Skips options that were explicitly provided via CLI flags.
 *
 * @param {import('#types').DiscoveredLayer[]} selectedLayers
 * @returns {Promise<Record<string, Record<string, any>>>}
 */
export async function askLayerOptions(selectedLayers) {
  const cliOptions = parseLayerOptionsFromArgv(selectedLayers);
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
              const valStr =
                (!input || input.length === 0) && schema.default !== undefined
                  ? String(schema.default)
                  : (input ?? "");
              const num = Number(valStr);
              if (isNaN(num)) return "Must be a valid number";
              if (schema.validate) {
                const res = schema.validate(num);
                if (typeof res === "string") return res;
                if (res === false) return "Invalid value";
              }
              return undefined;
            },
          });

          if (p.isCancel(raw)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }

          answer = Number(raw);
          break;
        }
        case "text": {
          answer = await p.text({
            message: promptMessage,
            placeholder: schema.default !== undefined ? String(schema.default) : undefined,
            defaultValue: schema.default !== undefined ? String(schema.default) : undefined,
            validate: schema.validate
              ? (input) => {
                  const valueToValidate =
                    (!input || input.length === 0) && schema.default !== undefined
                      ? String(schema.default)
                      : (input ?? "");
                  const res = schema.validate?.(valueToValidate);
                  if (typeof res === "string") return res;
                  if (res === false) return "Invalid value";
                  return undefined;
                }
              : undefined,
          });

          if (p.isCancel(answer)) {
            p.cancel("Operation cancelled");
            process.exit(0);
          }
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

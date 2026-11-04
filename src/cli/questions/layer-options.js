import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { printArgInUse, parseLayerOptionsFromParsedArgs } from "#args";
import { validateOption } from "./validate-option.js";
import { answerWithoutTerminal, isTTY } from "./terminal.js";

/**
 * Prompt the user for options defined on the selected layers.
 * Skips options that were explicitly provided via CLI flags.
 *
 * @param {import('#types').DiscoveredLayer[]} selectedLayers
 * @param {import('#utils/project.js').Project} [existing] the project being updated, for `detect`
 * @returns {Promise<Record<string, Record<string, any>>>}
 */
export async function askLayerOptions(selectedLayers, existing) {
  const cliOptions = parseLayerOptionsFromParsedArgs(selectedLayers);
  /** @type {Record<string, Record<string, any>>} */
  const result = {};

  for (const layer of selectedLayers) {
    if (!layer.options) continue;

    const layerResult = (result[layer.name] ??= {});

    for (const [key, schema] of Object.entries(layer.options)) {
      const fromCli = cliOptions[layer.name]?.[key];

      if (fromCli !== undefined) {
        layerResult[key] = fromCli;
        printArgInUse(`${layer.name}.${key}`, String(fromCli));
        continue;
      }

      const message = `${styleText("magentaBright", layer.name)}: ${schema.prompt}`;
      const detected = existing && schema.detect ? await schema.detect(existing) : undefined;

      if (!isTTY()) {
        layerResult[key] = answerWithoutTerminal(
          `${layer.name}.${key}`,
          defaultAnswer(schema, detected ?? schema.default),
        );
        continue;
      }

      layerResult[key] = await ask(message, schema, detected ?? schema.default);
    }
  }

  return result;
}

/**
 * What Enter would choose for the question of this option.
 *
 * @param {import('#types').LayerOptionSchema} schema
 * @param {any} initial
 * @returns {unknown}
 */
function defaultAnswer(schema, initial) {
  switch (schema.type) {
    case "confirm":
      return initial ?? true;
    case "select":
      return initial ?? schema.options?.[0]?.value;
    case "multiselect":
      return initial ?? [];
    default: {
      if (initial === undefined) return undefined;

      const result = validateOption(schema, String(initial));

      return result.ok ? result.value : undefined;
    }
  }
}

/**
 * @param {string} message
 * @param {import('#types').LayerOptionSchema} schema
 * @param {any} initial
 * @returns {Promise<unknown>}
 */
async function ask(message, schema, initial) {
  switch (schema.type) {
    case "text":
    case "number": {
      const fallback = initial === undefined ? undefined : String(initial);

      const answer = await p.text({
        message,
        placeholder: fallback,
        defaultValue: fallback,
        /**
         * clack swaps in the defaultValue after validation,
         * so an empty answer is checked as the default.
         */
        validate: (input) => {
          const result = validateOption(schema, input || fallback || "");

          return result.ok ? undefined : result.error;
        },
      });

      // converts "number" answers, which clack returns as strings
      const result = validateOption(schema, exitIfCancelled(answer));

      if (!result.ok) throw new Error(result.error);

      return result.value;
    }

    case "confirm":
      return exitIfCancelled(
        await p.confirm({
          message,
          initialValue: initial ?? true,
        }),
      );

    case "select":
      return exitIfCancelled(
        await p.select({
          message,
          options: schema.options ?? [],
          initialValue: initial,
        }),
      );

    case "multiselect": {
      // clack's multiselect has no validate, so ask again until the selection passes
      while (true) {
        const answer = await p.multiselect({
          message,
          options: schema.options ?? [],
          initialValues: initial ?? [],
          required: false,
        });

        const result = validateOption(schema, exitIfCancelled(answer));

        if (result.ok) return result.value;

        p.log.error(result.error);
      }
    }

    default:
      throw new Error(`Unknown option type '${String(schema.type)}'`);
  }
}

/**
 * @template T
 * @param {T | symbol} answer
 * @returns {T}
 */
function exitIfCancelled(answer) {
  if (p.isCancel(answer)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return answer;
}

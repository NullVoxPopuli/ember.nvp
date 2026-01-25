import { styleText } from "node:util";
import { answers, printArgInUse } from "#args";
import { discoverLayers } from "#layers";

import * as p from "@clack/prompts";

export async function askLayers() {
  const optionalLayers = (await discoverLayers()).filter(
    (layer) => typeof layer.run === "function",
  );

  const supported = new Set(optionalLayers.map((layer) => layer.name));

  /**
   *
   * @param {string[] | undefined} selected
   * @returns {selected is string[]}
   */
  function isValid(selected) {
    if (!selected) return false;
    if (Array.isArray(selected) && selected.length === 0) return false;

    return selected.every((name) => supported.has(name));
  }

  if (isValid(answers.layers)) {
    let result = optionalLayers.filter((layer) => answers.layers.includes(layer.name));

    printArgInUse(`layers`, result.map((layer) => layer.name).join(", "));

    return result;
  }

  // Whenever we have a yes/no option, we use string values rather than true/false
  const defaultValues = (
    await Promise.all(
      optionalLayers.map(async (layer) => {
        let result = await layer.defaultValue?.();

        return result && layer.name;
      }),
    )
  ).filter(Boolean);

  const selectedFeatures = await p.multiselect({
    message: "Select additional features:",
    initialValues: defaultValues,
    options: optionalLayers.map((layer) => ({
      value: layer.name,
      label: layer.label ?? layer.name,
      hint: layer.hint,
    })),
    required: false,
  });

  if (p.isCancel(selectedFeatures)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  // Build the final configuration
  const selectedLayers = optionalLayers.filter((layer) => selectedFeatures.includes(layer.name));

  return selectedLayers;
}

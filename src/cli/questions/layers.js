import { answers, printArgInUse } from "#args";
import { isTTY, provideAnswer } from "./tty.js";
import { discoverLayers } from "#layers";

import * as p from "@clack/prompts";

/**
 * @param {import('#types').ProjectType} projectType
 * @param {string[]} [suggested] layers to select by default, beyond each layer's own default
 * @param {boolean} [isUpdate] the project exists already
 */
export async function askLayers(projectType, suggested = [], isUpdate = false) {
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

  /**
   * Read before the check, which narrows `answers.layers` to undefined after it.
   */
  const given = answers.layers;
  const skipped = answers["skip-layers"];

  for (const name of skipped) {
    if (!supported.has(name)) {
      provideAnswer("skip-layers", undefined, {
        given: name,
        reason: `Choose from: ${optionalLayers.map((layer) => layer.name).join(", ")}.`,
      });
    }

    if (given.includes(name)) {
      provideAnswer("skip-layers", undefined, { given: name, reason: "It is also in --layers." });
    }
  }

  // Whenever we have a yes/no option, we use string values rather than true/false
  const defaultValues = /** @type {string[]} */ (
    (
      await Promise.all(
        optionalLayers.map(async (layer) => {
          if (skipped.includes(layer.name)) return false;

          let result = suggested.includes(layer.name) || (await layer.defaultValue?.(projectType));

          return result && layer.name;
        }),
      )
    ).filter(Boolean)
  );

  /**
   * For a new project, --layers adds to the default layers,
   * so that a flag for one layer does not turn off the defaults.
   * --skip-layers leaves a default out.
   *
   * An update applies only the given layers,
   * because a default such as typescript would convert the existing project.
   */
  if (isValid(answers.layers)) {
    let added = isUpdate ? [] : defaultValues.filter((name) => !answers.layers.includes(name));
    let result = optionalLayers.filter(
      (layer) => answers.layers.includes(layer.name) || added.includes(layer.name),
    );

    printArgInUse(
      `layers`,
      added.length
        ? `${answers.layers.join(", ")} + defaults: ${added.join(", ")}`
        : answers.layers.join(", "),
    );

    return result;
  }

  if (!isTTY()) {
    let names = provideAnswer("layers", defaultValues, {
      given: given?.length ? given.join(",") : undefined,
      reason: `Choose from: ${optionalLayers.map((layer) => layer.name).join(", ")}.`,
    });

    return optionalLayers.filter((layer) => names.includes(layer.name));
  }

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

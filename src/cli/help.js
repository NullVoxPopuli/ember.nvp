import { styleText } from "node:util";

/**
 * CLI flags only carry strings and booleans
 *
 * @type {Record<import('#types').LayerOptionType, string>}
 */
const FLAG_TYPES = {
  text: "string",
  number: "number",
  confirm: "boolean",
  select: "string",
  multiselect: "string",
};

/**
 * Print help text to stdout.
 *
 * @param {Record<string, any>} coreOptions
 * @param {import('#types').DiscoveredLayer[]} [layers]
 */
export function printHelp(coreOptions, layers = []) {
  const title = styleText(["bgCyan", "black"], " ember.nvp ");
  console.log(`${title}\n`);
  console.log(`${styleText("bold", "Usage:")} npx ember.nvp [options]\n`);

  console.log(styleText("bold", "Core Options:"));
  for (const [name, config] of Object.entries(coreOptions)) {
    printOption({
      flag: `--${name}`,
      alias: config.short ? `-${config.short}, ` : "    ",
      type: config.type,
      multiple: config.multiple,
      description: config.description,
      choices: config.choices,
    });
  }

  const defaults = layers.filter((layer) => layer.defaultValue);

  if (defaults.length > 0) {
    console.log(styleText("bold", "Default Layers:"));
    for (const layer of defaults) {
      const when = layer.defaultWhen ? styleText("dim", ` (${layer.defaultWhen})`) : "";

      console.log(`  ${styleText("cyan", layer.name)}${when}`);
    }
    console.log(
      `\n  For a new project, ${styleText("cyan", "--layers")} adds to these.` +
        ` ${styleText("cyan", "--skip-layers")} leaves one out.\n`,
    );
  }

  const withOptions = layers.filter((layer) => layer.options);

  if (withOptions.length === 0) return;

  console.log(styleText("bold", "Layer Options:"));
  console.log("  Without a TTY, an option without a flag gets its default.\n");
  for (const layer of withOptions) {
    console.log(`  Layer: ${styleText(["cyan", "bold"], layer.name)}`);
    for (const [key, schema] of Object.entries(layer.options ?? {})) {
      const name = `${layer.name}.${key}`;

      printOption({
        flag: schema.type === "confirm" ? `--[no-]${name}` : `--${name}`,
        alias: "    ",
        type: FLAG_TYPES[schema.type],
        multiple: schema.type === "multiselect",
        description: schema.prompt,
        choices: schema.options?.map((choice) => choice.value),
        fallback: schema.default,
        required:
          schema.default === undefined && (schema.type === "text" || schema.type === "number"),
      });
    }
  }
}

/**
 * @param {{
 *   flag: string,
 *   alias: string,
 *   type?: string,
 *   multiple?: boolean,
 *   description?: string,
 *   choices?: string[],
 *   fallback?: unknown,
 *   required?: boolean,
 * }} option
 */
function printOption({
  flag,
  alias,
  type,
  multiple,
  description = "",
  choices,
  fallback,
  required,
}) {
  const typeStr = type ? styleText("dim", `<${type}>`) : "";
  const repeatStr = multiple
    ? type
      ? ` ${styleText("dim", "[")}${styleText("cyan", flag)} ${typeStr}${styleText("dim", " ...]")}`
      : ` ${styleText("dim", "[")}${styleText("cyan", flag)}${styleText("dim", " ...]")}`
    : "";
  const flagAndType = [styleText("cyan", flag), typeStr].filter(Boolean).join(" ");
  const choicesStr = choices
    ? styleText("yellow", ` [choices: ${choices.map((c) => `"${c}"`).join(", ")}]`)
    : "";
  const fallbackStr =
    fallback === undefined ? "" : styleText("dim", ` [default: ${JSON.stringify(fallback)}]`);

  /**
   * Without a TTY, a select, confirm, or multiselect option falls back to its first choice,
   * true, or none. A text or number option without a default has no answer.
   */
  const requiredStr = required ? styleText("red", " [required without a TTY]") : "";

  console.log(`  ${styleText("cyan", alias)}${flagAndType}${repeatStr}`);
  if (description || choicesStr || fallbackStr || requiredStr) {
    console.log(`      ${description}${choicesStr}${fallbackStr}${requiredStr}`);
  }
  console.log("");
}

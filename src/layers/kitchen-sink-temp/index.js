import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatLabel } from "#utils/cli.js";

/**
 * This layer is used as a demonstration of the new options behavior.  Once we have a real layer
 * with options, we can ditch this.  It's disabled (in TODO list).
 */
export default {
  label: formatLabel("Kitchen Sink", "demonstrates options"),
  hint: "lots-o-options",

  options: {
    unitCount: {
      type: "number",
      prompt: "How many units do you want?",
      default: 7,
      validate: (/** @type {number} */ val) => val > 0 || "Must be greater than 0",
    },
    customTitle: {
      type: "text",
      prompt: "Enter a custom title for the sink",
      default: "My Kitchen Sink",
      validate: (/** @type {string} */ input) =>
        input.trim().length > 0 ? undefined : "Title cannot be empty",
    },
    flavor: {
      type: "select",
      prompt: "Which kitchen sink flavor do you prefer?",
      default: "standard",
      options: [
        { label: "Standard", value: "standard", hint: "Regular kitchen sink setup" },
        { label: "Deluxe", value: "deluxe", hint: "Includes extra features" },
        { label: "Minimal", value: "minimal", hint: "Bare bones setup" },
      ],
    },
    enableLogging: {
      type: "confirm",
      prompt: "Enable detailed sink logging?",
      default: true,
    },
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  readme(project) {
    const opts = project.getLayerOptions("kitchen-sink-temp");

    return `### Kitchen Sink

Demonstration layer options configuration:

- **Title**: ${opts.customTitle}
- **Flavor**: ${opts.flavor}
- **Unit Count**: ${opts.unitCount}
- **Logging Enabled**: ${opts.enableLogging}`;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    const opts = project.getLayerOptions("kitchen-sink-temp");
    const contentsLines = [
      "# This is a kitchen sink nonsense file",
      "",
      `UNIT_COUNT = ${opts.unitCount}`,
      `TITLE = ${opts.customTitle}`,
      `FLAVOR = ${opts.flavor}`,
      `LOGGING = ${opts.enableLogging}`,
      "",
    ];

    const kitchenSinkFile = join(project.directory, "kitchen-sink.ini");
    await writeFile(kitchenSinkFile, contentsLines.join("\n"));
  },
};

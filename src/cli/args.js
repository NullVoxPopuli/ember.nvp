const { values } = parseArgs({
  options: {
    name: {
      type: "string",
    },

    type: {
      type: "string",
      choices: ["app", "addon", "library"],
    },

    layers: {
      type: "string",
      multiple: true,
    },

    packageManager: {
      type: "string",
      choices: ["npm", "pnpm", "yarn", "bun"],
    },
  },
});

const { name, type, layers = [], packageManager } = values;

export const answers = { name, type, layers, packageManager };

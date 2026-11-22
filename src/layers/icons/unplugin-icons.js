import { editFile } from "#utils/fs.js";
import { VITE_CONFIG, addVitePlugin, vitePluginReasons } from "#utils/vite-config.js";

export const deps = {
  "unplugin-icons": "^24.0.0",
};

export const types = "unplugin-icons/types/ember";

const PLUGIN = {
  importLine: `import Icons from "unplugin-icons/vite";`,
  call: `Icons({ compiler: "ember" })`,
};

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  await editFile(project, VITE_CONFIG, (code) => addVitePlugin(code, PLUGIN));
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function reasons(project) {
  return vitePluginReasons(project, PLUGIN, "unplugin-icons/vite");
}

export const readme = `### Icons

[unplugin-icons](https://github.com/unplugin/unplugin-icons) gives each icon of an [Iconify icon set](https://icones.js.org/) as a component.
Add a set to the dev dependencies before you import from it, for example \`@iconify-json/lucide\`.

\`\`\`gjs
import Check from "~icons/lucide/check";

<template>
  <Check class="icon" aria-hidden="true" />
</template>
\`\`\``;

export const agents = `## Icons (unplugin-icons)

- Import an icon as a component from \`~icons/<set>/<name>\`, for example \`import Check from "~icons/lucide/check";\`, then \`<Check />\`.
- Each set is a package: \`@iconify-json/<set>\`. Install the set before you import from it. Find sets and names at https://icones.js.org/.
- Attributes on the component go on the rendered \`<svg>\`. Give a decorative icon \`aria-hidden="true"\`.`;

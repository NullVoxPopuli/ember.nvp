import { editFile } from "#utils/fs.js";
import { VITE_CONFIG, addVitePlugin, vitePluginReasons } from "#utils/vite-config.js";

export const deps = {
  "@svg-jar/plugin": "^1.1.0",
};

export const types = "@svg-jar/plugin/client/ember";

const PLUGIN = {
  importLine: `import svgJar from "@svg-jar/plugin/vite";`,
  call: `svgJar({ target: "ember" })`,
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
  return vitePluginReasons(project, PLUGIN, "@svg-jar/plugin/vite");
}

export const readme = `### Icons

[@svg-jar/plugin](https://github.com/svg-jar/plugin) turns each imported \`.svg\` file into a component.
The build puts the icons into a sprite sheet.

\`\`\`gjs
import Arrow from "#app/icons/arrow.svg";

<template>
  <Arrow class="icon" aria-hidden="true" />
</template>
\`\`\``;

export const agents = `## Icons (@svg-jar/plugin)

- Import an \`.svg\` file to get a component: \`import Arrow from "#app/icons/arrow.svg";\`, then \`<Arrow />\`.
- Attributes on the component go on the rendered \`<svg>\`. Give a decorative icon \`aria-hidden="true"\`, and a meaningful icon a \`<title>\` in its block.
- The build collects the icons into a sprite sheet. Add \`?unsafe-inline\` to the import only when the markup of the icon must be in the page, for example for animations.
- \`?current-color\` makes the fill and stroke follow the CSS \`color\`.`;

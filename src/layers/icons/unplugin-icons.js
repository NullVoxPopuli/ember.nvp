import { editFile } from "#utils/fs.js";
import {
  VITE_CONFIG,
  addVitePlugin,
  setEmberOptions,
  vitePluginReasons,
} from "#utils/vite-config.js";

export const deps = {
  "unplugin-icons": "^24.0.0",
};

export const types = "unplugin-icons/types/ember";

const PLUGIN = {
  importLine: `import Icons from "unplugin-icons/vite";`,
  call: `Icons({ compiler: "ember" })`,
};

/**
 * An icon module compiles its template with `template()`.
 * Its id has no file extension, so ember() sends it to babel only with this option.
 * Without babel, the build ships the runtime template compiler.
 */
const ICON_IDS = String.raw`/^~icons\//`;
const EMBER_OPTIONS = `{ babel: { include: { whenId: [${ICON_IDS}] } } }`;

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  await editFile(project, VITE_CONFIG, (code) =>
    addVitePlugin(setEmberOptions(code, EMBER_OPTIONS), PLUGIN),
  );
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function reasons(project) {
  let reasons = await vitePluginReasons(project, PLUGIN, "unplugin-icons/vite");
  let code = (await project.read(VITE_CONFIG)) ?? "";

  if (!code.includes(ICON_IDS)) {
    reasons.push(
      `${VITE_CONFIG} does not send ${ICON_IDS} to babel with ember()'s babel.include.whenId`,
    );
  }

  return reasons;
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

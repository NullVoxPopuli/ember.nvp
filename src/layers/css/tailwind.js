import { join } from "node:path";
import { applyFolderTo, editFile } from "#utils/fs.js";
import { VITE_CONFIG, addVitePlugin, vitePluginReasons } from "./vite-config.js";

export const deps = {
  tailwindcss: "^4.3.5",
  "@tailwindcss/vite": "^4.3.5",
};

const PLUGIN = {
  importLine: `import tailwindcss from "@tailwindcss/vite";`,
  call: "tailwindcss()",
};

const STYLESHEET = "app/styles/app.css";
const TAILWIND_IMPORT = `@import "tailwindcss";`;

/**
 * Vite builds the stylesheet from this link, the same as the boot script.
 */
const STYLESHEET_LINK = `<link rel="stylesheet" href="/${STYLESHEET}" />`;

/**
 * @param {string} html
 */
function linkStylesheet(html) {
  if (html.includes(`href="/${STYLESHEET}"`)) return html;

  return html.replace(
    /^([ \t]*)<\/head>/m,
    (tag, indent) => `${indent}  ${STYLESHEET_LINK}\n${tag}`,
  );
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  await applyFolderTo(join(import.meta.dirname, "files/tailwind"), project);

  /**
   * applyFolderTo keeps a stylesheet of the user's.
   */
  await editFile(project, STYLESHEET, (css) =>
    css.includes(TAILWIND_IMPORT) ? css : `${TAILWIND_IMPORT}\n${css}`,
  );
  await editFile(project, VITE_CONFIG, (code) => addVitePlugin(code, PLUGIN));
  await editFile(project, "index.html", linkStylesheet);
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function reasons(project) {
  let reasons = await vitePluginReasons(project, PLUGIN, "@tailwindcss/vite");
  let css = (await project.read(STYLESHEET)) ?? "";

  if (!css.includes(TAILWIND_IMPORT)) {
    reasons.push(`${STYLESHEET} is missing ${TAILWIND_IMPORT}`);
  }

  let html = (await project.read("index.html")) ?? "";

  if (!html.includes(`href="/${STYLESHEET}"`)) {
    reasons.push(`index.html does not link ${STYLESHEET}`);
  }

  return reasons;
}

export const readme = `#### Tailwind CSS

Utility classes from [Tailwind CSS](https://tailwindcss.com/) work in every template.
\`${STYLESHEET}\` is the stylesheet that \`index.html\` links. Add custom CSS and [theme variables](https://tailwindcss.com/docs/theme) there.`;

export const agents = `### Tailwind CSS 4

- Style with Tailwind utility classes in templates.
- \`index.html\` links \`${STYLESHEET}\`. Put global CSS and \`@theme\` variables there.
- There is no \`tailwind.config.js\`. Tailwind 4 reads its config from CSS.`;

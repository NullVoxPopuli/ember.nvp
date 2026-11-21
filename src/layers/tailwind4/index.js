import { packageJson } from "ember-apply";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { formatLabel } from "#utils/cli.js";

const deps = {
  tailwindcss: "^4.3.5",
  "@tailwindcss/vite": "^4.3.5",
};

const VITE_CONFIG = "vite.config.mjs";
const EMBER_PLUGIN_IMPORT = /^import \{ ember \} from ["']@nullvoxpopuli\/ember-vite["'];?$/m;
const EMBER_PLUGIN_CALL = /plugins:\s*\[\s*ember\(\)/;
const PLUGIN_IMPORT = `import tailwindcss from "@tailwindcss/vite";`;
const PLUGIN_CALL = "tailwindcss()";

const STYLESHEET = "app/styles/app.css";
const TAILWIND_IMPORT = `@import "tailwindcss";`;

/**
 * Vite builds the stylesheet from this link, the same as the boot script.
 */
const STYLESHEET_LINK = `<link rel="stylesheet" href="/${STYLESHEET}" />`;

/**
 * Only apps and extensions build with Vite.
 * The library and custom-element bases build with tsdown.
 */
const SUPPORTED_TYPES = new Set(["app", "extension"]);

/**
 * @param {string} code
 */
function wireViteConfig(code) {
  /**
   * The codemod only knows the base's config.
   * For any other shape, isSetup reports what is missing.
   */
  if (!EMBER_PLUGIN_IMPORT.test(code) || !EMBER_PLUGIN_CALL.test(code)) return code;

  if (!code.includes(PLUGIN_IMPORT)) {
    code = code.replace(EMBER_PLUGIN_IMPORT, (line) => `${line}\n${PLUGIN_IMPORT}`);
  }

  if (!code.includes(PLUGIN_CALL)) {
    code = code.replace(EMBER_PLUGIN_CALL, (call) => `${call}, ${PLUGIN_CALL}`);
  }

  return code;
}

/**
 * @param {string} html
 */
function wireIndexHtml(html) {
  if (html.includes(`href="/${STYLESHEET}"`)) return html;

  return html.replace(
    /^([ \t]*)<\/head>/m,
    (tag, indent) => `${indent}  ${STYLESHEET_LINK}\n${tag}`,
  );
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} file
 * @param {(contents: string) => string} change
 */
async function edit(project, file, change) {
  if (!project.hasFile(file)) return;

  let contents = (await project.read(file)) ?? "";
  let changed = change(contents);

  if (changed !== contents) {
    await writeFile(project.path(file), changed);
  }
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: formatLabel("Tailwind CSS", "utility-first styling"),
  hint: "Tailwind CSS 4, built by its Vite plugin",

  async run(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    await applyFolderTo(join(import.meta.dirname, "files"), project);

    /**
     * applyFolderTo keeps a stylesheet of the user's.
     */
    await edit(project, STYLESHEET, (css) =>
      css.includes(TAILWIND_IMPORT) ? css : `${TAILWIND_IMPORT}\n${css}`,
    );
    await edit(project, VITE_CONFIG, wireViteConfig);
    await edit(project, "index.html", wireIndexHtml);

    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
  },

  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {true} explain
   * @returns {Promise<{ isSetup: boolean; reasons: string[] }>}
   */
  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {boolean | undefined} [explain]
   * @returns {Promise<boolean>}
   */
  async isSetup(project, explain) {
    const reasons = [];

    if (!SUPPORTED_TYPES.has(project.type)) {
      reasons.push("only apps and extensions build with Vite");
    } else {
      let viteConfig = (await project.read(VITE_CONFIG)) ?? "";

      if (!viteConfig.includes(PLUGIN_IMPORT)) {
        reasons.push(`${VITE_CONFIG} does not import @tailwindcss/vite`);
      }

      if (!viteConfig.includes(PLUGIN_CALL)) {
        reasons.push(`${VITE_CONFIG} does not use the ${PLUGIN_CALL} plugin`);
      }

      let css = (await project.read(STYLESHEET)) ?? "";

      if (!css.includes(TAILWIND_IMPORT)) {
        reasons.push(`${STYLESHEET} is missing ${TAILWIND_IMPORT}`);
      }

      let html = (await project.read("index.html")) ?? "";

      if (!html.includes(`href="/${STYLESHEET}"`)) {
        reasons.push(`index.html does not link ${STYLESHEET}`);
      }

      let manifest = await packageJson.read(project.directory);

      for (let dep of Object.keys(deps)) {
        if (!manifest.devDependencies?.[dep] && !manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in devDependencies`);
        }
      }
    }

    if (explain) {
      return { isSetup: reasons.length === 0, reasons };
    }

    return reasons.length === 0;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  readme(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    return `### Styling (Tailwind CSS)

Utility classes from [Tailwind CSS](https://tailwindcss.com/) work in every template.

\`${STYLESHEET}\` is the stylesheet that \`index.html\` links. Add custom CSS and [theme variables](https://tailwindcss.com/docs/theme) there.`;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  agents(project) {
    if (!SUPPORTED_TYPES.has(project.type)) return;

    return `## Styling (Tailwind CSS 4)

- Style with Tailwind utility classes in templates.
- \`index.html\` links \`${STYLESHEET}\`. Put custom CSS and \`@theme\` variables there.
- There is no \`tailwind.config.js\`. Tailwind 4 reads its config from CSS.`;
  },
};

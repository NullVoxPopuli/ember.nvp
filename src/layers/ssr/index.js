import { packageJson } from "ember-apply";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";

/**
 * server.js imports these at runtime.
 */
const deps = {
  sirv: "^3.0.2",
  "vite-ember-ssr": "^0.6.2",
};

/**
 * The server bundle includes settled() from here,
 * so it is only needed for the build.
 */
const devDeps = {
  "@ember/test-helpers": "^5.8.0",
};

/**
 * Vite resolves the extension of the SSR entry,
 * so the same scripts work for app-ssr.js and app-ssr.ts.
 */
const scripts = {
  build: "vite build && vite build --ssr app/app-ssr",
  dev: "node server.js --dev",
  start: "node server.js --dev",
  serve: "node server.js",
};

const SSR_ENTRIES = ["app/app-ssr.ts", "app/app-ssr.js"];

const HEAD_MARKER = "<!-- VITE_EMBER_SSR_HEAD -->";
const BODY_MARKER = "<!-- VITE_EMBER_SSR_BODY -->";

const VITE_CONFIG = "vite.config.mjs";
const EMBER_PLUGIN_IMPORT = /^import \{ ember \} from ["']@nullvoxpopuli\/ember-vite["'];?$/m;
const EMBER_PLUGIN_CALL = /plugins:\s*\[\s*ember\(\)/;

/**
 * The client build goes to dist/client,
 * so the test server has to look there too.
 */
const TESTEM_CWD = /cwd:\s*["']dist["']/;

/**
 * The base's boot script, and its rehydrating replacement.
 *
 * installShoebox() goes first:
 * it replays the fetch() responses from the server render.
 */
const BOOT_CONFIG_IMPORT = /^([ \t]*)import environment from ["']#config["'];$/m;
const BOOT_CALL = /^([ \t]*)Application\.create\(environment\.APP\);$/m;

/**
 * @param {string} code
 */
function wireViteConfig(code) {
  if (code.includes("emberSsr(")) return code;

  /**
   * The codemod only knows the base's config.
   * For any other shape, isSetup reports what is missing.
   */
  if (!EMBER_PLUGIN_IMPORT.test(code) || !EMBER_PLUGIN_CALL.test(code)) return code;

  return code
    .replace(
      EMBER_PLUGIN_IMPORT,
      (line) => `${line}\nimport { emberSsr } from "vite-ember-ssr/vite-plugin";`,
    )
    .replace(EMBER_PLUGIN_CALL, (call) => `${call}, emberSsr()`);
}

/**
 * @param {string} html
 */
function wireIndexHtml(html) {
  if (!html.includes(HEAD_MARKER)) {
    html = html.replace(/^([ \t]*)<\/head>/m, (tag, indent) => `${indent}  ${HEAD_MARKER}\n${tag}`);
  }

  if (!html.includes(BODY_MARKER)) {
    html = html.replace(
      /^([ \t]*)(<body[^>]*>)/m,
      (tag, indent) => `${tag}\n${indent}  ${BODY_MARKER}`,
    );
  }

  if (!html.includes("bootRehydrated(") && BOOT_CONFIG_IMPORT.test(html) && BOOT_CALL.test(html)) {
    html = html
      .replace(
        BOOT_CONFIG_IMPORT,
        (line, indent) =>
          `${line}\n${indent}import { bootRehydrated, installShoebox } from "vite-ember-ssr/client";`,
      )
      .replace(
        BOOT_CALL,
        (_call, indent) =>
          `${indent}installShoebox();\n${indent}bootRehydrated(Application, environment);`,
      );
  }

  return html;
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
  label: "SSR",
  hint: "Render pages on the server with vite-ember-ssr",

  async run(project) {
    /**
     * Only apps have an Application to render.
     */
    if (project.type !== "app") return;

    await applyFolderTo(join(import.meta.dirname, "files"), project);

    await edit(project, VITE_CONFIG, wireViteConfig);
    await edit(project, "index.html", wireIndexHtml);
    await edit(project, "testem.cjs", (code) => code.replace(TESTEM_CWD, 'cwd: "dist/client"'));

    await packageJson.addDependencies(await getLatest(deps), project.directory);
    await packageJson.addDevDependencies(await getLatest(devDeps), project.directory);
    await packageJson.addScripts(scripts, project.directory);
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

    if (project.type !== "app") {
      reasons.push("only apps can render on the server");
    } else {
      if (!project.hasFile("server.js")) {
        reasons.push("server.js is missing");
      }

      if (!SSR_ENTRIES.some((file) => project.hasFile(file))) {
        reasons.push("app/app-ssr is missing");
      }

      let viteConfig = (await project.read(VITE_CONFIG)) ?? "";

      if (!viteConfig.includes("emberSsr(")) {
        reasons.push(`${VITE_CONFIG} does not use the emberSsr() plugin`);
      }

      let html = (await project.read("index.html")) ?? "";

      for (let marker of [HEAD_MARKER, BODY_MARKER]) {
        if (!html.includes(marker)) {
          reasons.push(`index.html is missing ${marker}`);
        }
      }

      if (!html.includes("bootRehydrated(")) {
        reasons.push("index.html does not boot with bootRehydrated()");
      }

      let testem = await project.read("testem.cjs");

      if (testem && TESTEM_CWD.test(testem)) {
        reasons.push("testem.cjs serves dist instead of dist/client");
      }

      let manifest = await packageJson.read(project.directory);

      for (let dep of Object.keys(deps)) {
        if (!manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in dependencies`);
        }
      }

      for (let dep of Object.keys(devDeps)) {
        if (!manifest.devDependencies?.[dep] && !manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in devDependencies`);
        }
      }

      for (let [name, script] of Object.entries(scripts)) {
        if (manifest.scripts?.[name] !== script) {
          reasons.push(`package.json "${name}" script is not "${script}"`);
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
    if (project.type !== "app") return;

    return `### Server-side rendering

Pages render on the server with [vite-ember-ssr](https://github.com/evoactivity/vite-ember-ssr), and the browser rehydrates them.

- \`${project.runPrefix} dev\` - Start the development server, with SSR and HMR
- \`${project.runPrefix} build\` - Build the client (\`dist/client\`) and the server bundle (\`dist/server\`)
- \`${project.runPrefix} serve\` - Serve the build, on \`$PORT\` (default 4200)`;
  },
};

import { packageJson } from "ember-apply";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";

const VITE_EMBER_SSR = { "vite-ember-ssr": "^0.6.2" };

/**
 * The server bundle includes settled() from here,
 * so it is only needed for the build.
 */
const TEST_HELPERS = { "@ember/test-helpers": "^5.8.0" };

/**
 * How pages render.
 * Each mode lists what it needs, and nothing of the other mode.
 *
 * Vite resolves the extension of the SSR entry,
 * so the same scripts and plugin options work for app-ssr.js and app-ssr.ts.
 *
 * @typedef {object} Mode
 * @property {string} plugin
 * @property {string} call
 * @property {string} [files] a folder in files/ that only this mode writes
 * @property {Record<string, string>} deps
 * @property {Record<string, string>} devDeps
 * @property {Record<string, string>} scripts
 * @property {string} testemCwd
 * @property {(runPrefix: string) => string} readme
 */

/**
 * @type {Mode}
 */
const SERVER = {
  plugin: "emberSsr",
  call: "emberSsr()",
  files: "server",
  /**
   * server.js imports these at runtime.
   */
  deps: { sirv: "^3.0.2", ...VITE_EMBER_SSR },
  devDeps: TEST_HELPERS,
  scripts: {
    build: "vite build && vite build --ssr app/app-ssr",
    dev: "node server.js --dev",
    start: "node server.js",
  },
  /**
   * emberSsr() puts the client build in dist/client.
   */
  testemCwd: "dist/client",
  readme: (
    run,
  ) => `Pages render on the server on every request, with [vite-ember-ssr](https://github.com/evoactivity/vite-ember-ssr), and the browser rehydrates them.

- \`${run} dev\` - Start the development server, with SSR and HMR
- \`${run} build\` - Build the client (\`dist/client\`) and the server bundle (\`dist/server\`)
- \`${run} start\` - Serve the build, on \`$PORT\` (default 4200)`,
};

/**
 * @type {Mode}
 */
const STATIC = {
  plugin: "emberSsg",
  /**
   * Each route here becomes an HTML file.
   * Add the routes to prerender.
   */
  call: 'emberSsg({ routes: ["index"], ssrEntry: "app/app-ssr" })',
  deps: {},
  devDeps: { ...VITE_EMBER_SSR, ...TEST_HELPERS },
  scripts: {
    build: "vite build",
    dev: "vite",
    start: "vite preview",
  },
  testemCwd: "dist",
  readme: (
    run,
  ) => `Pages render to HTML files at build time, with [vite-ember-ssr](https://github.com/evoactivity/vite-ember-ssr), and the browser rehydrates them.
The routes to render are in \`vite.config.mjs\`.

- \`${run} build\` - Build the app, and render the routes to \`dist\`
- \`${run} start\` - Serve \`dist\``,
};

/**
 * @type {Record<string, Mode>}
 */
const MODES = { server: SERVER, static: STATIC };

const SSR_ENTRIES = ["app/app-ssr.ts", "app/app-ssr.js"];

const HEAD_MARKER = "<!-- VITE_EMBER_SSR_HEAD -->";
const BODY_MARKER = "<!-- VITE_EMBER_SSR_BODY -->";

const VITE_CONFIG = "vite.config.mjs";
const EMBER_PLUGIN_IMPORT = /^import \{ ember \} from ["']@nullvoxpopuli\/ember-vite["'];?$/m;
const EMBER_PLUGIN_CALL = /plugins:\s*\[\s*ember\(\)/;
const PLUGIN_IMPORT =
  /^import \{ (emberSsr|emberSsg) \} from ["']vite-ember-ssr\/vite-plugin["'];?\n/m;

const TESTEM_CWD = /cwd:\s*["']dist(\/client)?["']/;

/**
 * The base's boot script, and its rehydrating replacement.
 *
 * installShoebox() goes first:
 * it replays the fetch() responses from the server render.
 */
const BOOT_CONFIG_IMPORT = /^([ \t]*)import environment from ["']#config["'];$/m;
const BOOT_CALL = /^([ \t]*)Application\.create\(environment\.APP\);$/m;

/**
 * @param {import('#utils/project.js').Project} project
 */
function modeFor(project) {
  return MODES[project.getLayerOptions("ssr").mode] ?? SERVER;
}

/**
 * Removes `, name(...)` from a plugins array.
 * The arguments can hold brackets of their own (`routes: [...]`).
 *
 * @param {string} code
 * @param {string} name
 */
function removePluginCall(code, name) {
  let start = code.indexOf(`, ${name}(`);

  if (start === -1) return code;

  let depth = 0;

  for (let i = code.indexOf("(", start); i < code.length; i++) {
    if (code[i] === "(") depth++;
    if (code[i] === ")") depth--;

    if (depth === 0) return code.slice(0, start) + code.slice(i + 1);
  }

  return code;
}

/**
 * @param {string} code
 * @param {Mode} mode
 */
function wireViteConfig(code, mode) {
  /**
   * The user can change the plugin's options (the routes to prerender).
   * A config that already has the plugin keeps them.
   */
  if (code.includes(`${mode.plugin}(`)) return code;

  for (let other of Object.values(MODES)) {
    code = removePluginCall(code, other.plugin);
  }

  code = code.replace(PLUGIN_IMPORT, "");

  /**
   * The codemod only knows the base's config.
   * For any other shape, isSetup reports what is missing.
   */
  if (!EMBER_PLUGIN_IMPORT.test(code) || !EMBER_PLUGIN_CALL.test(code)) return code;

  return code
    .replace(
      EMBER_PLUGIN_IMPORT,
      (line) => `${line}\nimport { ${mode.plugin} } from "vite-ember-ssr/vite-plugin";`,
    )
    .replace(EMBER_PLUGIN_CALL, (call) => `${call}, ${mode.call}`);
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
  label: "SSR / SSG",
  hint: "Render pages to HTML with vite-ember-ssr, on the server or at build time",

  options: {
    mode: {
      type: "select",
      prompt: "When do pages render?",
      default: "server",
      options: [
        {
          value: "server",
          label: "On every request (SSR)",
          hint: "a Node server renders each page, with fresh data",
        },
        {
          value: "static",
          label: "At build time (SSG)",
          hint: "the build writes an HTML file per route, for any static host",
        },
      ],
      async detect(project) {
        let code = (await project.read(VITE_CONFIG)) ?? "";

        if (code.includes("emberSsg(")) return "static";
        if (code.includes("emberSsr(")) return "server";

        return undefined;
      },
    },
  },

  async run(project) {
    /**
     * Only apps have an Application to render.
     */
    if (project.type !== "app") return;

    let mode = modeFor(project);

    await applyFolderTo(join(import.meta.dirname, "files/shared"), project);

    if (mode.files) {
      await applyFolderTo(join(import.meta.dirname, "files", mode.files), project);
    } else if ((await project.read("server.js"))?.includes("vite-ember-ssr/server")) {
      /**
       * Only the server mode's own server.js goes.
       * A server.js of the user's stays.
       */
      await rm(project.path("server.js"));
    }

    await edit(project, VITE_CONFIG, (code) => wireViteConfig(code, mode));
    await edit(project, "index.html", wireIndexHtml);
    await edit(project, "testem.cjs", (code) =>
      code.replace(TESTEM_CWD, `cwd: "${mode.testemCwd}"`),
    );

    let unused = Object.values(MODES).flatMap((other) => Object.keys(other.deps));

    await packageJson.removeDependencies(
      unused.filter((dep) => !mode.deps[dep]),
      project.directory,
    );
    await packageJson.removeDevDependencies(
      Object.keys(mode.deps).filter((dep) => !mode.devDeps[dep]),
      project.directory,
    );

    await packageJson.addDependencies(await getLatest(mode.deps), project.directory);
    await packageJson.addDevDependencies(await getLatest(mode.devDeps), project.directory);
    await packageJson.addScripts(mode.scripts, project.directory);
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
      reasons.push("only apps can render pages to HTML");
    } else {
      let mode = modeFor(project);

      if (mode.files && !project.hasFile("server.js")) {
        reasons.push("server.js is missing");
      }

      if (!mode.files && (await project.read("server.js"))?.includes("vite-ember-ssr/server")) {
        reasons.push("server.js is left from the server mode");
      }

      if (!SSR_ENTRIES.some((file) => project.hasFile(file))) {
        reasons.push("app/app-ssr is missing");
      }

      let viteConfig = (await project.read(VITE_CONFIG)) ?? "";

      if (!viteConfig.includes(`${mode.plugin}(`)) {
        reasons.push(`${VITE_CONFIG} does not use the ${mode.plugin}() plugin`);
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

      if (testem && testem.match(TESTEM_CWD)?.[0] !== `cwd: "${mode.testemCwd}"`) {
        reasons.push(`testem.cjs does not serve ${mode.testemCwd}`);
      }

      let manifest = await packageJson.read(project.directory);

      for (let dep of Object.keys(mode.deps)) {
        if (!manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in dependencies`);
        }
      }

      for (let dep of Object.keys(mode.devDeps)) {
        if (!manifest.devDependencies?.[dep] && !manifest.dependencies?.[dep]) {
          reasons.push(`package.json is missing ${dep} in devDependencies`);
        }
      }

      for (let [name, script] of Object.entries(mode.scripts)) {
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

    return `### Rendering to HTML

${modeFor(project).readme(project.runPrefix)}`;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  agents(project) {
    if (project.type !== "app") return;

    let mode = modeFor(project);
    let where =
      mode === SERVER
        ? "`server.js` renders each request with `app/app-ssr`, and serves the build."
        : "`vite build` renders each route in `routes` of `emberSsg()` in `vite.config.mjs` to an HTML file. Add a route there to render it.";

    let notFound =
      mode === SERVER
        ? `
### 404 pages

The render answers \`200\`, or \`500\` if it fails. To answer \`404\` for a URL with no page:

1. Add \`this.route("not-found", { path: "/*path" });\` last in \`Router.map\`.
2. Mark that page's template: \`<main data-not-found>\`.
3. In \`render()\` in \`server.js\`:

   \`\`\`js
   let status = rendered.body.includes("data-not-found") ? 404 : rendered.statusCode;
   \`\`\`
`
        : "";

    return `## Server-side rendering (vite-ember-ssr)

Pages render to HTML, and the browser rehydrates them. ${where}

- Write normal browser code. The render has \`window\` and \`document\`.
- \`fetch()\` responses from the render go into the page, so the browser does not request them again on the first load.
- In \`index.html\`, the rendered head replaces \`<!-- VITE_EMBER_SSR_HEAD -->\`, and the rendered body replaces \`<!-- VITE_EMBER_SSR_BODY -->\`. Keep both markers.

### Page titles

Use [ember-page-title](https://github.com/ember-cli/ember-page-title):

1. Add \`ember-page-title\` to the dependencies.
2. Re-export its service in \`app/services/page-title.js\`:
   \`export { default } from "ember-page-title/services/page-title";\`
3. Delete the \`<title>\` line from \`index.html\`, so that the page has one title.
4. \`import { pageTitle } from "ember-page-title";\`, then \`{{pageTitle "About"}}\` in a template. Titles add up: \`About | My App\`.
${notFound}`;
  },
};

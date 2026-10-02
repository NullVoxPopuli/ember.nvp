import { packageJson, tsconfig } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkApp, migrateApp } from "../../app.js";
import { EMBER_CLI_BUILD } from "../../ember-cli-build.js";
import { firstExisting, listFiles, remove } from "../../files.js";
import { changedTestemFlags } from "../../layers.js";

/**
 * Compiler options of the blueprint's tsconfig.json.
 * `baseUrl` and `paths` map the app's module prefix to app/,
 * which package.json `exports` does now.
 */
const BLUEPRINT_COMPILER_OPTIONS = new Set(["allowJs", "baseUrl", "noEmit", "paths", "types"]);

/**
 * The blueprint's types/global.d.ts, which sets up Glint 1 for loose-mode templates
 */
const GLINT_ENVIRONMENT = /^\s*import\s+["']@glint\/environment-ember-loose["'];?\s*$/;

/**
 * An app that builds with ember-cli:
 * with broccoli, or with `@embroider/webpack` through `@embroider/compat`.
 *
 * This covers `@ember-tooling/classic-build-app-blueprint`,
 * and the `app` blueprint that ember-cli had before it.
 *
 * The migration is the same as for `@ember/app-blueprint`,
 * plus the moves that `ember-vite-codemod` makes:
 * - app/index.html moves to index.html
 *
 * @type {import('#types').Migration}
 */
export default {
  label: "@ember-tooling/classic-build-app-blueprint",
  type: "app",

  detect(directory) {
    let build = firstExisting(directory, EMBER_CLI_BUILD);

    if (!build) return false;

    let source = readFileSync(join(directory, build), "utf-8");

    return (
      source.includes("ember-cli/lib/broccoli/ember-app") && !source.includes("@embroider/vite")
    );
  },

  async check(project) {
    let report = await checkApp(project);
    let root = project.directory;

    if (listFiles(root, "server").length > 0) {
      report.todo.push({
        title: "Dev server middleware in server/",
        where: listFiles(root, "server"),
        action: "Move proxies and mocks to `server` in vite.config.mjs. Vite does not run server/.",
      });
    }

    let testem = changedTestemFlags(root, "testem.js", "app");

    if (testem) report.todo.push(testem);

    let config = await blueprintTsconfig(root);
    let custom = Object.keys(config?.compilerOptions ?? {}).filter(
      (option) => !BLUEPRINT_COMPILER_OPTIONS.has(option),
    );

    if (config && custom.length > 0) {
      report.todo.push({
        title: "Compiler options that the new tsconfig.json does not have",
        where: custom.map((option) => `tsconfig.json: ${option}`),
        action: "Add the options that you still need to tsconfig.json.",
      });
    }

    return report;
  },

  async run(project, report) {
    let root = project.directory;
    let indexHtml = project.hasFile("app/index.html") ? "app/index.html" : "index.html";

    // Glint 1 and @tsconfig/ember do not check .gts, so the base writes a new tsconfig.json
    if (await blueprintTsconfig(root)) {
      await remove(project, ["tsconfig.json"]);
      await packageJson.removeDevDependencies(["@tsconfig/ember"], root);

      let types = (await project.read("types/global.d.ts")) ?? "";

      if (GLINT_ENVIRONMENT.test(types)) {
        await remove(project, ["types/global.d.ts"]);
      }

      if (listFiles(root, "types").length === 0) {
        await remove(project, ["types"]);
      }
    }

    await migrateApp(project, report, { indexHtml });
  },
};

/**
 * @param {string} root
 * @returns {Promise<Record<string, any> | undefined>} tsconfig.json, when it is the blueprint's
 */
async function blueprintTsconfig(root) {
  if (!existsSync(join(root, "tsconfig.json"))) return;

  let config = await tsconfig.read(join(root, "tsconfig.json")).catch(() => undefined);

  if (config?.glint || String(config?.extends ?? "").startsWith("@tsconfig/ember")) {
    return config;
  }
}

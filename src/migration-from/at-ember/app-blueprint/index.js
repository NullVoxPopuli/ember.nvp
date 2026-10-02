import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJSON } from "#utils/fs.js";
import { checkApp, migrateApp } from "../../app.js";
import { EMBER_CLI_BUILD } from "../../ember-cli-build.js";
import { firstExisting } from "../../files.js";

const VITE_CONFIGS = ["vite.config.mjs", "vite.config.js", "vite.config.ts", "vite.config.mts"];

/**
 * An app that builds with Vite and `@embroider/vite`.
 *
 * This covers `@ember/app-blueprint`, and its predecessor `@embroider/app-blueprint`.
 * Both keep an ember-cli-build for `@embroider/compat`,
 * which lets v1 addons, `.hbs` templates, and the classic resolver keep working.
 *
 * ember.nvp apps build without compat.
 * So the migration stops at each compat feature that the app still uses,
 * and lists them for the user.
 *
 * @type {import('#types').Migration}
 */
export default {
  label: "@ember/app-blueprint",
  type: "app",

  detect(directory) {
    let manifest = readJSON(join(directory, "package.json"));

    // v2 addons build their tests and demo apps with @embroider/vite too
    if (
      manifest?.keywords?.includes("ember-addon") ||
      manifest?.["ember-addon"]?.type === "addon"
    ) {
      return false;
    }

    if (!existsSync(join(directory, "app"))) return false;

    let build = firstExisting(directory, EMBER_CLI_BUILD);

    if (build && readFileSync(join(directory, build), "utf-8").includes("@embroider/vite")) {
      return true;
    }

    let vite = firstExisting(directory, VITE_CONFIGS);

    return Boolean(
      vite && readFileSync(join(directory, vite), "utf-8").includes("@embroider/vite"),
    );
  },

  async check(project) {
    return checkApp(project);
  },

  async run(project, report) {
    await migrateApp(project, report, { indexHtml: "index.html" });
  },
};

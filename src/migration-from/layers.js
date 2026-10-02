import { packageJson } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { remove } from "./files.js";

/**
 * Tooling that the old blueprints generate, by the layer that replaces it.
 *
 * When the user selects the layer, the migration removes the old tooling,
 * so that the layer can write its own.
 * Otherwise the old tooling stays as it is.
 *
 * @type {Record<string, { files: string[], scripts: string[], devDependencies: string[] }>}
 */
const REPLACED = {
  "eslint-bundled": {
    files: [
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.js",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc",
      ".eslintignore",
    ],
    scripts: ["lint:js", "lint:js:fix"],
    devDependencies: [
      "@babel/eslint-parser",
      "@eslint/js",
      "@typescript-eslint/eslint-plugin",
      "@typescript-eslint/parser",
      "eslint-config-prettier",
      "eslint-plugin-decorator-position",
      "eslint-plugin-ember",
      "eslint-plugin-import",
      "eslint-plugin-n",
      "eslint-plugin-node",
      "eslint-plugin-prettier",
      "eslint-plugin-qunit",
      "eslint-plugin-warp-drive",
      "globals",
      "typescript-eslint",
    ],
  },
  prettier: {
    files: [
      ".prettierrc.mjs",
      ".prettierrc.cjs",
      ".prettierrc.js",
      ".prettierrc.json",
      ".prettierrc",
    ],
    scripts: ["lint:format"],
    devDependencies: [],
  },
  "github-actions": {
    files: [".github/workflows/ci.yml"],
    scripts: [],
    devDependencies: [],
  },
  // Glint's own CLI and environments, which the typescript layer's setup does not use
  typescript: {
    files: [],
    scripts: [],
    devDependencies: [
      "@glint/core",
      "@glint/environment-ember-loose",
      "@glint/environment-ember-template-imports",
    ],
  },
};

/**
 * @param {import('#utils/project.js').Project} project
 * @param {import('#types').MigrationReport} report
 */
export async function removeToolingOfWantedLayers(project, report) {
  for (let [layer, replaced] of Object.entries(REPLACED)) {
    if (!project.wantsLayer(layer)) continue;

    await remove(project, replaced.files);
    await packageJson.removeDevDependencies(replaced.devDependencies, project.directory);
    await packageJson.modify((json) => {
      for (let script of replaced.scripts) {
        delete json.scripts?.[script];
      }
    }, project.directory);
  }

  if (!project.wantsLayer("typescript")) return;

  let manifest = await packageJson.read(project.directory);
  /** @type {string[]} */
  let glint = [];

  for (let [name, command] of Object.entries(manifest.scripts ?? {})) {
    // the typescript layer writes its own lint:types
    if (name !== "lint:types" && /(^|\s|&&)glint\b/.test(String(command)))
      glint.push(`${name}: ${command}`);
  }

  if (glint.length > 0) {
    report.todo.push({
      title: "Scripts that run the glint CLI",
      where: glint,
      action:
        "Run the checker of the typescript layer instead, the way lint:types does.\n" +
        "The migration removed @glint/core, which has the glint CLI.",
    });
  }
}

/**
 * The testem config that the qunit layer writes, by project kind
 */
const QUNIT_TESTEM = {
  app: join(import.meta.dirname, "../layers/qunit/files/testem.cjs"),
  library: join(import.meta.dirname, "../layers/qunit/library-files/config/test/testem.cjs"),
};

/**
 * Browser flags are what projects change in a testem config,
 * for example to let Chrome render WebGL.
 *
 * @param {string} root
 * @param {string} file the old testem config, which the qunit layer's config replaces
 * @param {"app" | "library"} kind
 * @returns {import('#types').Finding | undefined} undefined when both configs pass the same flags
 */
export function changedTestemFlags(root, file, kind) {
  if (!existsSync(join(root, file))) return;

  let old = browserFlags(readFileSync(join(root, file), "utf-8"));
  let current = browserFlags(readFileSync(QUNIT_TESTEM[kind], "utf-8"));
  let target = kind === "library" ? "config/test/testem.cjs" : "testem.cjs";

  /** @type {string[]} */
  let where = [];

  for (let flag of old) {
    if (!current.has(flag)) where.push(`${flag}: only in ${file}`);
  }

  for (let flag of current) {
    if (!old.has(flag)) where.push(`${flag}: only in ${target}`);
  }

  if (where.length === 0) return;

  return {
    title: "Browser flags that differ in the new testem config",
    where,
    action: `Change the flags in ${target} to the ones that your tests need.`,
  };
}

/**
 * @param {string} source
 * @returns {Set<string>} such as `--headless`, with `--headless=new` read as `--headless`
 */
function browserFlags(source) {
  let flags = new Set();

  for (let [, flag] of source.matchAll(/["'`](--[\w-]+(?:=[^"'`]*)?)["'`]/g)) {
    flags.add(flag === "--headless=new" ? "--headless" : flag);
  }

  return flags;
}

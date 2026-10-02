import { packageJson } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import semver from "semver";
import { getLatest } from "#utils/npm.js";
import { readJSON } from "#utils/fs.js";
import { listFiles, move } from "./files.js";

/**
 * What the ember.nvp library base builds with.
 * Read from the base, so that a migrated library matches a generated one.
 */
const BASE_MANIFEST = readJSON(
  join(import.meta.dirname, "../bases/minimal-library/files/package.json"),
);

/**
 * @param {string} root
 * @param {string} srcDir
 * @returns {boolean} whether the source has or imports CSS
 */
export function usesCss(root, srcDir) {
  let files = listFiles(root, srcDir);

  if (files.some((file) => file.endsWith(".css"))) return true;

  return files.some(
    (file) =>
      /\.(js|ts|gjs|gts)$/.test(file) &&
      /import\s+["'][^"']+\.css["']/.test(readFileSync(join(root, file), "utf-8")),
  );
}

/**
 * Source extensions that build to `.js`
 */
const SOURCE_EXTENSIONS = "{js,ts,gjs,gts}";

/**
 * Entries in tsdown's glob syntax.
 *
 * `@embroider/addon-dev` matches `publicEntrypoints` against the built `.js` files.
 * tsdown matches `entry` against the source files, which have any source extension.
 *
 *   **\/*.js         →  ./src/**\/*.{js,ts,gjs,gts}
 *   index.js         →  ./src/index.{js,ts,gjs,gts}
 *
 * Declarations and co-located tests are never entries.
 *
 * @param {string} srcDir
 * @param {string[]} publicEntrypoints globs relative to `srcDir`, for built files
 * @returns {string[]}
 */
export function entriesFor(srcDir, publicEntrypoints) {
  /** @type {string[]} */
  let entries = [];

  let everything = publicEntrypoints.some((glob) => glob === "**/*.js" || glob === "**/*");
  let globs = everything ? ["**/*.js"] : publicEntrypoints;

  for (let glob of globs) {
    if (!glob.endsWith(".js") && !glob.endsWith("*")) continue;

    let source = glob.endsWith(".js")
      ? glob.slice(0, -".js".length) + `.${SOURCE_EXTENSIONS}`
      : glob;

    entries.push(`./${srcDir}/${source}`);
  }

  entries.push(`!./${srcDir}/**/*.d.ts`, `!./${srcDir}/**/*-test.${SOURCE_EXTENSIONS}`);

  return entries;
}

/**
 * @typedef {object} TsdownSetup
 * @property {string[]} entry
 * @property {string[] | undefined} appReexports globs for built files, as `@embroider/addon-dev` takes them
 * @property {boolean} css whether the source imports CSS
 * @property {boolean} typescript
 * @property {string | undefined} outDir when it is not `dist`
 */

/**
 * The same shape as the library base's tsdown.config.js,
 * so that layers can add properties to it.
 *
 * @param {TsdownSetup} setup
 * @returns {string}
 */
export function tsdownConfig({ entry, appReexports, css, typescript, outDir }) {
  let lines = [
    `import { defineConfig } from "tsdown";`,
    `import { ember } from "@nullvoxpopuli/ember-rolldown";`,
  ];

  if (appReexports) {
    lines.push(`import { appReexports } from "@nullvoxpopuli/ember-rolldown/app-reexports";`);
  }

  lines.push("", "export default defineConfig({", `  entry: ${JSON.stringify(entry)},`);

  if (outDir) {
    lines.push(`  outDir: ${JSON.stringify(outDir)},`);
  }

  if (!typescript) {
    lines.push("  dts: false,");
  }

  if (css) {
    // keeps `import "./x.css"` in the output, so that apps load the styles
    lines.push("  css: { inject: true },");
  }

  let plugins = appReexports ? `ember(), appReexports(${JSON.stringify(appReexports)})` : "ember()";

  lines.push(`  plugins: [${plugins}],`, "});", "");

  return lines.join("\n");
}

/**
 * Builds with tsdown instead of the old blueprint's build:
 * - writes tsdown.config.js
 * - points the build scripts at tsdown
 * - adds the base's build dependencies
 * - publishes declarations from `dist`, where tsdown writes them
 *
 * @param {import('#utils/project.js').Project} project
 * @param {TsdownSetup} setup
 */
export async function buildWithTsdown(project, setup) {
  await writeFile(project.path("tsdown.config.js"), tsdownConfig(setup));

  await packageJson.modify((json) => {
    json.type = "module";
    json.scripts ||= {};
    json.scripts.build = BASE_MANIFEST.scripts.build;
    json.scripts.prepack = BASE_MANIFEST.scripts.prepack;
    json.scripts.start = BASE_MANIFEST.scripts.start;

    if (json.exports) json.exports = fromDeclarationsToDist(json.exports);
    if (json.typesVersions) json.typesVersions = fromDeclarationsToDist(json.typesVersions);
    if (typeof json.types === "string") json.types = fromDeclarationsToDist(json.types);

    if (Array.isArray(json.files)) {
      json.files = json.files.filter(
        /** @param {string} file */ (file) => file !== "declarations" && file !== "declarations/",
      );
    }
  }, project.directory);

  let base = BASE_MANIFEST.devDependencies;
  /** @type {Record<string, string>} */
  let wanted = {
    tsdown: base.tsdown,
    "@nullvoxpopuli/ember-rolldown": base["@nullvoxpopuli/ember-rolldown"],
  };

  if (setup.typescript) {
    wanted["@ember/library-tsconfig"] = base["@ember/library-tsconfig"];
  }

  if (setup.css) {
    // released in lockstep with tsdown
    wanted["@tsdown/css"] = base.tsdown;
  }

  await packageJson.addDevDependencies(await getLatest(wanted), project.directory);
}

/**
 * The qunit layer's test app boots with the strict resolver of ember-source 7.2.
 *
 * A library's own ember-source is a devDependency, for its tests.
 * Moving it forward changes nothing for the apps that use the library.
 *
 * @param {import('#utils/project.js').Project} project
 */
export async function useEmberSourceForTests(project) {
  if (!project.wantsLayer("qunit")) return;

  let manifest = await packageJson.read(project.directory);
  let range = manifest.devDependencies?.["ember-source"];
  let wanted = BASE_MANIFEST.devDependencies["ember-source"];

  if (range && !semver.validRange(range)) return;

  let current = range ? semver.minVersion(range) : undefined;
  let minimum = /** @type {semver.SemVer} */ (semver.minVersion(wanted));

  if (current && semver.gte(current, minimum)) return;

  await packageJson.addDevDependencies(
    await getLatest({ "ember-source": wanted }),
    project.directory,
  );
}

/**
 * @param {unknown} value a package.json field
 * @returns {any} the same field, with `declarations/` paths moved to `dist/`
 */
function fromDeclarationsToDist(value) {
  if (typeof value === "string") {
    return value.replace(/^(\.\/)?declarations\//, "$1dist/");
  }

  if (Array.isArray(value)) {
    return value.map(fromDeclarationsToDist);
  }

  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    let result = {};

    for (let [key, inner] of Object.entries(value)) {
      result[key] = fromDeclarationsToDist(inner);
    }

    return result;
  }

  return value;
}

/**
 * Config files in the project root and in `config/` that Node must load as CommonJS.
 * Only files that ember.nvp does not remove are listed.
 */
const COMMONJS_CANDIDATES = [
  ".eslintrc.js",
  ".prettierrc.js",
  ".stylelintrc.js",
  ".template-lintrc.js",
  "addon-main.js",
  "babel.config.js",
  "babel.publish.config.js",
];

/**
 * ember.nvp projects are `"type": "module"`,
 * so a `.js` file that uses `module.exports` must become `.cjs`.
 *
 * References in package.json follow the rename.
 *
 * @param {import('#utils/project.js').Project} project
 * @returns {Promise<string[]>} the renamed files
 */
export async function renameCommonJSFiles(project) {
  /** @type {string[]} */
  let renamed = [];

  for (let file of COMMONJS_CANDIDATES) {
    let path = project.path(file);

    if (!existsSync(path)) continue;

    let source = readFileSync(path, "utf-8");

    if (!/\bmodule\.exports\b|\brequire\(/.test(source)) continue;

    let to = file.replace(/\.js$/, ".cjs");

    await move(project, file, to);
    renamed.push(file);

    await packageJson.modify((json) => {
      json.exports &&= renameIn(json.exports, file, to);
      json.files &&= renameIn(json.files, file, to);

      if (json["ember-addon"]?.main) {
        json["ember-addon"].main = renameIn(json["ember-addon"].main, file, to);
      }
    }, project.directory);
  }

  return renamed;
}

/**
 * @param {unknown} value
 * @param {string} from
 * @param {string} to
 * @returns {any}
 */
function renameIn(value, from, to) {
  if (typeof value === "string") {
    return value === from || value === `./${from}` ? value.replace(from, to) : value;
  }

  if (Array.isArray(value)) {
    return value.map((inner) => renameIn(inner, from, to));
  }

  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    let result = {};

    for (let [key, inner] of Object.entries(value)) {
      result[key] = renameIn(inner, from, to);
    }

    return result;
  }

  return value;
}

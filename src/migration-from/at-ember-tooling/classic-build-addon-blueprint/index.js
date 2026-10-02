import { packageJson } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { readJSON } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { rewriteImportsToMatchFiles } from "#utils/rewrite-imports.js";
import { installedDependencies, v1AddonsIn } from "../../addons.js";
import { TOOLCHAIN } from "../../app.js";
import {
  filesWithExtension,
  firstExisting,
  listFiles,
  move,
  remove,
  testsWithHbs,
} from "../../files.js";
import { parseProgram, propertyNames, propertyValue, stringValue, walk } from "../../javascript.js";
import { changedTestemFlags, removeToolingOfWantedLayers } from "../../layers.js";
import {
  buildWithTsdown,
  entriesFor,
  renameCommonJSFiles,
  useEmberSourceForTests,
  usesCss,
} from "../../library.js";

/**
 * @typedef {import('#types').MigrationReport} MigrationReport
 * @typedef {import('#utils/project.js').Project} Project
 */

/**
 * Keys of the addon object in index.js that a v2 addon can do without
 */
const HARMLESS_ADDON_KEYS = new Set(["name", "moduleName", "isDevelopingAddon", "options"]);

/**
 * `options` in index.js that only configure ember-cli-babel
 */
const HARMLESS_ADDON_OPTIONS = new Set(["ember-cli-babel"]);

/**
 * A v1 addon: ember-cli loads its index.js, and merges addon/ and app/ into the app.
 *
 * This covers `@ember-tooling/classic-build-addon-blueprint`,
 * and the `addon` blueprint that ember-cli had before it.
 *
 * The migration makes a v2 addon that builds with tsdown:
 * - addon/ moves to src/, and addon-test-support/ to src/test-support/
 * - app/ re-exports come back from `appReexports(...)` in tsdown.config.js
 * - addon-main.cjs lets apps with ember-cli keep using the addon
 *
 * @type {import('#types').Migration}
 */
export default {
  label: "@ember-tooling/classic-build-addon-blueprint",
  type: "library",

  detect(directory) {
    let manifest = readJSON(join(directory, "package.json"));

    if (!manifest?.keywords?.includes("ember-addon")) return false;
    if (manifest["ember-addon"]?.version === 2) return false;

    return existsSync(join(directory, manifest["ember-addon"]?.main ?? "index.js"));
  },

  async check(project) {
    /** @type {MigrationReport} */
    let report = { unsupported: [], todo: [], layers: [] };
    let root = project.directory;
    let manifest = await packageJson.read(root);
    let main = manifest["ember-addon"]?.main ?? "index.js";

    let hooks = addonHooks(root, main);

    if (hooks.length > 0) {
      report.unsupported.push({
        title: "ember-cli hooks in the addon's main file",
        where: hooks,
        action:
          "Move what each hook does into the addon's modules, or into setup steps for apps.\n" +
          "A v2 addon has no build hooks.",
      });
    }

    let templates = filesWithExtension(root, ["addon", "app"], [".hbs"]);

    if (templates.length > 0) {
      report.unsupported.push({
        title: "Templates in .hbs files",
        where: templates,
        action:
          "Move each template into its component as <template>, in a .gjs or .gts file.\n" +
          "The build compiles <template> only.",
      });
    }

    let styles = listFiles(root, "addon/styles").concat(listFiles(root, "app/styles"));

    if (styles.length > 0) {
      report.unsupported.push({
        title: "Styles that ember-cli merges into the app",
        where: styles,
        action:
          "Import each stylesheet from the modules that need it, such as `import './button.css';`.",
      });
    }

    let assets = listFiles(root, "public")
      .concat(listFiles(root, "vendor"))
      .filter((file) => !file.endsWith(".gitkeep"));

    if (assets.length > 0) {
      report.unsupported.push({
        title: "Files for the app's public or vendor tree",
        where: assets,
        action:
          "Import each asset from the module that uses it, or publish the assets in another package.\n" +
          "The build does not copy files into apps.",
      });
    }

    if (existsSync(join(root, "config/environment.js")) && !isEmptyAddonConfig(root)) {
      report.unsupported.push({
        title: "Addon config from config/environment.js",
        where: ["config/environment.js"],
        action:
          "Let apps pass the config to the addon's modules, or use @embroider/macros getOwnConfig.",
      });
    }

    let reexports = readAppFolder(root, manifest.name);

    if (reexports.custom.length > 0) {
      report.unsupported.push({
        title: "Modules in app/ that are not re-exports",
        where: reexports.custom,
        action:
          "Move the code into addon/, and re-export it from app/ with the same path:\n" +
          `  export { default } from '${manifest.name}/components/example';`,
      });
    }

    if (reexports.renamed.length > 0) {
      report.todo.push({
        title: "app/ re-exports under another name",
        where: reexports.renamed,
        action:
          "Add a `mapFilename` option to `appReexports(...)` in tsdown.config.js for each one.",
      });
    }

    /** @type {Record<string, string>} */
    let dependencies = {};

    for (let [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!TOOLCHAIN.has(name)) dependencies[name] = String(range);
    }

    let v1 = v1AddonsIn(installedDependencies(project.desires.path, dependencies));

    if (v1.length > 0) {
      report.unsupported.push({
        title: "v1 addons in dependencies",
        where: v1,
        action:
          "Upgrade each addon to a v2 version, or remove it.\nApps without ember-cli cannot load v1 addons.",
      });
    }

    if (listFiles(root, "tests/dummy").length > 0 && !isDefaultDummyApp(root)) {
      report.todo.push({
        title: "A dummy app",
        where: ["tests/dummy/"],
        action:
          "Move the demo into its own app, and move acceptance tests with it. Then delete tests/dummy/.\n" +
          "The test build loads every module in tests/, so it fails until tests/dummy/ is gone.",
      });
    }

    let hbsTests = testsWithHbs(root, ["tests"]);

    if (hbsTests.length > 0) {
      report.todo.push({
        title: "Tests that render hbs templates",
        where: hbsTests,
        action:
          "Convert each test to .gjs or .gts, and render with <template>.\n" +
          "The hbs template literal needs ember-cli.",
      });
    }

    let testem = changedTestemFlags(root, "testem.js", "library");

    if (testem) report.todo.push(testem);

    if (listFiles(root, "blueprints").length > 0) {
      report.todo.push({
        title: "Blueprints for ember install",
        where: ["blueprints/"],
        action: "Check that `ember install` still runs them, or document the setup steps for apps.",
      });
    }

    let emberTry = firstExisting(root, ["config/ember-try.js", "tests/dummy/config/ember-try.js"]);

    if (emberTry) {
      report.todo.push({
        title: "ember-try scenarios",
        where: [emberTry],
        action:
          "Move the scenarios that you still need to .try.mjs for @embroider/try.\n" +
          "The new test setup needs ember-source 7.2 or later.",
      });
    }

    if (
      existsSync(join(root, "tsconfig.json")) ||
      filesWithExtension(root, ["addon"], [".ts", ".gts"]).length > 0
    ) {
      report.layers.push("typescript");
      report.todo.push({
        title: "Declarations from isolatedDeclarations",
        where: ["tsconfig.json"],
        action:
          "Run the build, and add the explicit types that TypeScript asks for.\n" +
          "tsdown makes .d.ts files with isolatedDeclarations, which needs a type on each export.",
      });
    }

    if (listFiles(root, "tests").some((file) => /-test\.(js|ts|gjs|gts)$/.test(file))) {
      report.layers.push("qunit");
    }

    return report;
  },

  async run(project, report) {
    let root = project.directory;
    let manifest = await packageJson.read(root);
    let name = manifest.name;
    let main = manifest["ember-addon"]?.main ?? "index.js";
    let typescript = await project.hasOrWantsLayer("typescript");
    let reexports = readAppFolder(root, name);
    let testSupport = listFiles(root, "addon-test-support").length > 0;

    await removeToolingOfWantedLayers(project, report);

    for (let file of listFiles(root, "addon")) {
      if (file.endsWith(".gitkeep")) continue;

      await move(project, file, file.replace(/^addon\//, "src/"));
    }

    for (let file of listFiles(root, "addon-test-support")) {
      await move(project, file, file.replace(/^addon-test-support\//, "src/test-support/"));
    }

    if (!project.hasFile("src/index.js") && !project.hasFile("src/index.ts")) {
      await mkdir(project.path("src"), { recursive: true });
      await writeFile(project.path(typescript ? "src/index.ts" : "src/index.js"), "export {};\n");
    }

    if (isDefaultDummyApp(root)) {
      await remove(project, ["tests/dummy"]);
    }

    if (isEmptyAddonConfig(root)) {
      await remove(project, ["config/environment.js"]);
    }

    await remove(project, [
      "addon",
      "addon-test-support",
      "app",
      "public/.gitkeep",
      "vendor/.gitkeep",
      main,
      "ember-cli-build.js",
      "testem.js",
      "tests/index.html",
      "tests/test-helper.js",
      "tests/test-helper.ts",
      ".npmignore",
      ".ember-cli",
      ".watchmanconfig",
      "tsconfig.declarations.json",
      // the library base writes its own
      "tsconfig.json",
    ]);

    await writeFile(
      project.path("addon-main.cjs"),
      `"use strict";\n\nconst { addonV1Shim } = require("@embroider/addon-shim");\n\nmodule.exports = addonV1Shim(__dirname);\n`,
    );

    await packageJson.removeDependencies(Array.from(TOOLCHAIN), root);
    await packageJson.removeDevDependencies(Array.from(TOOLCHAIN), root);
    await packageJson.addDependencies(
      await getLatest({ "@embroider/addon-shim": "^1.10.3", "decorator-transforms": "^2.4.0" }),
      root,
    );

    await packageJson.modify((json) => {
      json["ember-addon"] = { version: 2, type: "addon", main: "addon-main.cjs" };
      json.files ??= ["addon-main.cjs", "dist", "src"];
      json.exports ??= exportsFor(typescript, testSupport);
      json.imports = { ...json.imports, "#src/*": "./src/*" };

      for (let [script, command] of Object.entries(json.scripts ?? {})) {
        if (/\bember (test|serve|build|try:\S+|s|t|b)\b/.test(String(command))) {
          delete json.scripts[script];
        }
      }
    }, root);

    await rewriteSelfImports(project, name);
    await renameCommonJSFiles(project);

    await buildWithTsdown(project, {
      entry: entriesFor("src", ["**/*.js"]),
      appReexports: reexports.globs.length > 0 ? reexports.globs : undefined,
      css: usesCss(root, "src"),
      typescript,
      outDir: undefined,
    });

    await useEmberSourceForTests(project);

    if (
      listFiles(root, "tests").some((file) => /-test\.(js|ts|gjs|gts)$/.test(file)) &&
      !project.wantsLayer("qunit")
    ) {
      report.todo.push({
        title: "Tests without a test setup",
        where: ["tests/"],
        action: "Run ember.nvp again with the qunit layer, or delete the tests.",
      });
    }
  },
};

/**
 * @param {string} root
 * @param {string} main
 * @returns {string[]} hooks and options of the addon object that a v2 addon cannot have
 */
function addonHooks(root, main) {
  let path = join(root, main);

  if (!existsSync(path)) return [];

  let source = readFileSync(path, "utf-8");
  let program = parseProgram(source, main);

  if (!program) return [`${main}: ember.nvp cannot read this file`];

  /** @type {import('../../javascript.js').Node | undefined} */
  let addon;

  walk(program, (node) => {
    if (node.type !== "AssignmentExpression") return;

    let left = node.left;

    if (
      left?.type === "MemberExpression" &&
      left.object?.name === "module" &&
      left.property?.name === "exports"
    ) {
      addon = node.right;
    }
  });

  if (addon?.type !== "ObjectExpression") {
    return [`${main}: module.exports is not an object`];
  }

  /** @type {string[]} */
  let found = [];

  for (let key of propertyNames(addon)) {
    if (!HARMLESS_ADDON_KEYS.has(key)) found.push(`${main}: ${key}`);
  }

  for (let option of propertyNames(propertyValue(addon, "options"))) {
    if (!HARMLESS_ADDON_OPTIONS.has(option)) found.push(`${main}: options.${option}`);
  }

  return found;
}

/**
 * The blueprint's config/environment.js gives the addon no config:
 *
 *   module.exports = function () { return {}; };
 *
 * @param {string} root
 */
function isEmptyAddonConfig(root) {
  let path = join(root, "config/environment.js");

  if (!existsSync(path)) return false;

  let source = readFileSync(path, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  return /^\s*(["']use strict["'];?)?\s*module\.exports\s*=\s*function\s*\([^)]*\)\s*\{\s*return\s*\{\s*\};?\s*\};?\s*$/.test(
    source,
  );
}

/**
 * Files of the blueprint's dummy app, relative to tests/dummy/app/
 */
const DUMMY_APP_FILES = new Set([
  "app.js",
  "app.ts",
  "config/environment.d.ts",
  "deprecation-workflow.js",
  "deprecation-workflow.ts",
  "index.html",
  "router.js",
  "router.ts",
  "styles/app.css",
  "templates/application.gjs",
  "templates/application.gts",
  "templates/application.hbs",
]);

/**
 * What the blueprint's application template has
 */
const DUMMY_TEMPLATE =
  /import\s+\w+\s+from\s+["']ember-page-title\/helpers\/page-title["'];?|<\/?template>|\{\{\s*page-?[tT]itle\s+["'][^"']*["']\s*\}\}|<h2 id="title">Welcome to Ember<\/h2>|\{\{outlet\}\}/g;

/**
 * Whether tests/dummy/ is still the blueprint's: no routes, no components, no demo of its own.
 *
 * @param {string} root
 */
function isDefaultDummyApp(root) {
  let files = listFiles(root, "tests/dummy/app").filter((file) => !file.endsWith(".gitkeep"));

  if (files.length === 0) return false;

  for (let file of files) {
    if (!DUMMY_APP_FILES.has(file.replace(/^tests\/dummy\/app\//, ""))) return false;
  }

  let router = firstExisting(root, ["tests/dummy/app/router.js", "tests/dummy/app/router.ts"]);

  if (router && /this\.route\(/.test(readFileSync(join(root, router), "utf-8"))) return false;

  let template = firstExisting(root, [
    "tests/dummy/app/templates/application.gjs",
    "tests/dummy/app/templates/application.gts",
    "tests/dummy/app/templates/application.hbs",
  ]);

  if (!template) return true;

  return readFileSync(join(root, template), "utf-8").replace(DUMMY_TEMPLATE, "").trim() === "";
}

/**
 * @typedef {object} AppFolder
 * @property {string[]} globs `appReexports` globs for the built files that app/ re-exports
 * @property {string[]} renamed re-exports whose path differs from the module they re-export
 * @property {string[]} custom modules in app/ with code of their own
 */

/**
 * @param {string} root
 * @param {string} name the addon's package name
 * @returns {AppFolder}
 */
function readAppFolder(root, name) {
  /** @type {AppFolder} */
  let result = { globs: [], renamed: [], custom: [] };

  for (let file of listFiles(root, "app")) {
    if (file.endsWith(".gitkeep") || file.endsWith(".hbs")) continue;

    let path = file.replace(/^app\//, "").replace(/\.\w+$/, "");
    let target = reexportedFrom(readFileSync(join(root, file), "utf-8"), file);

    if (!target) {
      result.custom.push(file);
    } else if (target !== `${name}/${path}` && `${target}/index` !== `${name}/${path}`) {
      result.renamed.push(`${file}: ${target}`);
    } else {
      result.globs.push(`${path}.js`);
    }
  }

  return result;
}

/**
 * The module that an app/ file re-exports, in either form:
 *
 *   export { default } from 'my-addon/components/foo';
 *
 *   import Foo from 'my-addon/components/foo';
 *   export default Foo;
 *
 * @param {string} source
 * @param {string} file
 * @returns {string | undefined} undefined when the file has code of its own
 */
function reexportedFrom(source, file) {
  let program = parseProgram(source, file);
  let body = program?.body ?? [];

  if (body.length === 1 && body[0].type === "ExportNamedDeclaration" && body[0].source) {
    return stringValue(body[0].source);
  }

  let [first, second] = body;

  if (
    body.length === 2 &&
    first?.type === "ImportDeclaration" &&
    first.specifiers?.length === 1 &&
    first.specifiers[0].type === "ImportDefaultSpecifier" &&
    second?.type === "ExportDefaultDeclaration" &&
    second.declaration?.name === first.specifiers[0].local.name
  ) {
    return stringValue(first.source);
  }
}

/**
 * @param {boolean} typescript
 * @param {boolean} testSupport
 * @returns {Record<string, unknown>}
 */
function exportsFor(typescript, testSupport) {
  /**
   * @param {string} path
   */
  let entry = (path) =>
    typescript
      ? { types: `./dist/${path}.d.ts`, default: `./dist/${path}.js` }
      : `./dist/${path}.js`;

  /** @type {Record<string, unknown>} */
  let exports = { ".": entry("index") };

  if (testSupport) {
    exports["./test-support"] = entry("test-support/index");
  }

  exports["./addon-main.js"] = "./addon-main.cjs";
  exports["./*"] = entry("*");

  return exports;
}

/**
 * A v1 addon imports its own modules by the addon's name.
 * A v2 addon imports them by path:
 * - relative paths in src/
 * - `#src/*` in tests, so that tests run against the source
 *
 * @param {Project} project
 * @param {string} name
 */
async function rewriteSelfImports(project, name) {
  let escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let selfImport = new RegExp(`((?:from|import)\\s*\\(?\\s*)(["'])${escaped}(/[^"']*)?\\2`, "g");

  for (let file of filesWithExtension(
    project.directory,
    ["src", "tests"],
    [".js", ".ts", ".gjs", ".gts"],
  )) {
    if (file.startsWith("tests/dummy/")) continue;

    let path = project.path(file);
    let source = readFileSync(path, "utf-8");

    let result = source.replace(selfImport, (_match, keyword, quote, subpath = "") => {
      let target = subpath === "" ? "index" : subpath.slice(1);

      if (file.startsWith("tests/")) return `${keyword}${quote}#src/${target}${quote}`;

      let specifier = relative(dirname(file), `src/${target}`).split("\\").join("/");

      return `${keyword}${quote}${specifier.startsWith(".") ? specifier : `./${specifier}`}${quote}`;
    });

    if (result === source) continue;

    await writeFile(path, rewriteImportsToMatchFiles(result, path));
  }
}

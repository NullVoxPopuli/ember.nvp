import { packageJson, tsconfig } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJSON } from "#utils/fs.js";
import { installedDependencies, v1AddonsIn } from "../../addons.js";
import { beyondEmberRolldown, readBabelConfig } from "../../babel.js";
import { filesWithExtension, firstExisting, listFiles, remove } from "../../files.js";
import { changedTestemFlags, removeToolingOfWantedLayers } from "../../layers.js";
import {
  buildWithTsdown,
  entriesFor,
  renameCommonJSFiles,
  useEmberSourceForTests,
  usesCss,
} from "../../library.js";
import { readRollupConfig } from "./rollup.js";

/**
 * @typedef {import('#types').Finding} Finding
 * @typedef {import('#types').MigrationReport} MigrationReport
 * @typedef {import('#utils/project.js').Project} Project
 */

const ROLLUP_CONFIGS = ["rollup.config.mjs", "rollup.config.js", "rollup.config.cjs"];

const BABEL_CONFIGS = [
  "babel.publish.config.cjs",
  "babel.publish.config.mjs",
  "babel.publish.config.js",
  "babel.publish.config.json",
  "babel.config.json",
  "babel.config.cjs",
  "babel.config.mjs",
  "babel.config.js",
  ".babelrc",
  ".babelrc.json",
];

/**
 * The test setup that the blueprint generates.
 * The qunit layer has its own.
 */
const TEST_SETUP = [
  "testem.cjs",
  "testem.js",
  "tests/index.html",
  "tests/test-helper.ts",
  "tests/test-helper.js",
];

/**
 * Only the build, tests, and demo app use these.
 * Each one either goes away with the migration, or comes back through a layer.
 */
const REPLACED_DEV_DEPENDENCIES = [
  "@embroider/addon-dev",
  "@embroider/compat",
  "@embroider/core",
  "@embroider/test-setup",
  "@embroider/vite",
  "@rollup/plugin-babel",
  "ember-strict-application-resolver",
  "rollup",
  "rollup-plugin-delete",
  "rollup-plugin-glimmer-template-tag",
  "rollup-plugin-ts",
  "testem",
];

/**
 * What the blueprint's demo app has: a router without routes,
 * and an application template with a title and a greeting.
 */
const DEMO_APP_FILES = new Set([
  "demo-app/app.gjs",
  "demo-app/app.gts",
  "demo-app/styles.css",
  "demo-app/templates/application.gjs",
  "demo-app/templates/application.gts",
]);
const DEMO_TEMPLATE =
  /import\s*\{\s*pageTitle\s*\}\s*from\s*["']ember-page-title["'];?|const greeting = ["']hello["'];?|<\/?template>|\{\{pageTitle "Demo App"\}\}|<h1>Welcome to ember!<\/h1>|\{\{greeting\}\}, world!/g;

/**
 * Compiler options that the blueprint's tsconfig files set.
 * The library base's tsconfig.json covers what a library needs.
 */
const BLUEPRINT_COMPILER_OPTIONS = new Set([
  "allowImportingTsExtensions",
  "allowJs",
  "declaration",
  "declarationDir",
  "emitDeclarationOnly",
  "lib",
  "noEmit",
  "noEmitOnError",
  "rootDir",
  "skipLibCheck",
  "types",
]);

/**
 * A v2 addon that builds with rollup and `@embroider/addon-dev`.
 *
 * This covers `@ember/addon-blueprint`, and the addon package of its predecessor,
 * `@embroider/addon-blueprint` (a monorepo with a separate test-app).
 *
 * The migration moves the build to tsdown with `@nullvoxpopuli/ember-rolldown`.
 * The addon keeps its `ember-addon` metadata and `addon-main.cjs`,
 * so that apps with ember-cli can still use it.
 *
 * @type {import('#types').Migration}
 */
export default {
  label: "@ember/addon-blueprint",
  type: "library",

  detect(directory) {
    let manifest = readJSON(join(directory, "package.json"));

    if (manifest?.["ember-addon"]?.version !== 2) return false;

    let config = firstExisting(directory, ROLLUP_CONFIGS);

    return Boolean(
      config && readFileSync(join(directory, config), "utf-8").includes("@embroider/addon-dev"),
    );
  },

  async check(project) {
    /** @type {MigrationReport} */
    let report = { unsupported: [], todo: [], layers: [] };
    let root = project.directory;
    let manifest = await packageJson.read(root);
    let rollupFile = /** @type {string} */ (firstExisting(root, ROLLUP_CONFIGS));
    let rollup = readRollupConfig(root, rollupFile);

    if (!rollup) {
      report.unsupported.push({
        title: "A rollup config that ember.nvp cannot read",
        where: [rollupFile],
        action:
          "Use `new Addon(...)` from @embroider/addon-dev/rollup, the way the blueprint does.",
      });

      return report;
    }

    let templates = filesWithExtension(root, [rollup.srcDir], [".hbs"]);

    if (templates.length > 0) {
      report.unsupported.push({
        title: "Templates in .hbs files",
        where: templates,
        action:
          "Move each template into its component as <template>, in a .gjs or .gts file.\n" +
          "The build compiles <template> only.",
      });
    }

    if (rollup.publicAssets) {
      report.unsupported.push({
        title: "Public assets",
        where: [rollup.publicAssets],
        action:
          "Import each asset from the module that uses it, or publish the assets in another package.\n" +
          "The build does not copy public assets into apps.",
      });
    }

    let v1 = v1AddonsIn(installedDependencies(project.desires.path, manifest.dependencies ?? {}));

    if (v1.length > 0) {
      report.unsupported.push({
        title: "v1 addons in dependencies",
        where: v1,
        action:
          "Upgrade each addon to a v2 version, or remove it.\nApps without ember-cli cannot load v1 addons.",
      });
    }

    if (rollup.unreadEntrypoints) {
      report.todo.push({
        title: "publicEntrypoints that are not a list of strings",
        where: [rollupFile],
        action: "Check `entry` in tsdown.config.js. The migration made every module an entry.",
      });
    }

    if (rollup.appReexportsOptions) {
      report.todo.push({
        title: "appReexports options",
        where: [rollup.appReexportsOptions],
        action: "Add these options to `appReexports(...)` in tsdown.config.js.",
      });
    }

    if (rollup.otherPlugins.length > 0) {
      report.todo.push({
        title: "Rollup plugins that the new build does not have",
        where: rollup.otherPlugins,
        action:
          "Add the plugins that you still need to `plugins` in tsdown.config.js.\n" +
          "tsdown runs most rollup plugins.",
      });
    }

    let babel = publishBabelConfig(root, rollup.babelConfig);
    let extraBabel = babel ? beyondEmberRolldown(babel.config) : [];

    if (babel && extraBabel.length > 0) {
      report.todo.push({
        title: `A babel config with more than the build's defaults`,
        where: [`${babel.file}: ${extraBabel.join(", ")}`],
        action:
          "The build uses this config in place of its defaults.\n" +
          "Remove what the build does not need, then run the build.",
      });
    }

    let typescript = usesTypeScript(root, rollup.srcDir);

    if (typescript) {
      report.layers.push("typescript");
      report.todo.push({
        title: "Declarations from isolatedDeclarations",
        where: ["tsconfig.json"],
        action:
          "Run the build, and add the explicit types that TypeScript asks for.\n" +
          "tsdown makes .d.ts files with isolatedDeclarations, which needs a type on each export.",
      });

      let options = await customCompilerOptions(project);

      if (options.length > 0) {
        report.todo.push({
          title: "Compiler options that the new tsconfig.json does not have",
          where: options,
          action: "Add the options that you still need to tsconfig.json.",
        });
      }
    }

    if (hasTests(root)) {
      report.layers.push("qunit");
    }

    if (listFiles(root, "demo-app").length > 0 && !isDefaultDemoApp(root)) {
      report.todo.push({
        title: "A demo app",
        where: ["index.html", "demo-app/"],
        action:
          "Move the demo into its own app, or delete it.\n" +
          "The test build also builds index.html, so the demo must keep building until it moves.",
      });
    }

    let eslintConfig = firstExisting(root, [
      "eslint.config.mjs",
      "eslint.config.js",
      "eslint.config.cjs",
    ]);

    if (
      eslintConfig &&
      readFileSync(join(root, eslintConfig), "utf-8").includes("@babel/eslint-parser")
    ) {
      report.todo.push({
        title: "An ESLint config that parses with babel",
        where: [eslintConfig],
        action:
          "Select the eslint-bundled layer, or configure @babel/eslint-parser yourself.\n" +
          "The babel config that it reads goes away with the migration.",
      });
    }

    let testem = changedTestemFlags(root, "testem.cjs", "library");

    if (testem) report.todo.push(testem);

    if (existsSync(join(root, ".try.mjs"))) {
      report.todo.push({
        title: "ember-try scenarios",
        where: [".try.mjs"],
        action:
          "Remove the scenarios that set ENABLE_COMPAT_BUILD or use ember-source below 7.2.\n" +
          "The new test setup has no compat mode, and it needs the strict resolver of ember-source 7.2.",
      });
    }

    return report;
  },

  async run(project, report) {
    let root = project.directory;
    let rollupFile = /** @type {string} */ (firstExisting(root, ROLLUP_CONFIGS));
    let rollup = /** @type {import('./rollup.js').RollupSetup} */ (
      readRollupConfig(root, rollupFile)
    );
    let typescript = await project.hasOrWantsLayer("typescript");
    let babel = publishBabelConfig(root, rollup.babelConfig);

    await removeToolingOfWantedLayers(project, report);

    await remove(project, [rollupFile, "config/ember-cli-update.json", "tsconfig.publish.json"]);
    // the blueprint's config for editors and tests, not for the build
    await remove(project, otherBabelConfigs(root, babel?.file));

    if (babel && beyondEmberRolldown(babel.config).length === 0) {
      await remove(project, [babel.file]);
    } else if (babel) {
      await withoutColocationPlugin(project, babel.file);
    }

    // the old test setup builds with @embroider/vite, which leaves with the migration
    await remove(project, TEST_SETUP);
    await removeBlueprintViteConfig(project);

    if (hasTests(root) && !project.wantsLayer("qunit")) {
      report.todo.push({
        title: "Tests without a test setup",
        where: ["tests/"],
        action: "Run ember.nvp again with the qunit layer, or delete the tests.",
      });
    }

    // a demo app of your own is in the report, and keeps the resolver that it imports
    let demo = listFiles(root, "demo-app").length > 0;
    let defaultDemo = demo && isDefaultDemoApp(root);

    if (defaultDemo) {
      await remove(project, ["index.html", "demo-app"]);
    }

    if (onlyComments(root, "unpublished-development-types/index.d.ts")) {
      await remove(project, ["unpublished-development-types"]);
    }

    // the library base writes its own
    await remove(project, ["tsconfig.json"]);

    await packageJson.removeDevDependencies(
      demo && !defaultDemo
        ? REPLACED_DEV_DEPENDENCIES.filter((name) => name !== "ember-strict-application-resolver")
        : REPLACED_DEV_DEPENDENCIES,
      root,
    );
    await packageJson.modify((json) => {
      // the old test setup's script, which the qunit layer replaces
      if (json.scripts?.test?.includes("testem")) delete json.scripts.test;
    }, root);

    await renameCommonJSFiles(project);

    await buildWithTsdown(project, {
      entry: entriesFor(rollup.srcDir, rollup.publicEntrypoints),
      appReexports: rollup.appReexports,
      css: usesCss(root, rollup.srcDir),
      typescript,
      outDir: rollup.destDir === "dist" ? undefined : rollup.destDir,
    });

    await useEmberSourceForTests(project);
  },
};

/**
 * The babel config that the rollup build reads.
 *
 * @param {string} root
 * @param {string | undefined} named the file that rollup.config names
 * @returns {{ file: string, config: import('../../babel.js').BabelConfig } | undefined}
 */
function publishBabelConfig(root, named) {
  let file = named && existsSync(join(root, named)) ? named : firstExisting(root, BABEL_CONFIGS);

  if (!file) return;

  let config = readBabelConfig(root, file) ?? {
    plugins: [],
    presets: [],
    hasCode: true,
    templateTransforms: [],
  };

  return { file, config };
}

/**
 * @param {string} root
 * @param {string | undefined} publishConfig
 * @returns {string[]}
 */
function otherBabelConfigs(root, publishConfig) {
  return BABEL_CONFIGS.filter((file) => file !== publishConfig && existsSync(join(root, file)));
}

/**
 * The colocation plugin joins .hbs files to their components.
 * The migration requires that no .hbs files remain,
 * and the plugin leaves with @embroider/addon-dev.
 *
 * @param {Project} project
 * @param {string} file
 */
async function withoutColocationPlugin(project, file) {
  let path = project.path(file);
  let source = readFileSync(path, "utf-8");
  let result = source.replace(
    /\s*["']@embroider\/addon-dev\/template-colocation-plugin["'],?/g,
    "",
  );

  if (result !== source) {
    await writeFile(path, result);
  }
}

/**
 * The blueprint's vite.config.mjs builds the tests and the demo app.
 * The qunit layer writes its own.
 *
 * @param {Project} project
 */
async function removeBlueprintViteConfig(project) {
  for (let file of ["vite.config.mjs", "vite.config.js", "vite.config.ts"]) {
    let source = await project.read(file);

    if (source?.includes("@embroider/vite")) {
      await remove(project, [file]);
    }
  }
}

/**
 * @param {string} root
 * @param {string} srcDir
 */
function usesTypeScript(root, srcDir) {
  return (
    existsSync(join(root, "tsconfig.json")) ||
    filesWithExtension(root, [srcDir], [".ts", ".gts"]).some((file) => !file.endsWith(".d.ts"))
  );
}

/**
 * @param {string} root
 */
function hasTests(root) {
  return listFiles(root, "tests").some((file) => /-test\.(js|ts|gjs|gts)$/.test(file));
}

/**
 * Whether index.html and demo-app/ are still the blueprint's demo app
 *
 * @param {string} root
 */
function isDefaultDemoApp(root) {
  for (let file of listFiles(root, "demo-app")) {
    if (!DEMO_APP_FILES.has(file)) return false;
  }

  let app = firstExisting(root, ["demo-app/app.gts", "demo-app/app.gjs"]);

  if (app && /this\.route\(/.test(readFileSync(join(root, app), "utf-8"))) return false;

  let template = firstExisting(root, [
    "demo-app/templates/application.gts",
    "demo-app/templates/application.gjs",
  ]);

  if (!template) return true;

  return readFileSync(join(root, template), "utf-8").replace(DEMO_TEMPLATE, "").trim() === "";
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {boolean} whether the file has nothing but comments, like the blueprint's type registry
 */
function onlyComments(root, file) {
  let path = join(root, file);

  if (!existsSync(path)) return false;

  return (
    readFileSync(path, "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .trim() === ""
  );
}

/**
 * @param {Project} project
 * @returns {Promise<string[]>} compiler options beyond the blueprint's, from tsconfig.json and tsconfig.publish.json
 */
async function customCompilerOptions(project) {
  /** @type {string[]} */
  let custom = [];

  for (let file of ["tsconfig.json", "tsconfig.publish.json"]) {
    if (!project.hasFile(file)) continue;

    let config = await tsconfig.read(project.path(file)).catch(() => undefined);

    for (let option of Object.keys(config?.compilerOptions ?? {})) {
      if (!BLUEPRINT_COMPILER_OPTIONS.has(option)) custom.push(`${file}: ${option}`);
    }
  }

  return custom;
}

import { packageJson } from "ember-apply";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import semver from "semver";
import { readJSON } from "#utils/fs.js";
import { removeTypes } from "#utils/remove-types.js";
import { getLatest } from "#utils/npm.js";
import { appModulesIn, installedDependencies, v1AddonsIn } from "./addons.js";
import { readBabelConfig } from "./babel.js";
import { readEnvironmentSettings } from "./environment.js";
import { addImports, carry } from "./carry-over.js";
import {
  EMBER_CLI_BUILD,
  readEmberCliBuild,
  readEnvironmentKeys,
  unsupportedIn,
} from "./ember-cli-build.js";
import { filesWithExtension, firstExisting, listFiles, remove, testsWithHbs } from "./files.js";
import {
  importedNames,
  parseProgram,
  propertyNames,
  propertyValue,
  sourceOf,
  stringValue,
  walk,
} from "./javascript.js";
import { removeToolingOfWantedLayers } from "./layers.js";

/**
 * @typedef {import('#types').Finding} Finding
 * @typedef {import('#types').MigrationReport} MigrationReport
 * @typedef {import('#utils/project.js').Project} Project
 */

const BASE_FILES = join(import.meta.dirname, "../bases/minimal-app/files");

/**
 * What the ember.nvp app base builds with.
 * Read from the base, so that a migrated app matches a generated one.
 */
const BASE_MANIFEST = readJSON(join(BASE_FILES, "package.json"));
const QUNIT_TEST_HELPER = join(import.meta.dirname, "../layers/qunit/files/tests/test-helper.ts");

/**
 * The app base boots with the strict resolver (RFC 1132),
 * which ember-source has from 7.2 on.
 */
const MINIMUM_EMBER_SOURCE = "7.2.0";

/**
 * The ember-cli and compat toolchain.
 * ember.nvp apps build without these, so the migration removes them.
 */
export const TOOLCHAIN = new Set([
  "@ember/optional-features",
  "@embroider/compat",
  "@embroider/config-meta-loader",
  "@embroider/legacy-inspector-support",
  "@embroider/test-setup",
  "@embroider/vite",
  "@embroider/webpack",
  "@glimmer/tracking",
  "broccoli-asset-rev",
  "ember-auto-import",
  "ember-cli",
  "ember-cli-babel",
  "ember-cli-clean-css",
  "ember-cli-dependency-checker",
  "ember-cli-htmlbars",
  "ember-cli-inject-live-reload",
  "ember-cli-sri",
  "ember-cli-terser",
  "ember-cli-typescript",
  "ember-cli-uglify",
  "ember-disable-prototype-extensions",
  "ember-export-application-global",
  "ember-maybe-import-regenerator",
  "ember-resolver",
  "ember-source-channel-url",
  "ember-template-imports",
  "ember-try",
  "loader.js",
  "webpack",
]);

/**
 * v1 addons that the blueprints add, which do nothing unless the app uses them
 *
 * @type {Record<string, RegExp>}
 */
const UNUSED_BLUEPRINT_ADDONS = {
  "ember-cli-app-version": /app-version|appVersion|ember-cli-app-version/,
};

/**
 * @param {string} root
 * @returns {Set<string>} the dependencies that the migration removes
 */
function removedDependencies(root) {
  let removed = new Set(TOOLCHAIN);
  let files = filesWithExtension(root, ["app", "tests"], [".js", ".ts", ".gjs", ".gts", ".hbs"]);
  let sources = files.map((file) => readFileSync(join(root, file), "utf-8"));

  for (let [name, usage] of Object.entries(UNUSED_BLUEPRINT_ADDONS)) {
    if (!sources.some((source) => usage.test(source))) removed.add(name);
  }

  return removed;
}

/**
 * Settings in config/environment.js that the base's app/config.ts covers,
 * or that only the ember-cli build reads.
 */
const KNOWN_ENVIRONMENT = new Set([
  "APP",
  "APP.LOG_ACTIVE_GENERATION",
  "APP.LOG_RESOLVER",
  "APP.LOG_TRANSITIONS",
  "APP.LOG_TRANSITIONS_INTERNAL",
  "APP.LOG_VIEW_LOOKUPS",
  "APP.autoboot",
  "APP.rootElement",
  "EmberENV",
  "EmberENV.EXTEND_PROTOTYPES",
  "EmberENV.EXTEND_PROTOTYPES.Date",
  "EmberENV.FEATURES",
  "EmberENV._APPLICATION_TEMPLATE_WRAPPER",
  "EmberENV._DEFAULT_ASYNC_OBSERVERS",
  "EmberENV._JQUERY_INTEGRATION",
  "EmberENV._NO_IMPLICIT_ROUTE_MODEL",
  "EmberENV._TEMPLATE_ONLY_GLIMMER_COMPONENTS",
  "environment",
  "historySupportMiddleware",
  "locationType",
  "modulePrefix",
  "podModulePrefix",
  "rootURL",
]);

/**
 * Ember's defaults, which ember.nvp apps use
 */
const OPTIONAL_FEATURES = {
  "application-template-wrapper": false,
  "default-async-observers": true,
  "jquery-integration": false,
  "template-only-glimmer-components": true,
  "no-implicit-route-model": true,
};

/**
 * Folders under app/ that the app looks up by name at runtime.
 * The base registers routes, templates, and services.
 * The migration registers these too, when the app has them.
 */
const REGISTERED_FOLDERS = ["controllers", "models", "adapters", "serializers", "transforms"];

/**
 * Babel plugins that the base's babel.config.js has, or that only the compat build needs
 */
const BASE_BABEL_PLUGINS = new Set([
  "@babel/plugin-transform-runtime",
  "@babel/plugin-transform-typescript",
  "@babel/plugin-proposal-decorators",
  "@babel/plugin-transform-class-static-block",
  "babel-plugin-debug-macros",
  "babel-plugin-ember-template-compilation",
  "module:decorator-transforms",
]);

/**
 * Checks what every app needs, from either app blueprint.
 *
 * @param {Project} project
 * @returns {Promise<MigrationReport>}
 */
export async function checkApp(project) {
  /** @type {MigrationReport} */
  let report = { unsupported: [], todo: [], layers: [] };
  let root = project.directory;
  let manifest = await packageJson.read(root);
  /** @type {Record<string, string>} */
  let dependencies = { ...manifest.dependencies, ...manifest.devDependencies };

  checkEmberSource(dependencies, report);

  let removed = removedDependencies(root);
  /** @type {Record<string, string>} */
  let toCheck = {};

  for (let [name, range] of Object.entries(dependencies)) {
    // checked on its own, above
    if (name === "ember-source") continue;
    if (!removed.has(name)) toCheck[name] = range;
  }

  let v1 = v1AddonsIn(installedDependencies(project.desires.path, toCheck));

  if (v1.length > 0) {
    report.unsupported.push({
      title: "v1 addons",
      where: v1,
      action:
        "Upgrade each addon to a v2 version, or remove it.\n" +
        "ember.nvp builds without ember-cli, so v1 addons do not load.",
    });
  }

  let templates = filesWithExtension(root, ["app"], [".hbs"]);

  if (templates.length > 0) {
    report.unsupported.push({
      title: "Templates in .hbs files",
      where: templates,
      action:
        "Convert them to <template> in .gjs or .gts files: npx @embroider/template-tag-codemod\n" +
        "ember.nvp apps build without @embroider/compat, which is what compiles .hbs files.",
    });
  }

  let appModule = firstExisting(root, ["app/app.ts", "app/app.js"]);
  let legacy = appModule
    ? splitAppModule(readFileSync(join(root, appModule), "utf-8"), appModule, new Set()).legacy
    : [];

  if (legacy.length > 0) {
    report.unsupported.push({
      title: "Code in the app module that needs the classic resolver",
      where: legacy,
      action:
        "Remove the use of ember-resolver, ember-load-initializers, and the module prefix.\n" +
        "ember.nvp apps use the strict resolver: the App class lists its modules in `modules`, so they have no module prefix.",
    });
  }

  let pods = podsIn(root);

  if (pods.length > 0) {
    report.unsupported.push({
      title: "The pods layout",
      where: pods,
      action:
        "Move each module to the folder of its type, such as app/components/ and app/routes/.",
    });
  }

  let buildFile = firstExisting(root, EMBER_CLI_BUILD);
  let build = buildFile ? readEmberCliBuild(root, buildFile) : undefined;
  let fromBuild = build ? unsupportedIn(build) : [];

  if (buildFile && !build) {
    fromBuild.push(`${buildFile}: ember.nvp cannot read this file`);
  }

  if (fromBuild.length > 0) {
    report.unsupported.push({
      title: "Build settings in ember-cli-build",
      where: fromBuild,
      action:
        "Remove each setting, or replace it with an import in the app's code.\n" +
        "ember.nvp builds with Vite alone, and does not read ember-cli-build.",
    });
  }

  let inRepoAddons = manifest["ember-addon"]?.paths ?? [];

  if (inRepoAddons.length > 0) {
    report.unsupported.push({
      title: "In-repo addons",
      where: inRepoAddons,
      action:
        "Move each one into app/, or into its own v2 addon package.\n" +
        "In-repo addons are v1 addons, which do not load without ember-cli.",
    });
  }

  let vendor = listFiles(root, "vendor").filter((file) => !file.endsWith(".gitkeep"));

  if (vendor.length > 0) {
    report.unsupported.push({
      title: "Files in vendor/",
      where: vendor,
      action: "Import each file from the app's code, or install it from npm.",
    });
  }

  let features = changedOptionalFeatures(root);

  if (features.length > 0) {
    report.unsupported.push({
      title: "Optional features that differ from Ember's defaults",
      where: features,
      action: "Change the app to work with the default of each feature.",
    });
  }

  let styles = listFiles(root, "app/styles").filter((file) =>
    /\.(scss|sass|less|styl)$/.test(file),
  );

  if (styles.length > 0) {
    report.unsupported.push({
      title: "Styles that an ember-cli addon compiles",
      where: styles,
      action:
        "Convert them to CSS.\n" +
        "After the migration, Vite can compile Sass and Less again, when you install the compiler.",
    });
  }

  let environment = customEnvironment(root);

  if (environment.length > 0) {
    report.todo.push({
      title: "Settings in config/environment.js",
      where: environment,
      action: "Add the settings that you still need to app/config.ts.",
    });
  }

  let variables = environmentSettings(root)?.variables ?? [];

  if (variables.length > 0) {
    report.todo.push({
      title: "Environment variables that app/config.ts reads",
      where: variables.map((name) => `process.env.${name} is import.meta.env.VITE_${name} now`),
      action: "Set each VITE_ variable where the app builds, such as in CI and on the host.",
    });
  }

  let appModules = addonModules(project, toCheck);
  let initializers = appModules.filter((module) => /^(instance-)?initializers\//.test(module.path));

  if (initializers.length > 0) {
    report.todo.push({
      title: "Initializers from addons",
      where: initializers.map((module) => `${module.addon}: ${module.path}`),
      action:
        "Run each one from app/app.ts, with the addon's documented setup.\n" +
        "ember.nvp apps do not merge addon modules into the app.",
    });
  }

  let unregistered = addonServices(root, appModules).filter((module) => !module.specifier);

  if (unregistered.length > 0 || !hasInstall(project)) {
    report.todo.push({
      title: "Services from addons",
      where: unregistered.map((module) => `${module.addon}: ${module.path}`),
      action:
        "Register each addon service that the app injects, in `modules` in app/app.ts:\n" +
        `  "./services/name": ServiceFromTheAddon,` +
        (hasInstall(project) ? "" : "\nember.nvp lists them when the project has node_modules."),
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

  let testSetup = readTestSetup(root) ? [] : customTestHelper(root);

  if (testSetup.length > 0) {
    report.todo.push({
      title: "Test setup of your own",
      where: testSetup,
      action: "Add the setup that you still need to the qunit layer's tests/test-helper.ts.",
    });
  }

  if (listFiles(root, "tests").some((file) => /-test\.(js|ts|gjs|gts)$/.test(file))) {
    report.layers.push("qunit");
  }

  if (existsSync(join(root, "tsconfig.json"))) {
    report.layers.push("typescript");
  }

  if (dependencies["@embroider/legacy-inspector-support"]) {
    report.layers.push("inspector-support");
  }

  return report;
}

/**
 * Modules that the blueprints' tests/test-helper imports
 */
const BLUEPRINT_TEST_HELPER_IMPORTS =
  /^(@ember\/test-helpers|@embroider\/macros|@warp-drive\/ember\/install|ember-qunit|qunit|qunit-dom|.*\/app|.*\/config\/environment)$/;

/**
 * @typedef {object} TestSetup
 * @property {string} file the old tests/test-helper
 * @property {string[]} imports the import declarations beyond the blueprints', as `await import()`
 * @property {string[]} statements the statements of `start()` that use those imports
 */

/**
 * The app's own part of tests/test-helper, which the qunit layer's test-helper does not have.
 *
 * @param {string} root
 * @returns {TestSetup | undefined} undefined when the test-helper has nothing of the app's own
 */
function readTestSetup(root) {
  let file = firstExisting(root, ["tests/test-helper.ts", "tests/test-helper.js"]);

  if (!file) return;

  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  /** @type {string[]} */
  let imports = [];
  /** @type {Set<string>} */
  let names = new Set();

  for (let statement of program.body ?? []) {
    if (statement.type !== "ImportDeclaration") continue;
    if (BLUEPRINT_TEST_HELPER_IMPORTS.test(stringValue(statement.source) ?? "")) continue;

    imports.push(dynamicImport(statement));

    for (let specifier of statement.specifiers ?? []) names.add(specifier.local.name);
  }

  if (imports.length === 0) return;

  /** @type {string[]} */
  let statements = [];

  walk(program, (node) => {
    if (node.type !== "FunctionDeclaration" || node.id?.name !== "start") return;

    for (let statement of node.body?.body ?? []) {
      /** @type {Set<string>} */
      let used = new Set();

      walk(statement, (child) => {
        if (child.type === "Identifier") used.add(child.name);
      });

      if (Array.from(used).some((name) => names.has(name))) {
        statements.push(sourceOf(source, statement));
      }
    }
  });

  return { file, imports, statements };
}

/**
 * The same bindings as an import declaration, from an `await import()`.
 *
 *   import a, { b as c } from "x";   →   const { default: a, b: c } = await import("x");
 *   import "./x.css";                →   await import("./x.css");
 *
 * @param {import('./javascript.js').Node} declaration
 * @returns {string}
 */
function dynamicImport(declaration) {
  let from = JSON.stringify(stringValue(declaration.source));
  let specifiers = declaration.specifiers ?? [];
  let namespace = specifiers.find(
    (/** @type {any} */ specifier) => specifier.type === "ImportNamespaceSpecifier",
  );

  if (namespace) return `const ${namespace.local.name} = await import(${from});`;
  if (specifiers.length === 0) return `await import(${from});`;

  let bindings = specifiers.map((/** @type {any} */ specifier) => {
    let imported =
      specifier.type === "ImportDefaultSpecifier"
        ? "default"
        : (specifier.imported.name ?? stringValue(specifier.imported));

    return imported === specifier.local.name ? imported : `${imported}: ${specifier.local.name}`;
  });

  return `const { ${bindings.join(", ")} } = await import(${from});`;
}

/**
 * Writes the qunit layer's tests/test-helper with the app's own test setup, just before `qunitStart()`.
 * The layer then keeps the file, as the base keeps the babel.config.js that the migration writes.
 * The setup's modules load with `await import()`, after `setTesting(true)`,
 * because they can import addons that read `isTesting()` when they load.
 *
 * @param {Project} project
 * @param {MigrationReport} report
 * @param {TestSetup} setup
 * @param {boolean} typescript
 */
async function writeTestHelper(project, report, setup, typescript) {
  if (!project.wantsLayer("qunit")) {
    report.todo.push({
      title: "Test setup of your own",
      where: setup.imports.map((line) => `${setup.file}: ${line}`),
      action: "Add the setup that you still need to the qunit layer's tests/test-helper.ts.",
    });
    return;
  }

  let layer = readFileSync(QUNIT_TEST_HELPER, "utf-8");
  let code = layer.replace(
    "  qunitStart();",
    setup.imports
      .concat(setup.statements)
      .map((line) => `  ${line}\n`)
      .join("") + "\n  qunitStart();",
  );
  /**
   * The import carries the extension of the app module that the migration wrote.
   * package.json does not map `#app/*` yet, so nothing can look the file up.
   */
  let app = firstExisting(project.directory, ["app/app.ts", "app/app.js"]) ?? "app/app.js";

  code = code.replace(`"#app/app"`, `"#${app}"`);

  if (!typescript) code = await removeTypes(".ts", code);

  await writeFile(project.path(typescript ? "tests/test-helper.ts" : "tests/test-helper.js"), code);
}

/**
 * @param {string} root
 * @returns {string[]} imports of tests/test-helper beyond the blueprints'
 */
function customTestHelper(root) {
  let file = firstExisting(root, ["tests/test-helper.ts", "tests/test-helper.js"]);

  if (!file) return [];

  let program = parseProgram(readFileSync(join(root, file), "utf-8"), file);

  if (!program) return [`${file}: ember.nvp cannot read this file`];

  /** @type {string[]} */
  let custom = [];

  for (let module of new Set(importedNames(program).values())) {
    if (!BLUEPRINT_TEST_HELPER_IMPORTS.test(module)) custom.push(`${file}: import from ${module}`);
  }

  return custom;
}

/**
 * Modules of the addons that the blueprints add to every app.
 * Without an install, these are the only addon modules that the migration knows.
 *
 * @type {import('./addons.js').AppModule[]}
 */
const BLUEPRINT_ADDON_MODULES = [
  {
    addon: "ember-page-title",
    path: "services/page-title",
    specifier: "ember-page-title/services/page-title",
  },
];

/**
 * @param {Project} project
 */
function hasInstall(project) {
  return existsSync(join(project.desires.path, "node_modules"));
}

/**
 * @param {Project} project
 * @param {Record<string, string>} dependencies
 * @returns {import('./addons.js').AppModule[]} the modules that the app's addons merge into it
 */
function addonModules(project, dependencies) {
  if (hasInstall(project)) {
    return appModulesIn(installedDependencies(project.desires.path, dependencies));
  }

  return BLUEPRINT_ADDON_MODULES.filter((module) => module.addon in dependencies);
}

/**
 * @param {string} root
 * @param {import('./addons.js').AppModule[]} modules
 * @returns {import('./addons.js').AppModule[]} the services from addons that the app does not define itself
 */
function addonServices(root, modules) {
  let own = new Set(
    listFiles(root, "app/services").map((file) => file.replace(/^app\//, "").replace(/\.\w+$/, "")),
  );

  return modules.filter((module) => module.path.startsWith("services/") && !own.has(module.path));
}

/**
 * Files in app/ that only re-export a package's module, as ember-cli merged an addon's app tree.
 * The addon's own templates can look these up by name, so the app module registers them,
 * while the app's other components, helpers, and modifiers stay imports.
 *
 * @param {string} root
 * @returns {import('./addons.js').AppModule[]}
 */
function reexportedByName(root) {
  /** @type {import('./addons.js').AppModule[]} */
  let modules = [];

  for (let folder of ["components", "helpers", "modifiers"]) {
    for (let file of listFiles(root, `app/${folder}`)) {
      let source = readFileSync(join(root, file), "utf-8").trim();
      let specifiers = Array.from(
        source.matchAll(/^export (?:\*|\{ default \}) from ["']([^."'#][^"']*)["'];?$/gm),
        (match) => String(match[1]),
      );

      if (specifiers.length === 0 || source.split("\n").length !== specifiers.length) continue;
      if (new Set(specifiers).size !== 1) continue;

      modules.push({
        addon: String(specifiers[0]),
        path: file.replace(/^app\//, "").replace(/\.\w+$/, ""),
        specifier: specifiers[0],
      });
    }
  }

  return modules;
}

/**
 * @param {Record<string, string>} dependencies
 * @param {MigrationReport} report
 */
function checkEmberSource(dependencies, report) {
  let range = dependencies["ember-source"];
  let version = range && semver.validRange(range) ? semver.minVersion(range)?.version : undefined;

  if (!version || semver.gte(version, MINIMUM_EMBER_SOURCE)) return;

  report.unsupported.push({
    title: "An ember-source older than 7.2",
    where: [`ember-source@${version}`],
    action:
      "Upgrade ember-source to 7.2 or later.\n" +
      "ember.nvp apps boot with the strict resolver, which ember-source has from 7.2 on.",
  });
}

/**
 * @param {string} root
 * @returns {string[]} where the app says that it uses pods
 */
function podsIn(root) {
  /** @type {string[]} */
  let found = [];
  let emberCli = join(root, ".ember-cli");

  if (existsSync(emberCli) && /"usePods"\s*:\s*true/.test(readFileSync(emberCli, "utf-8"))) {
    found.push(".ember-cli: usePods");
  }

  let environment = firstExisting(root, ["config/environment.js", "config/environment.cjs"]);

  if (environment) {
    let source = readFileSync(join(root, environment), "utf-8");

    if (/podModulePrefix\s*:\s*["'`][^"'`]+["'`]/.test(source)) {
      found.push(`${environment}: podModulePrefix`);
    }
  }

  return found;
}

/**
 * @param {string} root
 * @returns {string[]} such as `jquery-integration: true`
 */
function changedOptionalFeatures(root) {
  let features = readJSON(join(root, "config/optional-features.json")) ?? {};

  /** @type {string[]} */
  let changed = [];

  for (let [feature, value] of Object.entries(features)) {
    let expected = /** @type {Record<string, boolean>} */ (OPTIONAL_FEATURES)[feature];

    if (expected !== undefined && expected !== value) {
      changed.push(`config/optional-features.json: ${feature}: ${value}`);
    }
  }

  return changed;
}

/**
 * @param {string} root
 * @returns {string[]} settings that the base's app/config.ts does not have
 */
function customEnvironment(root) {
  let settings = environmentSettings(root);

  if (!settings) return [];

  return settings.unreadable;
}

/**
 * @param {string} root
 * @returns {import('./environment.js').EnvironmentSettings | undefined}
 */
function environmentSettings(root) {
  let file = firstExisting(root, ["config/environment.js", "config/environment.cjs"]);

  if (!file) return;

  return readEnvironmentSettings(root, file, (key) => KNOWN_ENVIRONMENT.has(key));
}

/**
 * Writes the base's app/config with the app's own settings from config/environment.js.
 * The base then keeps the file, as it keeps the babel.config.js that the migration writes.
 *
 * @param {Project} project
 * @param {import('./environment.js').EnvironmentSettings} settings
 * @param {boolean} typescript
 */
async function writeConfig(project, settings, typescript) {
  let { properties, statements } = settings;

  if (
    properties.length === 0 &&
    statements.all.length === 0 &&
    statements.development.length === 0 &&
    statements.production.length === 0
  ) {
    return;
  }

  let base = readFileSync(join(BASE_FILES, "app/config.ts"), "utf-8");
  /** @type {string[]} */
  let code = [];

  if (properties.length > 0) {
    code.push(
      [
        "Object.assign(ENV, {",
        properties.map((property) => `  ${indent(property, "  ")},`).join("\n"),
        "});",
      ].join("\n"),
    );
  }

  for (let statement of statements.all) code.push(indent(statement, ""));

  for (let [environment, check] of /** @type {const} */ ([
    ["development", "import.meta.env.DEV"],
    ["production", "import.meta.env.PROD"],
  ])) {
    if (statements[environment].length === 0) continue;

    code.push(
      `if (${check}) {\n${statements[environment].map((statement) => `  ${indent(statement, "  ")}`).join("\n")}\n}`,
    );
  }

  let source = base
    .replace(
      "interface Config {\n",
      "interface Config {\n  /**\n   * The app's own settings, which addons read.\n   */\n  [key: string]: any;\n",
    )
    .replace("\nexport default ENV;", `\n${code.join("\n\n")}\n\nexport default ENV;`);

  if (!typescript) source = await removeTypes(".ts", source);

  await writeFile(project.path(typescript ? "app/config.ts" : "app/config.js"), source);
}

/**
 * @typedef {object} AppMigration
 * @property {string} indexHtml where the old index.html is
 */

/**
 * Replaces the ember-cli and compat setup with the app base's.
 *
 * @param {Project} project
 * @param {MigrationReport} report
 * @param {AppMigration} options
 */
export async function migrateApp(project, report, { indexHtml }) {
  let root = project.directory;
  let manifest = await packageJson.read(root);
  let modulePrefix = readModulePrefix(root) ?? manifest.name;
  let typescript = await project.hasOrWantsLayer("typescript");
  let buildFile = firstExisting(root, EMBER_CLI_BUILD);
  let build = buildFile ? readEmberCliBuild(root, buildFile) : undefined;
  let appModules = addonModules(project, {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });

  await removeToolingOfWantedLayers(project, report);

  await writeFile(
    project.path("index.html"),
    rewriteIndexHtml(project, indexHtml, [modulePrefix, manifest.name], report),
  );

  if (indexHtml !== "index.html") {
    await remove(project, [indexHtml]);
  }

  let initializers =
    listFiles(root, "app/initializers").length +
      listFiles(root, "app/instance-initializers").length >
    0;

  await writeAppModule(project, report, {
    typescript,
    services: addonServices(root, appModules)
      .filter((module) => module.specifier)
      .concat(reexportedByName(root)),
    initializers,
  });

  await replaceBabelConfig(
    project,
    report,
    build?.warpDrive ?? (await emberDataConfig(project, manifest, build, report)),
  );
  await replaceViteConfig(project, report);
  await rewriteImports(project, modulePrefix, manifest.name);

  let environment = environmentSettings(root);
  let testSetup = readTestSetup(root);

  /**
   * The qunit layer's test-helper sets the test config in start(), so the app's own test settings go there too.
   */
  if (environment && environment.statements.test.length > 0) {
    let statements = environment.statements.test.map((code) => code.replace(/\bENV\b/g, "config"));

    testSetup = testSetup
      ? { ...testSetup, statements: testSetup.statements.concat(statements) }
      : { file: "config/environment.js", imports: [], statements };
  }

  await remove(project, EMBER_CLI_BUILD);
  await remove(project, [
    ".ember-cli",
    ".watchmanconfig",
    "app/config/environment.d.ts",
    "app/config/environment.js",
    "app/config/environment.ts",
    "config/ember-cli-update.json",
    "config/environment.js",
    "config/optional-features.json",
    "config/targets.js",
    // the qunit layer brings its own test setup. testem.cjs already works with it.
    "testem.js",
    "tests/index.html",
    "tests/test-helper.js",
    "tests/test-helper.ts",
  ]);

  if (testSetup) await writeTestHelper(project, report, testSetup, typescript);
  if (environment) await writeConfig(project, environment, typescript);

  if (listFiles(root, "app/config").length === 0) {
    await remove(project, ["app/config"]);
  }

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

  await usePackageJsonOfBase(project, { initializers });
}

/**
 * @param {string} root
 * @returns {string | undefined}
 */
function readModulePrefix(root) {
  let file = firstExisting(root, ["config/environment.js", "config/environment.cjs"]);

  if (!file) return;

  let match = /modulePrefix\s*:\s*["'`]([^"'`]+)["'`]/.exec(
    readFileSync(join(root, file), "utf-8"),
  );

  return match?.[1];
}

/**
 * The base's index.html boots the app from `#app/app`, with the config from `#config`.
 *
 * The rest of the old index.html stays, except:
 * - ember-cli's `{{content-for}}` placeholders
 * - the vendor files and boot script of the old build
 * - the app's stylesheet, which Vite serves from app/styles/app.css
 *
 * @param {Project} project
 * @param {string} file the old index.html
 * @param {string[]} names the module prefix and the package name, which name the old app bundle
 * @param {MigrationReport} report
 * @returns {string}
 */
function rewriteIndexHtml(project, file, names, report) {
  let base = readFileSync(join(BASE_FILES, "index.html"), "utf-8");

  if (!project.hasFile(file)) return base;

  let html = readFileSync(project.path(file), "utf-8");
  let boot = /** @type {string} */ (
    /[ \t]*<script type="module">[\s\S]*?<\/script>\n/.exec(base)?.[0]
  );
  let stylesheet = project.hasFile("app/styles/app.css")
    ? `<link rel="stylesheet" href="/app/styles/app.css" />`
    : "";
  let placedStylesheet = false;
  let bundles = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  let bundle = `(?:assets\\/(?:vendor|test-support|${bundles})\\.(?:css|js)|@embroider\\/virtual\\/)`;
  let buildScript = new RegExp(
    `^[ \\t]*<script\\b[^>]*\\bsrc="[^"]*${bundle}[^"]*"[^>]*><\\/script>[ \\t]*\\n`,
    "gm",
  );
  let buildStylesheet = new RegExp(
    `^([ \\t]*)<link\\b[^>]*\\bhref="[^"]*${bundle}[^"]*"[^>]*>[ \\t]*\\n`,
    "gm",
  );

  let result = html
    .replace(CONTENT_FOR, "")
    .replace(MODULE_SCRIPT, (script) =>
      /Application|config\/environment/.test(script) ? "" : script,
    )
    .replace(buildScript, "")
    .replace(buildStylesheet, (_link, indent) => {
      if (placedStylesheet || !stylesheet) return "";

      placedStylesheet = true;

      return `${indent}${stylesheet}\n`;
    })
    .replace(/\{\{rootURL\}\}/g, "/")
    .replace(/[ \t]*<\/body>/, `${boot}  </body>`)
    // blank lines where the removed lines were
    .replace(/(<(?:head|body)\b[^>]*>\n)(?:[ \t]*\n)+/g, "$1")
    .replace(/\n(?:[ \t]*\n)+([ \t]*<\/(?:head|body)>)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n");

  let leftover = result.match(/\{\{[^}]+\}\}/g) ?? [];

  if (leftover.length > 0) {
    report.todo.push({
      title: "ember-cli placeholders in index.html",
      where: leftover,
      action: "Replace each placeholder with its value. Vite does not fill them in.",
    });
  }

  return result;
}

const CONTENT_FOR = /^[ \t]*\{\{content-for\s+["'][^"']+["']\s*\}\}[ \t]*\n/gm;
const MODULE_SCRIPT = /^[ \t]*<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>[ \t]*\n/gm;

/**
 * Imports and class members that the blueprints' app/app.ts has.
 * The base's app module replaces all of them.
 */
const BLUEPRINT_APP_IMPORTS =
  /^(@ember\/application|@embroider\/virtual\/compat-modules|ember-resolver|ember-load-initializers|@embroider\/macros|@embroider\/legacy-inspector-support.*|@warp-drive\/ember\/install|.*\/config\/environment|\.\/config\/environment|\.\/deprecation-workflow)$/;
const BLUEPRINT_APP_MEMBERS = new Set(["modulePrefix", "podModulePrefix", "Resolver", "inspector"]);
const CLASSIC_RESOLVER_MODULES = /^(ember-resolver|ember-load-initializers)$/;
const CONFIG_MODULE = /(^|\/)config\/environment$/;

/**
 * @typedef {object} AppModuleOptions
 * @property {boolean} typescript
 * @property {import('./addons.js').AppModule[]} services addon services to register
 * @property {boolean} initializers whether the app has initializers
 */

/**
 * Writes the base's app module, with what this app needs on top:
 * - WarpDrive's reactivity, when the old app module installed it
 * - the deprecation workflow in development, when the app has one
 * - the services that addons provided through app-js
 * - the app's folders that Ember looks up by name, beyond the base's
 * - the app's initializers
 * - the app's own top-level code, in its old order
 *
 * @param {Project} project
 * @param {MigrationReport} report
 * @param {AppModuleOptions} options
 */
async function writeAppModule(project, report, { typescript, services, initializers }) {
  let root = project.directory;
  let oldFile = firstExisting(root, ["app/app.ts", "app/app.js"]);
  let oldSource = oldFile ? readFileSync(project.path(oldFile), "utf-8") : "";
  let base = readFileSync(join(BASE_FILES, "app/app.ts"), "utf-8");
  let comment = base.slice(0, base.indexOf("import Application"));
  let baseEntries = /** @type {string} */ (/  modules = \{\n([\s\S]*?)\n  \};/.exec(base)?.[1]);
  let classComment = /\n(\/\*\*[\s\S]*?\*\/)\nexport default class App/.exec(base)?.[1];

  /** @type {string[]} */
  let lines = [comment.trimEnd()];

  if (/["']@warp-drive\/ember\/install["']/.test(oldSource)) {
    lines.push(`import "@warp-drive/ember/install";`);
  }

  lines.push(`import Application from "@ember/application";`);
  lines.push(`import config from "#config";`);

  let deprecationWorkflow = firstExisting(root, [
    "app/deprecation-workflow.ts",
    "app/deprecation-workflow.js",
  ]);

  if (deprecationWorkflow) {
    lines.push(`import { importSync, isDevelopingApp, macroCondition } from "@embroider/macros";`);
  }

  if (initializers) {
    lines.push(`import loadInitializers from "ember-load-initializers";`);
  }

  /** @type {Set<string>} */
  let provided = new Set(["Application", "config"]);

  if (deprecationWorkflow) {
    provided.add("importSync").add("isDevelopingApp").add("macroCondition");
  }

  if (initializers) provided.add("loadInitializers");

  for (let service of services) {
    lines.push(`import ${toIdentifier(service.path)} from "${service.specifier}";`);
    provided.add(toIdentifier(service.path));
  }

  let old = oldFile
    ? splitAppModule(oldSource, oldFile, provided)
    : { before: [], after: [], custom: [], config: [], legacy: [] };
  let workflow = {
    code: [
      "if (macroCondition(isDevelopingApp())) {",
      `  importSync("./deprecation-workflow");`,
      "}",
    ].join("\n"),
    blankBefore: true,
  };
  let before = old.before
    .filter((chunk) => deprecationWorkflow || !chunk.workflow)
    .map((chunk) => (chunk.workflow ? workflow : chunk));

  if (deprecationWorkflow && !old.before.some((chunk) => chunk.workflow)) {
    before.push(workflow);
  }

  /**
   * The app's own code keeps its config, which the new module gets from `#config`.
   */
  for (let name of old.config) {
    if (name !== "config") lines.push(`import ${name} from "#config";`);
  }

  pushCode(lines, before);

  lines.push("");

  if (classComment) lines.push(classComment);

  lines.push("export default class App extends Application {", "  modules = {");

  // first, so that the app's own services of the same name win
  for (let service of services) {
    lines.push(`    "./${service.path}": ${toIdentifier(service.path)},`);
  }

  lines.push(baseEntries);

  for (let folder of REGISTERED_FOLDERS) {
    if (listFiles(root, `app/${folder}`).some((file) => !file.endsWith(".gitkeep"))) {
      lines.push(`    ...import.meta.glob("./${folder}/**/*", { eager: true }),`);
    }
  }

  lines.push("  };", "}");

  if (initializers) {
    lines.push(
      "",
      `const initializers = import.meta.glob("./{initializers,instance-initializers}/*", { eager: true });`,
      "",
      "// each initializer is named after its file, without the extension",
      "loadInitializers(",
      "  App,",
      `  ".",`,
      "  Object.fromEntries(",
      `    Object.entries(initializers).map(([path, module]) => [path.replace(/\\.\\w+$/, ""), module]),`,
      "  ),",
      ");",
    );
  }

  pushCode(lines, old.after);

  if (old.custom.length > 0) {
    report.todo.push({
      title: "Code in the old app module that the new one does not have",
      where: old.custom,
      action: `Add the code that you still need to ${typescript ? "app/app.ts" : "app/app.js"}.`,
    });
  }

  await remove(project, ["app/app.ts", "app/app.js"]);
  await writeFile(project.path(typescript ? "app/app.ts" : "app/app.js"), lines.join("\n") + "\n");
}

/**
 * @typedef {object} Chunk
 * @property {string} code a top-level statement, with the comments above it
 * @property {boolean} blankBefore whether a blank line came before it
 * @property {boolean} [workflow] marks where the old module loaded the deprecation workflow
 */

/**
 * @typedef {object} OldAppModule
 * @property {Chunk[]} before the app's own code above the class
 * @property {Chunk[]} after the app's own code below the class
 * @property {string[]} custom what the new module still does not have
 * @property {string[]} config the names that the app's own code uses from config/environment
 * @property {string[]} legacy the app's own code that needs the classic resolver
 */

/**
 * Splits the old app module into the blueprint's code, which the new module replaces,
 * and the app's own code, which the new module keeps.
 *
 * @param {string} source
 * @param {string} file
 * @param {Set<string>} provided names that the new module imports
 * @returns {OldAppModule}
 */
function splitAppModule(source, file, provided) {
  /** @type {OldAppModule} */
  let result = { before: [], after: [], custom: [], config: [], legacy: [] };
  let program = parseProgram(source, file);

  if (!program) {
    result.custom.push(`${file}: ember.nvp cannot read this file`);
    return result;
  }

  /**
   * Names from the imports that the migration drops.
   * The app's own code can still use them.
   *
   * @type {Map<string, string>}
   */
  let dropped = new Map();
  /** @type {import('./javascript.js').Node[]} */
  let kept = [];
  let section = result.before;
  let end = 0;

  for (let statement of program.body ?? []) {
    let text = source.slice(end, statement.end);
    let blankBefore = /\n[ \t]*\n/.test(/^\s*/.exec(text)?.[0] ?? "");
    let module = statement.type === "ImportDeclaration" ? stringValue(statement.source) : undefined;

    end = statement.end;

    if (module && BLUEPRINT_APP_IMPORTS.test(module)) {
      for (let specifier of statement.specifiers ?? []) {
        dropped.set(specifier.local.name, module);
      }

      continue;
    }

    if (isAppClass(statement, dropped)) {
      let body = statement.declaration?.body ?? statement.body;

      for (let member of body?.body ?? []) {
        let name = member.key?.name ?? "...";

        if (!BLUEPRINT_APP_MEMBERS.has(name)) result.custom.push(`class member ${name}`);
      }

      section = result.after;
      continue;
    }

    let code = sourceOf(source, statement);

    if (statement.type === "ExpressionStatement" && /^loadInitializers\(/.test(code)) continue;

    if (statement.type === "IfStatement" && code.includes("deprecation-workflow")) {
      section.push({ code: "", blankBefore, workflow: true });
      continue;
    }

    section.push({ code: text.trimStart(), blankBefore });
    kept.push(statement);
  }

  /** @type {Set<string>} */
  let missing = new Set();
  /** @type {Set<string>} */
  let config = new Set();
  /** @type {Set<string>} */
  let legacy = new Set();

  walk(kept, (node, parent) => {
    if (node.type !== "Identifier") return;
    if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if (parent?.type === "Property" && parent.key === node && !parent.shorthand) return;

    let module = dropped.get(node.name);

    if (!module) return;

    /**
     * The strict resolver has no module prefix, and no ember-resolver or ember-load-initializers.
     * Code that still needs them cannot work after the migration, so it stops the migration.
     */
    if (CLASSIC_RESOLVER_MODULES.test(module)) {
      legacy.add(`${file}: ${node.name} from ${module}`);
      return;
    }

    if (CONFIG_MODULE.test(module)) {
      let member =
        parent?.type === "MemberExpression" && parent.object === node
          ? parent.property?.name
          : undefined;

      if (member === "modulePrefix" || member === "podModulePrefix") {
        legacy.add(`${file}: ${node.name}.${member}`);
      } else {
        config.add(node.name);
      }

      return;
    }

    if (!provided.has(node.name)) missing.add(`${node.name} from ${module}`);
  });

  for (let name of missing) result.custom.push(name);

  result.config = Array.from(config);
  result.legacy = Array.from(legacy);

  return result;
}

/**
 * @param {import('./javascript.js').Node} statement
 * @param {Map<string, string>} dropped
 * @returns {boolean} whether the statement is the blueprint's `App` class, or its default export
 */
function isAppClass(statement, dropped) {
  if (statement.type === "ExportDefaultDeclaration") return true;

  return (
    statement.type === "ClassDeclaration" &&
    dropped.get(statement.superClass?.name) === "@ember/application"
  );
}

/**
 * @param {string[]} lines
 * @param {Chunk[]} chunks
 */
function pushCode(lines, chunks) {
  for (let [index, chunk] of chunks.entries()) {
    if (index === 0 || chunk.blankBefore) lines.push("");

    lines.push(chunk.code);
  }
}

/**
 * @param {string} path such as `services/page-title`
 * @returns {string} such as `PageTitleService`
 */
function toIdentifier(path) {
  let slash = path.indexOf("/");
  let words = path.slice(slash + 1).split(/[^a-zA-Z0-9]+/);
  let suffix = path.slice(0, slash).replace(/s$/, "");

  return (
    words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("") +
    suffix.charAt(0).toUpperCase() +
    suffix.slice(1)
  );
}

/**
 * The ember-data addon sets the WarpDrive config in its `included` hook,
 * from the `emberData` option of `new EmberApp`.
 * An app without ember-cli runs no `included` hooks,
 * so babel.config.js must make the same call.
 *
 * @param {Project} project
 * @param {Record<string, any>} manifest
 * @param {import('./ember-cli-build.js').EmberCliBuild | undefined} build
 * @param {MigrationReport} report
 * @returns {Promise<{ from: string, options: string } | undefined>}
 */
async function emberDataConfig(project, manifest, build, report) {
  let range = manifest.dependencies?.["ember-data"] ?? manifest.devDependencies?.["ember-data"];

  if (!range) return;

  let version = semver.validRange(range) ? semver.minVersion(range) : undefined;

  /**
   * ember-data moved setConfig into @warp-drive/core in 5.6
   */
  if (!version || semver.lt(version, "5.6.0")) {
    report.todo.push({
      title: "WarpDrive build config",
      where: [`ember-data@${range}`],
      action:
        "Upgrade ember-data to 5.6 or later, or call setConfig in the configure hook of babel.config.js.\n" +
        "Without ember-cli, the ember-data addon does not set the WarpDrive config.",
    });

    return;
  }

  let core = "@warp-drive/core";

  if (!manifest.dependencies?.[core] && !manifest.devDependencies?.[core]) {
    if (manifest.dependencies?.["ember-data"]) {
      await packageJson.addDependencies({ [core]: range }, project.directory);
    } else {
      await packageJson.addDevDependencies({ [core]: range }, project.directory);
    }
  }

  /**
   * The addon adds this flag.
   * It tells setConfig that the config comes from the old `emberData` option.
   */
  let properties = (build?.emberData ?? []).concat("___legacy_support: true");

  return {
    from: `${core}/build-config`,
    options: `{\n${properties.map((property) => `  ${indent(property, "  ")},\n`).join("")}}`,
  };
}

/**
 * The base's babel.config.js, plus the WarpDrive config that ember-cli-build set.
 *
 * @param {Project} project
 * @param {MigrationReport} report
 * @param {{ from: string, options: string } | undefined} warpDrive
 */
async function replaceBabelConfig(project, report, warpDrive) {
  let root = project.directory;
  let old = firstExisting(root, [
    "babel.config.mjs",
    "babel.config.cjs",
    "babel.config.js",
    ".babelrc",
    ".babelrc.json",
  ]);
  let config = old ? readBabelConfig(root, old) : undefined;
  let extra = (config?.plugins ?? []).filter((plugin) => !BASE_BABEL_PLUGINS.has(plugin));
  let transforms = (config?.templateTransforms ?? []).filter(
    (transform) => !/templateCompatSupport|templateMacros/.test(transform),
  );
  let carried = old ? carryBabelPlugins(root, old, new Set(extra), new Set(transforms)) : undefined;
  let left = extra
    .filter((plugin) => !carried?.plugins.has(plugin))
    .concat(
      transforms
        .filter((transform) => !carried?.transforms.has(transform))
        .map((transform) => `template transform: ${transform}`),
    );

  if (left.length > 0) {
    report.todo.push({
      title: "Babel plugins that the new babel.config.js does not have",
      where: left,
      action: "Add the plugins that you still need to babel.config.js.",
    });
  }

  if (old) await remove(project, [old]);

  let base = readFileSync(join(BASE_FILES, "babel.config.js"), "utf-8");

  if (warpDrive) {
    base = base
      .replace(
        `import { buildMacros } from "@embroider/macros/babel";\n`,
        (line) => `${line}import { setConfig } from "${warpDrive.from}";\n`,
      )
      .replace(
        /  configure\(config\) \{\n/,
        (line) => `${line}    setConfig(config, ${indent(warpDrive.options, "    ")});\n\n`,
      );
  }

  if (carried) {
    let plugins = Array.from(carried.plugins.values(), (code) => `    ${indent(code, "    ")},\n`);
    let added = Array.from(carried.transforms.values()).join(", ");

    base = addImports(base, carried.imports)
      .replace("    ...macros.babelMacros,\n", (line) => plugins.join("") + line)
      .replace("[...macros.templateMacros]", (list) =>
        added ? `[...macros.templateMacros, ${added}]` : list,
      );
  }

  await writeFile(project.path("babel.config.js"), base);
}

/**
 * The plugins and template transforms of the old babel config that the new one can take as they are:
 * code that uses only imports and globals.
 *
 * @param {string} root
 * @param {string} file
 * @param {Set<string>} names the plugins to take
 * @param {Set<string>} transforms the template transforms to take, by source
 * @returns {{ plugins: Map<string, string>, transforms: Map<string, string>, imports: string[] } | undefined}
 */
function carryBabelPlugins(root, file, names, transforms) {
  if (!/\.[cm]?js$/.test(file)) return;

  let source = readFileSync(join(root, file), "utf-8");
  let program = parseProgram(source, file);

  if (!program) return;

  /** @type {Map<string, string>} */
  let plugins = new Map();
  /** @type {Map<string, string>} */
  let carriedTransforms = new Map();
  /** @type {string[]} */
  let imports = [];

  walk(program, (node) => {
    if (node.type !== "ObjectExpression") return;

    let list = propertyValue(node, "plugins");

    if (list?.type !== "ArrayExpression") return;

    for (let element of list.elements ?? []) {
      let entry = element?.type === "ArrayExpression" ? element.elements?.[0] : element;
      let name =
        stringValue(entry) ??
        (entry?.type === "CallExpression" && entry.callee?.property?.name === "resolve"
          ? stringValue(entry.arguments?.[0])
          : undefined);

      if (name && names.has(name)) {
        let code = carry(source, program, element);

        if (code) {
          plugins.set(name, code.code);
          imports = imports.concat(code.imports);
        }
      }

      let options = element?.type === "ArrayExpression" ? element.elements?.[1] : undefined;
      let list = propertyValue(options, "transforms");

      if (name !== "babel-plugin-ember-template-compilation" || list?.type !== "ArrayExpression") {
        continue;
      }

      for (let transform of list.elements ?? []) {
        let text = transform ? sourceOf(source, transform) : "";
        let code = transforms.has(text) ? carry(source, program, transform) : undefined;

        if (code) {
          carriedTransforms.set(text, code.code);
          imports = imports.concat(code.imports);
        }
      }
    }
  });

  return { plugins, transforms: carriedTransforms, imports };
}

/**
 * Moves the lines after the first one, so that the least indented line starts at `prefix`.
 *
 * @param {string} source
 * @param {string} prefix
 */
function indent(source, prefix) {
  let lines = source.split("\n");
  let margin = Infinity;

  for (let i = 1; i < lines.length; i++) {
    let line = /** @type {string} */ (lines[i]);

    if (line.trim()) margin = Math.min(margin, /^[ \t]*/.exec(line)?.[0].length ?? 0);
  }

  for (let i = 1; i < lines.length; i++) {
    let line = /** @type {string} */ (lines[i]);

    lines[i] = line.trim() ? prefix + line.slice(margin) : "";
  }

  return lines.join("\n");
}

/**
 * The blueprint's vite.config builds with @embroider/vite and compat.
 * The new one is the base's, with the old plugins that use only imports and globals.
 * The rest is listed for the user.
 *
 * @param {Project} project
 * @param {MigrationReport} report
 */
async function replaceViteConfig(project, report) {
  let file = firstExisting(project.directory, [
    "vite.config.mjs",
    "vite.config.js",
    "vite.config.ts",
    "vite.config.mts",
  ]);

  if (!file) return;

  let source = readFileSync(project.path(file), "utf-8");
  let program = parseProgram(source, file);
  /** @type {string[]} */
  let extra = [];
  /**
   * Plugins that the new config takes as they are, before or after the ember plugin, as in the old one.
   *
   * @type {{ before: string[], after: string[], imports: string[] }}
   */
  let carried = { before: [], after: [], imports: [] };

  if (program) {
    let imports = importedNames(program);

    walk(program, (node) => {
      if (node.type !== "CallExpression" || node.callee?.name !== "defineConfig") return;

      let options = node.arguments?.[0];

      for (let name of propertyNames(options)) {
        if (name !== "plugins") extra.push(`${name}: ...`);
      }

      let plugins = propertyValue(options, "plugins");
      let afterEmber = false;

      for (let plugin of plugins?.elements ?? []) {
        let callee = plugin?.type === "CallExpression" ? plugin.callee : undefined;
        let from = callee?.type === "Identifier" ? imports.get(callee.name) : undefined;

        if (from === "@embroider/vite" || from === "@rollup/plugin-babel") {
          afterEmber = true;
          continue;
        }
        if (
          plugin?.type === "SpreadElement" &&
          /classicEmberSupport/.test(sourceOf(source, plugin))
        )
          continue;

        let code = plugin ? carry(source, program, plugin) : undefined;

        if (code) {
          (afterEmber ? carried.after : carried.before).push(code.code);
          carried.imports = carried.imports.concat(code.imports);
          continue;
        }

        extra.push(sourceOf(source, plugin).replace(/\s+/g, " "));
      }
    });
  } else {
    extra.push(`${file}: ember.nvp cannot read this file`);
  }

  if (extra.length > 0) {
    report.todo.push({
      title: "Vite settings that the new vite.config.mjs does not have",
      where: extra,
      action: "Add the settings that you still need to vite.config.mjs.",
    });
  }

  await remove(project, [file]);

  if (carried.before.length > 0 || carried.after.length > 0) {
    let base = readFileSync(join(BASE_FILES, "vite.config.mjs"), "utf-8");
    let list = carried.before.concat("ember()", carried.after).join(", ");

    await writeFile(
      project.path("vite.config.mjs"),
      addImports(base, carried.imports).replace("plugins: [ember()]", `plugins: [${list}]`),
    );
  }
}

/**
 * `<modulePrefix>/config/environment` is `#config` now.
 *
 * When the module prefix is not the package name,
 * imports from the module prefix move to the package name,
 * which `exports` in package.json maps to app/.
 *
 * @param {Project} project
 * @param {string} modulePrefix
 * @param {string} name
 */
async function rewriteImports(project, modulePrefix, name) {
  let prefix = modulePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let config = new RegExp(`(["'])${prefix}/config/environment(\\.\\w+)?\\1`, "g");
  let other = new RegExp(`(["'])${prefix}/`, "g");
  /**
   * `./config/environment` in app/router.js, for example.
   */
  let relativeConfig =
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/(?:[\w.-]+\/)*config\/environment)(?:\.\w+)?\2/g;
  let relativeImport = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"'\n]*)\2/g;

  for (let file of filesWithExtension(
    project.directory,
    ["app", "tests", "types"],
    [".js", ".ts", ".gjs", ".gts"],
  )) {
    let path = project.path(file);
    let source = readFileSync(path, "utf-8");
    let result = source
      .replace(config, "$1#config$1")
      .replace(relativeConfig, (match, before, quote, specifier) =>
        posix.join(posix.dirname(file), specifier) === "app/config/environment"
          ? `${before}${quote}#config${quote}`
          : match,
      );

    if (modulePrefix !== name) {
      result = result.replace(other, `$1${name}/`);
    }

    /**
     * The classic build gave tests/ the module names `<modulePrefix>/tests/...`,
     * so `../../utils/ajax` in tests/acceptance/ named app/utils/ajax.
     * Now the path is a file path, and the package name maps to app/.
     */
    if (file.startsWith("tests/")) {
      result = result.replace(relativeImport, (match, before, quote, specifier) => {
        let target = posix.join(posix.dirname(file), specifier);

        return target.startsWith("tests/") || target.startsWith("../")
          ? match
          : `${before}${quote}${name}/${target}${quote}`;
      });
    }

    if (result !== source) await writeFile(path, result);
  }
}

/**
 * Brings the base's scripts, subpath imports, exports, and dependencies,
 * and removes the ember-cli toolchain.
 *
 * @param {Project} project
 * @param {{ initializers: boolean }} options
 */
async function usePackageJsonOfBase(project, { initializers }) {
  let root = project.directory;
  let manifest = await packageJson.read(root);
  let removed = Array.from(removedDependencies(root));

  if (!initializers) removed.push("ember-load-initializers");

  await packageJson.removeDependencies(removed, root);
  await packageJson.removeDevDependencies(removed, root);

  /** @type {Record<string, string>} */
  let dependencies = {};
  /** @type {Record<string, string>} */
  let devDependencies = {};

  for (let [name, range] of Object.entries(BASE_MANIFEST.dependencies)) {
    if (!manifest.dependencies?.[name] && !manifest.devDependencies?.[name])
      dependencies[name] = String(range);
  }

  for (let [name, range] of Object.entries(BASE_MANIFEST.devDependencies)) {
    if (!manifest.dependencies?.[name] && !manifest.devDependencies?.[name])
      devDependencies[name] = String(range);
  }

  await packageJson.addDependencies(await getLatest(dependencies), root);
  await packageJson.addDevDependencies(await getLatest(devDependencies), root);

  await packageJson.modify((json) => {
    json.type = "module";
    json.scripts ||= {};

    for (let [script, command] of Object.entries(BASE_MANIFEST.scripts)) {
      json.scripts[script] = command;
    }

    for (let [script, command] of Object.entries(json.scripts)) {
      if (/\bember (test|serve|build|s|t|b)\b|\btestem\b/.test(String(command))) {
        delete json.scripts[script];
      }
    }

    json.imports = { ...BASE_MANIFEST.imports, ...json.imports };
    json.exports ??= BASE_MANIFEST.exports;
  }, root);
}

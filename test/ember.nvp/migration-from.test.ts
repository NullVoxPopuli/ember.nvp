import { describe, it, expect, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { packageJson } from "ember-apply";
import {
  checkMigration,
  detectMigration,
  formatFindings,
  migrate as runMigration,
  MigrationError,
} from "#migration-from";
import { Project } from "#utils/project.js";
import { generateProject } from "ember.nvp";
import { listFiles } from "../../src/migration-from/files.js";
import { cli, generate, layers, mktemp } from "#test-helpers";
import type { ProjectType } from "#types";
import {
  addonBlueprint,
  appBlueprint,
  appWithOwnCode,
  classicAddon,
  classicApp,
  classicAppEmberData,
} from "./migration-from-fixtures.ts";

const FIXTURES = {
  "addon-blueprint": addonBlueprint,
  "app-blueprint": appBlueprint,
  "classic-build-app-blueprint": classicApp,
  "classic-build-addon-blueprint": classicAddon,
};

const dirs: string[] = [];

afterAll(async () => {
  if (process.env.CI) return;

  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

async function fixture(name: keyof typeof FIXTURES, files: Record<string, string> = {}) {
  let dir = await mktemp(`migration-from-${name}`);
  dirs.push(dir);

  for (let [file, contents] of Object.entries({ ...FIXTURES[name], ...files })) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), contents);
  }

  return dir;
}

async function migrate(directory: string, type: ProjectType, layers: string[]) {
  let { name } = await packageJson.read(directory);

  return generate({ directory, name, type, layers });
}

/**
 * @returns the titles of the unsupported findings, or undefined when the migration succeeds
 */
async function unsupported(directory: string, type: ProjectType) {
  try {
    await migrate(directory, type, []);
  } catch (error) {
    if (error instanceof MigrationError) {
      return error.findings.map((finding) => finding.title);
    }

    throw error;
  }
}

function read(directory: string, file: string) {
  return readFile(join(directory, file), "utf-8");
}

describe("detectMigration", () => {
  const cases = {
    "addon-blueprint": "@ember/addon-blueprint",
    "app-blueprint": "@ember/app-blueprint",
    "classic-build-app-blueprint": "@ember-tooling/classic-build-app-blueprint",
    "classic-build-addon-blueprint": "@ember-tooling/classic-build-addon-blueprint",
  };

  for (let [name, label] of Object.entries(cases)) {
    it(`detects ${label}`, async () => {
      let dir = await fixture(name as keyof typeof FIXTURES);

      expect(detectMigration(dir)?.label).toBe(label);
    });
  }

  for (let type of ["app", "library"] as const) {
    it(`detects nothing in a ${type} that ember.nvp generates`, async () => {
      let project = await generate({ type });
      dirs.push(project.directory);

      expect(detectMigration(project.directory)).toBe(undefined);
    });
  }
});

describe("@ember/addon-blueprint", () => {
  it("moves the build to tsdown", async () => {
    let dir = await fixture("addon-blueprint");

    await migrate(dir, "library", ["typescript", "qunit"]);

    for (let file of [
      "rollup.config.mjs",
      "babel.config.cjs",
      "babel.publish.config.cjs",
      "tsconfig.publish.json",
      "testem.cjs",
      "index.html",
      "demo-app",
      "unpublished-development-types",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let config = await read(dir, "tsdown.config.js");

    expect(config).toContain(`"./src/**/*.{js,ts,gjs,gts}"`);
    expect(config).toContain(
      `appReexports(["components/**/*.js", "helpers/**/*.js", "modifiers/**/*.js", "services/**/*.js"])`,
    );

    let manifest = await packageJson.read(dir);

    expect(manifest.type).toBe("module");
    expect(manifest.scripts.build).toBe("tsdown");
    expect(manifest.exports["."].types).toBe("./dist/index.d.ts");
    expect(manifest.files).not.toContain("declarations");
    expect(manifest["ember-addon"].main).toBe("addon-main.cjs");
    expect(manifest.devDependencies).not.toHaveProperty("@embroider/addon-dev");
    expect(manifest.devDependencies).not.toHaveProperty("rollup");
    expect(manifest.devDependencies).toHaveProperty("tsdown");
  });

  it("stops at .hbs templates and public assets, and changes nothing", async () => {
    let dir = await fixture("addon-blueprint", {
      "src/components/greeting.hbs": "Hello",
      "src/components/greeting.js": "export default class Greeting {}",
    });
    let rollup = await read(dir, "rollup.config.mjs");

    await writeFile(
      join(dir, "rollup.config.mjs"),
      rollup.replace("addon.clean(),", "addon.clean(),\n    addon.publicAssets('public'),"),
    );

    expect(await unsupported(dir, "library")).toEqual(["Templates in .hbs files", "Public assets"]);
    expect(existsSync(join(dir, "rollup.config.mjs"))).toBe(true);
  });
});

describe("@ember/app-blueprint", () => {
  it("moves the app off @embroider/compat", async () => {
    let dir = await fixture("app-blueprint");

    await migrate(dir, "app", ["typescript", "qunit"]);

    for (let file of [
      "ember-cli-build.mjs",
      "babel.config.mjs",
      "config/environment.js",
      "config/optional-features.json",
      "app/config/environment.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let html = await read(dir, "index.html");

    expect(html).not.toContain("content-for");
    expect(html).not.toContain("@embroider/virtual");
    expect(html).toContain(`<link rel="stylesheet" href="/app/styles/app.css" />`);
    expect(html).toContain(`import Application from "#app/app";`);

    let app = await read(dir, "app/app.ts");

    expect(app).toContain(`import "@warp-drive/ember/install";`);
    expect(app).toContain(`"./services/page-title": PageTitleService`);
    expect(app).toContain(`importSync("./deprecation-workflow");`);

    expect(await read(dir, "app/router.ts")).toContain(`import config from '#config';`);
    expect(await read(dir, "babel.config.js")).toContain("setConfig(config, {");

    let manifest = await packageJson.read(dir);

    expect(manifest.scripts.build).toBe("vite build");
    expect(manifest.devDependencies).not.toHaveProperty("ember-cli");
    expect(manifest.devDependencies).not.toHaveProperty("@embroider/compat");
    expect(manifest.devDependencies).toHaveProperty("@nullvoxpopuli/ember-vite");
  });

  it("stops at compat features, and changes nothing", async () => {
    let dir = await fixture("app-blueprint", {
      "app/components/greeting.hbs": "Hello",
      "vendor/legacy.js": "window.legacy = true;",
    });
    let build = await read(dir, "ember-cli-build.mjs");

    await writeFile(
      join(dir, "ember-cli-build.mjs"),
      build.replace("// Add options here", "sassOptions: {},"),
    );

    expect(await unsupported(dir, "app")).toEqual([
      "Templates in .hbs files",
      "Build settings in ember-cli-build",
      "Files in vendor/",
    ]);
    expect(existsSync(join(dir, "ember-cli-build.mjs"))).toBe(true);
  });

  it("reads the top level of node_modules, when there is one", async () => {
    let dir = await fixture("app-blueprint", {
      "node_modules/ember-cli-mirage/package.json": JSON.stringify({
        name: "ember-cli-mirage",
        version: "3.0.4",
        keywords: ["ember-addon"],
      }),
      // installed, but not a dependency of the app
      "node_modules/ember-fetch/package.json": JSON.stringify({
        name: "ember-fetch",
        version: "8.1.2",
        keywords: ["ember-addon"],
      }),
      "node_modules/@acme/session/package.json": JSON.stringify({
        name: "@acme/session",
        version: "1.0.0",
        keywords: ["ember-addon"],
        exports: { "./*": "./dist/*.js" },
        "ember-addon": {
          version: 2,
          "app-js": { "./services/session.js": "./dist/_app_/services/session.js" },
        },
      }),
    });

    await packageJson.addDevDependencies({ "@acme/session": "link:../session" }, dir);

    let project = new Project(dir, {
      name: "my-app",
      type: "app",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    expect((await checkMigration(project))?.report.unsupported).toEqual([]);

    await packageJson.addDevDependencies({ "ember-cli-mirage": "^3.0.0" }, dir);

    let report = (await checkMigration(project))?.report;

    expect(report?.unsupported.map((finding) => finding.where)).toEqual([
      ["ember-cli-mirage@3.0.4"],
    ]);

    await packageJson.removeDevDependencies(["ember-cli-mirage"], dir);
    await migrate(dir, "app", ["typescript"]);

    let app = await read(dir, "app/app.ts");

    expect(app).toContain(`import SessionService from "@acme/session/_app_/services/session";`);
    expect(app).toContain(`"./services/session": SessionService,`);
  });

  it("keeps the app's own babel and vite plugins", async () => {
    /**
     * From rust-lang/crates.io, after ember-upgrade, shortened.
     */
    let dir = await fixture("app-blueprint", {
      "babel.config.mjs": `import { babelCompatSupport, templateCompatSupport } from '@embroider/compat/babel';
import { scopedCSS } from 'ember-scoped-css/babel';

const local = {};

export default {
  plugins: [
    ['@babel/plugin-transform-typescript', { allExtensions: true }],
    [
      'babel-plugin-ember-template-compilation',
      { transforms: [...templateCompatSupport(), scopedCSS.template({})] },
    ],
    'ember-concurrency/async-arrow-task-transform',
    ['some-plugin', local],
    ...babelCompatSupport(),
  ],
};
`,
      "vite.config.mjs": `import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';
import { scopedCSS } from 'ember-scoped-css/vite';
import svgJar from '@svg-jar/plugin/vite';

export default defineConfig({
  plugins: [
    scopedCSS(),
    classicEmberSupport(),
    ember(),
    babel({ babelHelpers: 'runtime', extensions }),
    svgJar({ target: 'ember' }),
  ],
});
`,
    });

    let { name } = await packageJson.read(dir);
    let { todo } = await generateProject(
      new Project(dir, { name, type: "app", path: dir, layers: [], packageManager: "pnpm" }),
    );
    expect(await read(dir, "babel.config.js")).toMatchInlineSnapshot(`
      "import { buildMacros } from "@embroider/macros/babel";
      import { setConfig } from "@warp-drive/core/build-config";
      import { scopedCSS } from "ember-scoped-css/babel";

      const isProduction = process.env.NODE_ENV === "production";

      const macros = buildMacros({
        configure(config) {
          setConfig(config, {
            compatWith: '5.8',
          });

          if (process.env.EMBER_ENV === "test") {
            config.enableRuntimeMode();
          }
        },
      });

      export default {
        plugins: [[
          "babel-plugin-ember-template-compilation",
          {
            transforms: [...macros.templateMacros, scopedCSS.template({})],
          },
        ], [
          "module:decorator-transforms",
          {
            runtime: {
              import: import.meta.resolve("decorator-transforms/runtime-esm"),
            },
          },
        ], [
          "@babel/plugin-transform-runtime",
          {
            absoluteRuntime: import.meta.dirname,
            useESModules: true,
            regenerator: false,
          },
        ], isProduction && [
          "babel-plugin-debug-macros",
          {
            debugTools: {
              isDebug: false,
              source: "@ember/debug",
              assertPredicateIndex: 1,
            },
            externalizeHelpers: {
              module: "@ember/debug",
            },
          },
          "@ember/debug stripping",
        ], 'ember-concurrency/async-arrow-task-transform', ...macros.babelMacros].filter(Boolean),

        generatorOpts: {
          compact: false,
        },
      };
      "
    `);
    expect(await read(dir, "vite.config.mjs")).toMatchInlineSnapshot(`
      "import { defineConfig } from "vite";
      import { ember } from "@nullvoxpopuli/ember-vite";
      import { scopedCSS } from "ember-scoped-css/vite";
      import svgJar from "@svg-jar/plugin/vite";

      export default defineConfig({
        plugins: [scopedCSS(), ember(), svgJar({ target: 'ember' })],
      });
      "
    `);
    expect(
      todo
        .filter((finding) => /^(Babel plugins|Vite settings)/.test(finding.title))
        .map((finding) => [finding.title, finding.where]),
    ).toMatchInlineSnapshot(`
      [
        [
          "Babel plugins that the new babel.config.js does not have",
          [
            "some-plugin",
          ],
        ],
      ]
    `);
  });

  it("keeps the app's own code in the app module", async () => {
    let dir = await fixture("app-blueprint", appWithOwnCode);

    await rm(join(dir, "app/app.ts"));

    await migrate(dir, "app", []);

    expect(await read(dir, "app/app.js")).toMatchInlineSnapshot(`
      "/**
       * Looking for services that come from addons?
       *
       * App-tree merging from libraries is not supported.
       * See: https://github.com/embroider-build/embroider/issues/2659
       *
       * For services, look in to either of:
       * - https://github.com/chancancode/ember-polaris-service-
       * - https://ember-primitives.pages.dev/6-utils/createService.md
       *   - https://ember-primitives.pages.dev/6-utils/createAsyncService.md
       */
      import Application from "@ember/application";
      import config from "#config";
      import { importSync, isDevelopingApp, macroCondition } from "@embroider/macros";
      import PageTitleService from "ember-page-title/services/page-title";

      import { setBuildURLConfig } from '@ember-data/request-utils';

      setBuildURLConfig({
        namespace: 'api',
      });

      /* This is to account for a deprecation that shipped in ember-cli 6.4
         with ember-data v5.6 which needs a blueprint update to avoid the
         deprecation that is otherwise irrelevant for tutorial purposes.
      */
      import { registerDeprecationHandler } from '@ember/debug';
      registerDeprecationHandler((message, options, next) => {
        if (message.includes('Using WarpDrive with EmberJS requires')) {
          return;
        } else {
          next(message, options);
        }
      });

      if (macroCondition(isDevelopingApp())) {
        importSync("./deprecation-workflow");
      }

      /**
       * \`./config/environment\` is there because addons look up the app's config as \`config:environment\`.
       */
      export default class App extends Application {
        modules = {
          "./services/page-title": PageTitleService,
          "./config/environment": { default: config },
          ...import.meta.glob("./router.*", { eager: true }),
          ...import.meta.glob("./routes/**/*", { eager: true }),
          ...import.meta.glob("./templates/**/*", { eager: true }),
          ...import.meta.glob("./services/**/*", { eager: true }),
        };
      }
      "
    `);
  });

  it("imports the config from #config where the app used a relative path", async () => {
    /**
     * From rust-lang/crates.io: app/router.js and app/sentry.js.
     */
    let dir = await fixture("app-blueprint", {
      "app/sentry.js": "import config from './config/environment';\n\nexport default config;\n",
      "app/routes/crate.js":
        "import config from '../config/environment';\nimport other from './config/environment';\n",
    });

    await migrate(dir, "app", []);

    expect(await read(dir, "app/sentry.js")).toMatchInlineSnapshot(`
      "import config from '#config';

      export default config;
      "
    `);
    expect(await read(dir, "app/routes/crate.js")).toMatchInlineSnapshot(`
      "import config from '#config';
      import other from './config/environment';
      "
    `);
  });

  it("imports app modules by the package name where a test left tests/ with a relative path", async () => {
    /**
     * From rust-lang/crates.io: tests/utils/license-test.js.
     */
    let dir = await fixture("app-blueprint", {
      "tests/utils/license-test.js":
        "import { parseLicense } from '../../utils/license';\nimport { setup } from '../helpers';\n",
    });

    await migrate(dir, "app", []);

    expect(await read(dir, "tests/utils/license-test.js")).toMatchInlineSnapshot(`
      "import { parseLicense } from 'my-app/utils/license';
      import { setup } from '../helpers';
      "
    `);
  });

  it("keeps the app's own router.js, without a router.ts from the base", async () => {
    /**
     * From rust-lang/crates.io: `import.meta.glob("./router.*")` picked up both files.
     */
    let dir = await fixture("app-blueprint", {
      "app/router.js": `import EmberRouter from '@ember/routing/router';

export default class Router extends EmberRouter {}

Router.map(function () {
  this.route('crates');
});
`,
    });

    await rm(join(dir, "app/router.ts"));

    await migrate(dir, "app", ["typescript", "qunit"]);

    expect(listFiles(dir, "app").filter((file) => /router/.test(file))).toMatchInlineSnapshot(`
      [
        "app/router.js",
      ]
    `);
  });

  it("keeps the app's own test setup in the qunit layer's test-helper", async () => {
    /**
     * From rust-lang/crates.io, after ember-upgrade, shortened.
     */
    let dir = await fixture("app-blueprint", {
      "tests/test-helper.js": `import { setApplication } from '@ember/test-helpers';
import { start as qunitStart, setupEmberOnerrorValidation } from 'ember-qunit';
import * as QUnit from 'qunit';
import { setup } from 'qunit-dom';

import Application from '../app';
import config from '../config/environment';
import registerMatchJsonAssertion from './helpers/match-json';
import { registerQUnitCallbacks } from './helpers/setup-msw';
import './vendor/qunit.css';

export function start() {
  setup(QUnit.assert);
  registerMatchJsonAssertion(QUnit.assert);
  registerQUnitCallbacks(QUnit);

  setApplication(Application.create(config.APP));

  setupEmberOnerrorValidation();
  qunitStart();
}
`,
    });

    await rm(join(dir, "tests/test-helper.ts"), { force: true });

    let { name } = await packageJson.read(dir);
    let { todo } = await generateProject(
      new Project(dir, {
        name,
        type: "app",
        path: dir,
        layers: layers.filter((layer) => layer.name === "qunit"),
        packageManager: "pnpm",
      }),
    );

    expect(await read(dir, "tests/test-helper.js")).toMatchInlineSnapshot(`
      "import { getOwner } from '@ember/owner';
      import {
        currentRouteName,
        currentURL,
        getSettledState,
        resetOnerror,
        setApplication,
        visit,
      } from '@ember/test-helpers';
      import { getPendingWaiterState } from '@ember/test-waiters';
      import * as QUnit from 'qunit';
      import { setup } from 'qunit-dom';
      import { setupEmberOnerrorValidation, start as qunitStart } from 'ember-qunit';
      import { setTesting } from '@embroider/macros';

      import config from '#config';

      Object.assign(window, {
        visit,
        getSettledState,
        getPendingWaiterState,
        currentURL,
        currentRouteName,
        getOwner,
        snapshotTimers: (label) => {
          console.debug(
            label ?? 'snapshotTimers',
            JSON.parse(
              JSON.stringify({
                settled: getSettledState(),
                waiters: getPendingWaiterState(),
              }),
            ),
          );
        },
      });

      /**
       * The test modules, in their traditional location and co-located with the app.
       */
      const tests = Object.assign(
        import.meta.glob(['./**/*.{js,ts,gjs,gts}', '!./test-helper.*']),
        import.meta.glob('./**/*-test.{js,ts,gjs,gts}', { base: '../app' }),
      );

      /**
       * Addons such as ember-window-mock read \`isTesting()\` when their module loads,
       * so the app and the tests load only after \`setTesting(true)\`.
       */
      export async function start() {
        config.locationType = 'none';
        config.APP.rootElement = '#ember-testing';
        config.APP.autoboot = false;

        setTesting(true);

        const { default: Application } = await import('#app/app.js');

        await Promise.all(Object.values(tests).map((load) => load()));

        setApplication(Application.create(config.APP));
        setup(QUnit.assert);
        setupEmberOnerrorValidation();

        QUnit.moduleStart(({ name }) => console.group(name));
        QUnit.testStart(({ name }) => console.group(name));
        QUnit.testDone(() => console.groupEnd());
        QUnit.moduleDone(() => console.groupEnd());
        QUnit.testDone(resetOnerror);

        const { default: registerMatchJsonAssertion } =
          await import('./helpers/match-json');
        const { registerQUnitCallbacks } = await import('./helpers/setup-msw');
        await import('./vendor/qunit.css');
        registerMatchJsonAssertion(QUnit.assert);
        registerQUnitCallbacks(QUnit);

        qunitStart();
      }
      "
    `);
    expect(todo.map((finding) => finding.title)).not.toContain("Test setup of your own");
  });

  it("keeps the app's own settings from config/environment.js", async () => {
    /**
     * From rust-lang/crates.io.
     */
    let dir = await fixture("app-blueprint", {
      "config/environment.js": `'use strict';

module.exports = function (environment) {
  let ENV = {
    modulePrefix: 'crates-io',
    environment,
    rootURL: '/',
    locationType: 'history',
    historySupportMiddleware: true,
    EmberENV: {
      FEATURES: {
        // Here you can enable experimental features on an ember canary build
        // e.g. 'with-controller': true
      },
      EXTEND_PROTOTYPES: {
        // Prevent Ember Data from overriding Date.parse.
        Date: false,
      },
    },

    APP: {
      // Here you can pass flags/options to your application instance
      // when it is created
    },

    'ember-cli-notifications': {
      autoClear: true,
      clearDuration: 10_000,
    },

    '@sentry/ember': {
      disablePerformance: true,
    },
  };

  if (environment === 'development') {
    // ENV.APP.LOG_RESOLVER = true;
    // ENV.APP.LOG_ACTIVE_GENERATION = true;
    // ENV.APP.LOG_TRANSITIONS = true;
    // ENV.APP.LOG_TRANSITIONS_INTERNAL = true;
    // ENV.APP.LOG_VIEW_LOOKUPS = true;
    ENV['ember-a11y-testing'] = {
      componentOptions: {
        turnAuditOff: true,
      },
    };
  }

  if (environment === 'test') {
    // Testem prefers this...
    ENV.locationType = 'none';

    // keep test console output quieter
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;

    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;

    // disable auto clearing so that we can manually clear the queue if needed
    ENV['ember-cli-notifications'].autoClear = false;
  }

  if (environment === 'production') {
    // here you can enable a production-specific feature
    ENV.sentry = {
      dsn: process.env.SENTRY_DSN_WEB,
    };

    // Heroku Git Hash support
    if (process.env.SOURCE_VERSION) {
      ENV.sentry.release = process.env.SOURCE_VERSION.slice(0, 7);
    }
  }

  return ENV;
};
`,
    });

    let { name } = await packageJson.read(dir);
    let { todo } = await generateProject(
      new Project(dir, {
        name,
        type: "app",
        path: dir,
        layers: layers.filter((layer) => ["qunit", "typescript"].includes(layer.name)),
        packageManager: "pnpm",
      }),
    );
    let helper = await read(dir, "tests/test-helper.ts");

    expect(await read(dir, "app/config.ts")).toMatchInlineSnapshot(`
      "interface Config {
        /**
         * The app's own settings, which addons read.
         */
        [key: string]: any;
        environment: "development" | "production";
        locationType: "history" | "hash" | "none" | "auto";
        rootURL: string;
        EmberENV?: Record<string, unknown>;
        APP: Record<string, unknown> & { rootElement?: string; autoboot?: boolean };
      }

      const ENV: Config = {
        environment: import.meta.env.DEV ? "development" : "production",
        rootURL: "/",
        locationType: "history",
        EmberENV: {},
        APP: {},
      };

      Object.assign(ENV, {
        'ember-cli-notifications': {
          autoClear: true,
          clearDuration: 10_000,
        },
        '@sentry/ember': {
          disablePerformance: true,
        },
      });

      if (import.meta.env.DEV) {
        ENV['ember-a11y-testing'] = {
          componentOptions: {
            turnAuditOff: true,
          },
        };
      }

      if (import.meta.env.PROD) {
        ENV.sentry = {
          dsn: import.meta.env.VITE_SENTRY_DSN_WEB,
        };
        if (import.meta.env.VITE_SOURCE_VERSION) {
          ENV.sentry.release = import.meta.env.VITE_SOURCE_VERSION.slice(0, 7);
        }
      }

      export default ENV;
      "
    `);
    expect(helper.slice(helper.indexOf("export async function start"))).toMatchInlineSnapshot(`
      "export async function start() {
        config.locationType = "none";
        config.APP.rootElement = "#ember-testing";
        config.APP.autoboot = false;

        setTesting(true);

        const { default: Application } = await import("#app/app.ts");

        await Promise.all(Object.values(tests).map((load) => load()));

        setApplication(Application.create(config.APP));
        setup(QUnit.assert);
        setupEmberOnerrorValidation();

        QUnit.moduleStart(({ name }) => console.group(name));
        QUnit.testStart(({ name }) => console.group(name));
        QUnit.testDone(() => console.groupEnd());
        QUnit.moduleDone(() => console.groupEnd());
        QUnit.testDone(resetOnerror);

        config['ember-cli-notifications'].autoClear = false;

        qunitStart();
      }
      "
    `);
    expect(
      todo
        .filter((finding) => /config|Environment/.test(finding.title))
        .map((finding) => [finding.title, finding.where]),
    ).toMatchInlineSnapshot(`
      [
        [
          "Environment variables that app/config.ts reads",
          [
            "process.env.SENTRY_DSN_WEB is import.meta.env.VITE_SENTRY_DSN_WEB now",
            "process.env.SOURCE_VERSION is import.meta.env.VITE_SOURCE_VERSION now",
          ],
        ],
      ]
    `);
  });

  it("registers the components that re-export an addon's app tree", async () => {
    /**
     * From rust-lang/crates.io, after ember-upgrade's app-tree stage:
     * ember-cli-notifications' own templates use <NotificationMessage> by name.
     */
    let dir = await fixture("app-blueprint", {
      "app/components/notification-message.js":
        'export * from "ember-cli-notifications/_app_/components/notification-message";\n' +
        'export { default } from "ember-cli-notifications/_app_/components/notification-message";\n',
      "app/components/footer.gjs": "<template>footer</template>\n",
    });

    await rm(join(dir, "app/app.ts"));

    await migrate(dir, "app", []);

    let app = await read(dir, "app/app.js");

    expect(
      app
        .split("\n")
        .filter((line) => /notification|footer|components/i.test(line))
        .join("\n"),
    ).toMatchInlineSnapshot(`
      "import NotificationMessageComponent from "ember-cli-notifications/_app_/components/notification-message";
          "./components/notification-message": NotificationMessageComponent,"
    `);
  });

  it("imports the config of the app's own code from #config", async () => {
    let dir = await fixture("app-blueprint", {
      "app/app.ts": appBlueprint["app/app.ts"]!.replace(
        "\nexport default",
        "\nconsole.log(config.environment);\n\nexport default",
      ),
    });

    await migrate(dir, "app", []);

    let app = await read(dir, "app/app.js");

    expect(app).toContain(`import config from "#config";`);
    expect(app).toContain("console.log(config.environment);");
    expect(app).not.toMatch(/from ["'][^"']*config\/environment/);
  });

  it("stops when the app's own code needs the classic resolver", async () => {
    let dir = await fixture("app-blueprint", {
      "app/app.ts": appBlueprint["app/app.ts"]!.replace(
        "\nexport default",
        "\nconsole.log(config.modulePrefix, Resolver);\n\nexport default",
      ),
    });

    expect(await unsupported(dir, "app")).toEqual([
      "Code in the app module that needs the classic resolver",
    ]);
  });

  it("stops at an ember-source older than 7.2", async () => {
    let dir = await fixture("app-blueprint");

    await packageJson.modify((json) => {
      json.devDependencies["ember-source"] = "~6.4.0";
    }, dir);

    expect(await unsupported(dir, "app")).toEqual(["An ember-source older than 7.2"]);
  });
});

describe("@ember-tooling/classic-build-app-blueprint", () => {
  it("moves the app from ember-cli to Vite", async () => {
    let dir = await fixture("classic-build-app-blueprint");

    await migrate(dir, "app", ["typescript", "qunit"]);

    for (let file of ["ember-cli-build.js", "app/index.html", "testem.js", "types/global.d.ts"]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let html = await read(dir, "index.html");

    expect(html).not.toContain("{{");
    expect(html).not.toContain("assets/vendor");
    expect(html).toContain(`<link rel="icon" href="/assets/favicon.png">`);
    expect(html).toContain(`import Application from "#app/app";`);

    expect(await read(dir, "tsconfig.json")).toContain("@ember/app-tsconfig");

    let manifest = await packageJson.read(dir);

    expect(manifest.devDependencies).not.toHaveProperty("ember-cli-app-version");
    expect(manifest.devDependencies).not.toHaveProperty("@tsconfig/ember");
  });
});

describe("ember-data", () => {
  it("moves the emberData option into babel.config.js", async () => {
    let dir = await fixture("classic-build-app-blueprint", classicAppEmberData);

    await migrate(dir, "app", ["typescript"]);

    let babel = await read(dir, "babel.config.js");

    expect(babel).toContain(`import { setConfig } from "@warp-drive/core/build-config";`);
    expect(babel).toContain(`    setConfig(config, {
      deprecations: {
        DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false,
      },
      ___legacy_support: true,
    });`);

    let manifest = await packageJson.read(dir);

    expect(manifest.dependencies).toHaveProperty("@warp-drive/core", "~5.8.2");
  });

  it("sets the WarpDrive config when ember-cli-build does not", async () => {
    let dir = await fixture("classic-build-app-blueprint", {
      "package.json": classicAppEmberData["package.json"]!,
    });

    await migrate(dir, "app", ["typescript"]);

    expect(await read(dir, "babel.config.js")).toContain(`    setConfig(config, {
      ___legacy_support: true,
    });`);
  });

  it("keeps the setConfig call of ember-cli-build", async () => {
    let dir = await fixture("app-blueprint");

    await packageJson.addDevDependencies({ "ember-data": "~5.8.2" }, dir);
    await migrate(dir, "app", ["typescript"]);

    let babel = await read(dir, "babel.config.js");

    expect(babel).toContain(`    setConfig(config, {
      compatWith: '5.8',
    });`);
    expect(babel).not.toContain("___legacy_support");
  });
});

describe("testem configs", () => {
  it("lists browser flags that differ from the new testem config", async () => {
    let dir = await fixture("classic-build-app-blueprint", {
      "testem.js": classicApp["testem.js"]!.replace(
        "'--disable-software-rasterizer',",
        "'--use-gl=angle',",
      ),
    });
    let project = new Project(dir, {
      name: "my-classic-app",
      type: "app",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    let todo = (await checkMigration(project))?.report.todo ?? [];
    let flags = todo.find((finding) => finding.title.startsWith("Browser flags"));

    expect(flags?.where).toEqual([
      "--use-gl=angle: only in testem.js",
      "--disable-software-rasterizer: only in testem.cjs",
    ]);
  });
});

describe("@ember-tooling/classic-build-addon-blueprint", () => {
  it("makes a v2 addon that builds with tsdown", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "addon/components/greeting.gjs": "<template>Hello</template>",
      "addon/utils/shout.js":
        "import { quiet } from 'my-classic-addon/utils/quiet';\n\nexport const shout = (text) => quiet(text).toUpperCase();\n",
      "addon/utils/quiet.js": "export const quiet = (text) => text;\n",
      "addon-test-support/index.js": "export function setupGreeting() {}\n",
      "app/components/greeting.js":
        "export { default } from 'my-classic-addon/components/greeting';\n",
    });

    await migrate(dir, "library", ["qunit"]);

    for (let file of [
      "index.js",
      "ember-cli-build.js",
      "addon",
      "app",
      ".npmignore",
      "tests/dummy",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    expect(await read(dir, "src/components/greeting.gjs")).toBe("<template>Hello</template>");
    expect(await read(dir, "src/utils/shout.js")).toContain(`from "./quiet.js";`);
    expect(existsSync(join(dir, "src/test-support/index.js"))).toBe(true);
    expect(await read(dir, "addon-main.cjs")).toContain("addonV1Shim");
    expect(existsSync(join(dir, ".prettierrc.cjs"))).toBe(true);
    expect(await read(dir, "tsdown.config.js")).toContain(
      `appReexports(["components/greeting.js"])`,
    );

    let manifest = await packageJson.read(dir);

    expect(manifest["ember-addon"]).toEqual({ version: 2, type: "addon", main: "addon-main.cjs" });
    expect(manifest.exports["./test-support"]).toBe("./dist/test-support/index.js");
    expect(manifest.dependencies).toHaveProperty("@embroider/addon-shim");
    expect(manifest.dependencies).not.toHaveProperty("ember-cli-babel");
  });

  it("keeps a dummy app with a demo of its own, and lists it", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "tests/dummy/app/router.js": `Router.map(function () {\n  this.route("docs");\n});\n`,
    });
    let project = new Project(dir, {
      name: "my-classic-addon",
      type: "library",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    let result = await checkMigration(project);

    expect(result?.report.todo.map((finding) => finding.title)).toContain("A dummy app");

    await migrate(dir, "library", []);

    expect(existsSync(join(dir, "tests/dummy/app/router.js"))).toBe(true);
  });

  it("stops at ember-cli hooks, and changes nothing", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "index.js": `'use strict';\n\nmodule.exports = {\n  name: require('./package').name,\n  included() {},\n  contentFor() {},\n};\n`,
      "addon/styles/addon.css": ".greeting {}",
    });

    expect(await unsupported(dir, "library")).toEqual([
      "ember-cli hooks in the addon's main file",
      "Styles that ember-cli merges into the app",
    ]);
    expect(existsSync(join(dir, "index.js"))).toBe(true);
  });
});

describe("the type question", () => {
  it("stops when the selected type differs from the blueprint's", async () => {
    let dir = await fixture("addon-blueprint");

    expect(await unsupported(dir, "app")).toEqual(["A library from @ember/addon-blueprint"]);
  });
});

describe("formatFindings", () => {
  it("numbers the findings and shortens long lists", () => {
    let where = Array.from({ length: 10 }, (_, i) => `app/components/c${i}.hbs`);

    expect(
      formatFindings([
        { title: "Templates in .hbs files", where, action: "Convert them.\nThe build needs it." },
        { title: "Public assets", action: "Import them." },
      ]),
    ).toMatchInlineSnapshot(`
      "1. Templates in .hbs files
         - app/components/c0.hbs
         - app/components/c1.hbs
         - app/components/c2.hbs
         - app/components/c3.hbs
         - app/components/c4.hbs
         - app/components/c5.hbs
         - app/components/c6.hbs
         - app/components/c7.hbs
         - and 2 more
         Convert them.
         The build needs it.

      2. Public assets
         Import them."
    `);
  });
});

describe("the CLI", () => {
  it("lists what to change, and writes nothing", async () => {
    let dir = await fixture("app-blueprint", { "app/components/greeting.hbs": "Hello" });
    let args = [
      "--name",
      "my-vite-app",
      "--path",
      dir,
      "--replaceOrUpdate",
      "update",
      "--type",
      "app",
      "--layers",
      "qunit",
      "--packageManager",
      "pnpm",
      "--confirm",
      "yes",
    ];

    let result = await cli(args)
      .execaPromise.then((res) => res)
      .catch((error) => error);
    let output = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`);

    expect(result.exitCode).toBe(1);
    expect(output).toContain("ember.nvp cannot migrate this project yet");
    expect(output).toContain("app/components/greeting.hbs");
    expect(existsSync(join(dir, "ember-cli-build.mjs"))).toBe(true);
  });
});

/**
 * Projects from the older blueprints, cut down to the files that the migrations read.
 *
 * Each one follows what the blueprint generates:
 * - `@ember/addon-blueprint` 0.18
 * - `@ember/app-blueprint` 7.5
 * - `@ember-tooling/classic-build-app-blueprint` 7.5
 * - `@ember-tooling/classic-build-addon-blueprint` 7.5
 */

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

export const addonBlueprint: Record<string, string> = {
  "package.json": json({
    name: "my-addon",
    version: "0.0.0",
    keywords: ["ember-addon"],
    files: ["addon-main.cjs", "declarations", "dist", "src"],
    scripts: {
      build: "rollup --config",
      prepack: "rollup --config",
      start: "vite dev",
      test: "vite build --mode=development --out-dir dist-tests && testem --file testem.cjs ci --port 0",
    },
    dependencies: {
      "@embroider/addon-shim": "^1.8.9",
      "decorator-transforms": "^2.2.2",
    },
    devDependencies: {
      "@embroider/addon-dev": "^8.1.0",
      "@embroider/vite": "^1.1.5",
      "@glimmer/component": "^2.0.0",
      "@rollup/plugin-babel": "^6.0.4",
      "ember-source": "^6.7.0",
      "ember-strict-application-resolver": "^0.1.0",
      rollup: "^4.22.5",
      typescript: "~5.8.3",
    },
    "ember-addon": { version: 2, type: "addon", main: "addon-main.cjs" },
    exports: {
      ".": { types: "./declarations/index.d.ts", default: "./dist/index.js" },
      "./addon-main.js": "./addon-main.cjs",
      "./*": { types: "./declarations/*.d.ts", default: "./dist/*.js" },
    },
  }),
  "addon-main.cjs": `'use strict';

const { addonV1Shim } = require('@embroider/addon-shim');
module.exports = addonV1Shim(__dirname);
`,
  "rollup.config.mjs": `import { babel } from '@rollup/plugin-babel';
import { Addon } from '@embroider/addon-dev/rollup';

const addon = new Addon({ srcDir: 'src', destDir: 'dist' });

export default {
  output: addon.output(),
  plugins: [
    addon.publicEntrypoints(['**/*.js', 'index.js', 'template-registry.js']),
    addon.appReexports(['components/**/*.js', 'helpers/**/*.js', 'modifiers/**/*.js', 'services/**/*.js']),
    addon.dependencies(),
    babel({ extensions: ['.js', '.gjs', '.ts', '.gts'], babelHelpers: 'bundled', configFile: './babel.publish.config.cjs' }),
    addon.hbs(),
    addon.gjs(),
    addon.declarations('declarations', 'pnpm ember-tsc --declaration --project ./tsconfig.publish.json'),
    addon.keepAssets(['**/*.css']),
    addon.clean(),
  ],
};
`,
  "babel.config.cjs": `const { buildMacros } = require('@embroider/macros/babel');
const macros = buildMacros();

module.exports = {
  plugins: [
    ['@babel/plugin-transform-typescript', { allExtensions: true }],
    ['babel-plugin-ember-template-compilation', { transforms: [...macros.templateMacros] }],
    ['module:decorator-transforms', { runtime: { import: require.resolve('decorator-transforms/runtime-esm') } }],
    ...macros.babelMacros,
  ],
};
`,
  "babel.publish.config.cjs": `module.exports = {
  plugins: [
    ['@babel/plugin-transform-typescript', { allExtensions: true }],
    ['babel-plugin-ember-template-compilation', { targetFormat: 'hbs', transforms: [] }],
    ['module:decorator-transforms', { runtime: { import: 'decorator-transforms/runtime-esm' } }],
  ],
};
`,
  "tsconfig.json": json({
    extends: "@ember/app-tsconfig",
    include: ["src/**/*", "tests/**/*", "demo-app/**/*"],
    compilerOptions: { rootDir: ".", types: ["ember-source/types"] },
  }),
  "tsconfig.publish.json": json({
    extends: "@ember/library-tsconfig",
    include: ["./src/**/*"],
    compilerOptions: { allowJs: true, declarationDir: "declarations", rootDir: "./src" },
  }),
  "vite.config.mjs": `import { defineConfig } from 'vite';
import { ember } from '@embroider/vite';

export default defineConfig({ plugins: [ember()] });
`,
  "testem.cjs": `module.exports = {
  test_page: 'tests/index.html?hidepassed',
  cwd: 'dist-tests',
  launch_in_ci: ['Chrome'],
  browser_args: {
    Chrome: {
      ci: [
        process.env.CI ? '--no-sandbox' : null,
        '--headless=new',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900',
      ].filter(Boolean),
    },
  },
};
`,
  "tests/index.html": `<script type="module">import { start } from "./test-helper.js"; start();</script>\n`,
  "tests/test-helper.ts": `import EmberApp from 'ember-strict-application-resolver';\nexport function start() {}\n`,
  "index.html": `<script type="module">import { App } from './demo-app/app'; App.create({});</script>\n`,
  "demo-app/app.gts": `import EmberApp from 'ember-strict-application-resolver';
import EmberRouter from '@ember/routing/router';

class Router extends EmberRouter {}

export class App extends EmberApp {
  modules = { './router': Router };
}

Router.map(function () {});
`,
  "demo-app/templates/application.gts": `import { pageTitle } from 'ember-page-title';

const greeting = 'hello';

<template>
  {{pageTitle "Demo App"}}

  <h1>Welcome to ember!</h1>

  {{greeting}}, world!
</template>
`,
  "unpublished-development-types/index.d.ts": `// Add any types here that you need for local development only.\n`,
  "src/index.ts": `export {};\n`,
};

export const appBlueprint: Record<string, string> = {
  "package.json": json({
    name: "my-app",
    version: "0.0.0",
    private: true,
    exports: { "./tests/*": "./tests/*", "./*": "./app/*" },
    scripts: {
      build: "vite build",
      start: "vite",
      test: "vite build --mode development && testem ci --port 0",
    },
    devDependencies: {
      "@embroider/compat": "^4.1.25",
      "@embroider/core": "^4.6.7",
      "@embroider/legacy-inspector-support": "^0.1.3",
      "@embroider/vite": "^1.7.13",
      "@warp-drive/core": "~5.8.2",
      "@warp-drive/ember": "~5.8.2",
      "ember-cli": "~7.3.0",
      "ember-cli-deprecation-workflow": "^4.0.1",
      "ember-load-initializers": "^3.0.1",
      "ember-page-title": "^9.0.3",
      "ember-resolver": "^13.2.0",
      "ember-source": "~7.3.0",
      typescript: "^6.0.3",
    },
  }),
  "ember-cli-build.mjs": `import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmberApp from 'ember-cli/lib/broccoli/ember-app.js';
import { compatBuild } from '@embroider/compat';

export default async function (defaults) {
  const { setConfig } = await import('@warp-drive/core/build-config');
  const { buildOnce } = await import('@embroider/vite');

  const app = new EmberApp(defaults, {
    // Add options here
  });

  setConfig(app, dirname(fileURLToPath(import.meta.url)), {
    compatWith: '5.8',
  });

  return compatBuild(app, buildOnce);
}
`,
  "config/environment.js": `'use strict';

module.exports = function (environment) {
  const ENV = {
    modulePrefix: 'my-app',
    environment,
    rootURL: '/',
    locationType: 'history',
    EmberENV: { EXTEND_PROTOTYPES: false, FEATURES: {} },
    APP: {},
  };

  if (environment === 'test') {
    ENV.locationType = 'none';
    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;
  }

  return ENV;
};
`,
  "config/optional-features.json": json({
    "application-template-wrapper": false,
    "default-async-observers": true,
    "jquery-integration": false,
    "template-only-glimmer-components": true,
    "no-implicit-route-model": true,
  }),
  "babel.config.mjs": `import { babelCompatSupport, templateCompatSupport } from '@embroider/compat/babel';

export default {
  plugins: [
    ['@babel/plugin-transform-typescript', { allExtensions: true }],
    ['babel-plugin-ember-template-compilation', { transforms: [...templateCompatSupport()] }],
    ['module:decorator-transforms', { runtime: { import: 'decorator-transforms/runtime-esm' } }],
    ...babelCompatSupport(),
  ],
};
`,
  "vite.config.mjs": `import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

export default defineConfig({
  plugins: [classicEmberSupport(), ember(), babel({ babelHelpers: 'runtime', extensions })],
});
`,
  "index.html": `<!DOCTYPE html>
<html>
  <head>
    <title>MyApp</title>

    {{content-for "head"}}

    <link integrity="" rel="stylesheet" href="/@embroider/virtual/vendor.css">
    <link integrity="" rel="stylesheet" href="/@embroider/virtual/app.css">

    {{content-for "head-footer"}}
  </head>
  <body>
    {{content-for "body"}}

    <script src="/@embroider/virtual/vendor.js"></script>
    <script type="module">
      import Application from './app/app';
      import environment from './app/config/environment';

      Application.create(environment.APP);
    </script>

    {{content-for "body-footer"}}
  </body>
</html>
`,
  "app/app.ts": `import '@warp-drive/ember/install';
import Application from '@ember/application';
import compatModules from '@embroider/virtual/compat-modules';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'my-app/config/environment';
import { importSync, isDevelopingApp, macroCondition } from '@embroider/macros';
import setupInspector from '@embroider/legacy-inspector-support/ember-source-4.12';

if (macroCondition(isDevelopingApp())) {
  importSync('./deprecation-workflow');
}

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver.withModules(compatModules);
  inspector = setupInspector(this);
}

loadInitializers(App, config.modulePrefix, compatModules);
`,
  "app/config/environment.ts": `import loadConfigFromMeta from '@embroider/config-meta-loader';\n\nexport default loadConfigFromMeta('my-app');\n`,
  "app/router.ts": `import EmberRouter from '@embroider/router';
import config from 'my-app/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {});
`,
  "app/deprecation-workflow.ts": `import setupDeprecationWorkflow from 'ember-cli-deprecation-workflow';\n\nsetupDeprecationWorkflow({ workflow: [] });\n`,
  "app/styles/app.css": "",
  "app/templates/application.gts": `import { pageTitle } from 'ember-page-title';\n\n<template>{{pageTitle "MyApp"}}{{outlet}}</template>\n`,
  "testem.cjs": `module.exports = { test_page: 'tests/index.html?hidepassed', cwd: 'dist' };\n`,
  "tests/index.html": `{{content-for "test-head"}}\n`,
  "tests/test-helper.ts": `import Application from 'my-app/app';
import config from 'my-app/config/environment';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start as qunitStart } from 'ember-qunit';

export function start() {
  setApplication(Application.create(config.APP));
  setup(QUnit.assert);
  qunitStart();
}
`,
  "tsconfig.json": json({
    extends: "@ember/app-tsconfig",
    include: ["app", "tests", "types"],
    compilerOptions: { allowJs: true, types: ["ember-source/types", "@embroider/core/virtual"] },
  }),
};

export const classicApp: Record<string, string> = {
  "package.json": json({
    name: "my-classic-app",
    version: "0.0.0",
    private: true,
    scripts: {
      build: "ember build --environment=production",
      start: "ember serve",
      "test:ember": "ember test",
    },
    devDependencies: {
      "@tsconfig/ember": "^3.0.12",
      "ember-cli": "~7.5.0-alpha.1",
      "ember-cli-app-version": "^7.0.0",
      "ember-cli-babel": "^8.3.2",
      "ember-cli-htmlbars": "^7.0.1",
      "ember-load-initializers": "^3.0.1",
      "ember-page-title": "^9.0.3",
      "ember-resolver": "^13.2.0",
      "ember-source": "~7.3.0",
      "loader.js": "^4.7.0",
      typescript: "^5.9.3",
    },
  }),
  "ember-cli-build.js": `'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  const app = new EmberApp(defaults, {
    'ember-cli-babel': { enableTypeScriptTransform: true },
  });

  return app.toTree();
};
`,
  "config/environment.js": appBlueprint["config/environment.js"]!.replace(
    "my-app",
    "my-classic-app",
  ),
  "app/index.html": `<!DOCTYPE html>
<html>
  <head>
    <title>MyClassicApp</title>

    {{content-for "head"}}

    <link integrity="" rel="stylesheet" href="{{rootURL}}assets/vendor.css">
    <link integrity="" rel="stylesheet" href="{{rootURL}}assets/my-classic-app.css">
    <link rel="icon" href="{{rootURL}}assets/favicon.png">

    {{content-for "head-footer"}}
  </head>
  <body>
    {{content-for "body"}}

    <script src="{{rootURL}}assets/vendor.js"></script>
    <script src="{{rootURL}}assets/my-classic-app.js"></script>

    {{content-for "body-footer"}}
  </body>
</html>
`,
  "app/app.ts": `import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'my-classic-app/config/environment';

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
`,
  "app/router.ts": appBlueprint["app/router.ts"]!.replace("my-app", "my-classic-app"),
  "app/styles/app.css": "",
  "app/templates/application.gts": `<template>{{outlet}}</template>\n`,
  "tsconfig.json": json({
    extends: "@tsconfig/ember",
    glint: { environment: ["ember-loose", "ember-template-imports"] },
    compilerOptions: {
      baseUrl: ".",
      paths: { "my-classic-app/*": ["app/*"], "*": ["types/*"] },
      types: ["ember-source/types"],
    },
  }),
  "types/global.d.ts": `import '@glint/environment-ember-loose';\n`,
  "testem.js": `'use strict';

module.exports = {
  test_page: 'tests/index.html?hidepassed',
  launch_in_ci: ['Chrome'],
  browser_args: {
    Chrome: {
      ci: [
        process.env.CI ? '--no-sandbox' : null,
        '--headless',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--remote-debugging-port=0',
        '--window-size=1440,900',
      ].filter(Boolean),
    },
  },
};
`,
  "tests/index.html": `{{content-for "test-head"}}\n`,
  "tests/test-helper.ts": appBlueprint["tests/test-helper.ts"]!.replaceAll(
    "my-app",
    "my-classic-app",
  ),
};

export const classicAddon: Record<string, string> = {
  "package.json": json({
    name: "my-classic-addon",
    version: "0.0.0",
    keywords: ["ember-addon"],
    scripts: {
      build: "ember build --environment=production",
      start: "ember serve",
      "test:ember": "ember test",
      "test:ember-compatibility": "ember try:each",
    },
    dependencies: {
      "ember-cli-babel": "^8.3.2",
      "ember-cli-htmlbars": "^7.0.1",
      "ember-template-imports": "^4.4.0",
    },
    devDependencies: {
      "ember-cli": "~7.5.0-alpha.1",
      "ember-qunit": "^9.1.0",
      "ember-source": "~7.3.0",
    },
    peerDependencies: { "ember-source": ">= 4.0.0" },
    "ember-addon": { configPath: "tests/dummy/config" },
  }),
  "index.js": `'use strict';\n\nmodule.exports = {\n  name: require('./package').name,\n};\n`,
  "ember-cli-build.js": `'use strict';

const EmberAddon = require('ember-cli/lib/broccoli/ember-addon');

module.exports = function (defaults) {
  return new EmberAddon(defaults, {}).toTree();
};
`,
  ".npmignore": "/tests/\n",
  ".prettierrc.js": `'use strict';\n\nmodule.exports = { singleQuote: true };\n`,
  "testem.js": classicApp["testem.js"]!,
  "addon/.gitkeep": "",
  "app/.gitkeep": "",
  "tests/dummy/app/app.js": `import Application from '@ember/application';\n\nexport default class App extends Application {}\n`,
  "tests/dummy/app/router.js": `import EmberRouter from '@ember/routing/router';\n\nexport default class Router extends EmberRouter {}\n\nRouter.map(function () {});\n`,
  "tests/dummy/app/templates/application.gjs": `import pageTitle from 'ember-page-title/helpers/page-title';

<template>
  {{pageTitle "Dummy"}}

  <h2 id="title">Welcome to Ember</h2>

  {{outlet}}
</template>
`,
  "tests/dummy/config/environment.js": appBlueprint["config/environment.js"]!.replace(
    "my-app",
    "dummy",
  ),
  "tests/index.html": `{{content-for "test-head"}}\n`,
  "tests/test-helper.js": `import Application from 'dummy/app';\nexport function start() {}\n`,
};

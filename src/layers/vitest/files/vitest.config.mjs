import { babel } from "@rollup/plugin-babel";
import { buildMacros } from "@embroider/macros/babel";
import { webdriverio } from "@vitest/browser-webdriverio";
import { ember, extensions } from "@embroider/vite";
import { defineConfig } from "vitest/config";

const macros = buildMacros();

export default defineConfig({
  plugins: [
    ember(),
    babel({
      babelHelpers: "inline",
      extensions,
      babelrc: false,
      configFile: false,
      plugins: [
        [
          "@babel/plugin-transform-typescript",
          {
            allExtensions: true,
            onlyRemoveTypeImports: true,
            allowDeclareFields: true,
          },
        ],
        [
          "babel-plugin-ember-template-compilation",
          {
            transforms: [...macros.templateMacros],
          },
        ],
        [
          "module:decorator-transforms",
          {
            runtime: {
              import: "decorator-transforms/runtime-esm",
            },
          },
        ],
        ...macros.babelMacros,
      ],
    }),
  ],
  optimizeDeps: {
    include: [
      "@glimmer/component",
      "@ember/test-helpers",
      "ember-strict-application-resolver",
      "ember-source/@ember/component/index.js",
      "ember-source/@ember/service/index.js",
      "ember-source/@ember/template-factory/index.js",
      "ember-source/@ember/component/template-only.js",
      "ember-source/@glimmer/tracking/index.js",
    ],
  },
  test: {
    include: ["tests/**/*-test.{js,ts,gjs,gts}"],
    maxConcurrency: 1,
    browser: {
      provider: webdriverio(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chrome" }],
    },
  },
});

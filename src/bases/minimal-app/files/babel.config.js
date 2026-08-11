import { buildMacros } from "@embroider/macros/babel";

const isProduction = process.env.NODE_ENV === "production";

const macros = buildMacros({
  configure(config) {
    if (process.env.EMBER_ENV === "test") {
      config.enableRuntimeMode();
    }
  },
});

export default {
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
          import: import.meta.resolve("decorator-transforms/runtime-esm"),
        },
      },
    ],
    [
      "@babel/plugin-transform-runtime",
      {
        absoluteRuntime: import.meta.dirname,
        useESModules: true,
        regenerator: false,
      },
    ],
    [
      "babel-plugin-debug-macros",
      {
        flags: [
          {
            source: "@glimmer/env",
            flags: { DEBUG: !isProduction, CI: !!process.env.CI },
          },
        ],
        debugTools: {
          isDebug: !isProduction,
          source: "@ember/debug",
          assertPredicateIndex: 1,
        },
        externalizeHelpers: {
          module: "@ember/debug",
        },
      },
      "@ember/debug stripping",
    ],
    ...macros.babelMacros,
  ],

  generatorOpts: {
    compact: false,
  },
};

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
        // Publish `precompileTemplate` calls, not wire format: the wire
        // format is private between the template compiler and the glimmer
        // runtime of the same version, so the consuming app must perform
        // the final compilation.
        targetFormat: "hbs",
      },
    ],
    [
      "module:decorator-transforms",
      {
        runtime: {
          // A bare specifier (not import.meta.resolve): the consuming app
          // resolves it via this library's `decorator-transforms` dependency.
          import: "decorator-transforms/runtime-esm",
        },
      },
    ],
  ],

  generatorOpts: {
    compact: false,
  },
};

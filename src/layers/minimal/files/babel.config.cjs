const { buildMacros } = require('@embroider/macros/babel');

const macros = buildMacros();

module.exports = {
  plugins: [
    '@babel/plugin-transform-typescript',
    macros.babelPluginDefineMacros(),
  ],
};

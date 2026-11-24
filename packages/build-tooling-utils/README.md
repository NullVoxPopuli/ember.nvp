# `@nullvoxpopuli/ember-build-tooling-utils`

Shared build tooling for the `@nullvoxpopuli` ember meta-plugins
([`@nullvoxpopuli/ember-vite`](../vite) and
[`@nullvoxpopuli/ember-rolldown`](../rolldown)).

It takes `rolldown` as a peer dependency, and works in vite and in rolldown.

Requires node 24+. This package ships TypeScript source, so type-checking
needs TypeScript 6+ with `lib` covering `es2025` (for example `esnext`).

## Exports

### `maybeBabel(options?)`

A babel plugin that runs **only** on the files that need babel:

- template-tag files (`.gts`/`.gjs`)
- files importing template/macro modules (`@ember/template-compiler`,
  `@embroider/macros`, …)
- local (non-`node_modules`) code using decorators

Everything else uses the bundler's native (oxc) transform, which keeps the
build fast.

It runs [`@rolldown/plugin-babel`](https://npmx.dev/package/@rolldown/plugin-babel).

`options` takes babel's options, plus:

- `configFile`: the babel config file to use, or `false` for none.
- `parallel`: run babel in worker threads.
  It applies only when every option can go to a worker thread:
  a config file, and plugins given by name.
- `filter.include` (`imports` / `code` / `ids`) to opt additional files in.

Babel helpers are inlined into each file,
unless the babel config adds `@babel/plugin-transform-runtime`.

### `extensions`

The list of file extensions ember source can be authored in. Mirrors
embroider's list.

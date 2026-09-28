# `@nullvoxpopuli/ember-build-tooling-utils`

Shared build tooling for the `@nullvoxpopuli` ember meta-plugins
([`@nullvoxpopuli/ember-vite`](../vite) and
[`@nullvoxpopuli/ember-rolldown`](../rolldown)).

It has no `vite` or `rolldown` dependency, so both meta-plugins can use it.

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

`options` extends `@rollup/plugin-babel`'s options, plus a `filter.include`
(`imports` / `code`) to opt additional files in.

### `extensions`

The list of file extensions ember source can be authored in. Mirrors
embroider's list.

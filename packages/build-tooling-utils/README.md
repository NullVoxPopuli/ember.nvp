# `@nullvoxpopuli/ember-build-tooling-utils`

Shared build tooling for the `@nullvoxpopuli` ember meta-plugins
([`@nullvoxpopuli/ember-vite`](../vite) and
[`@nullvoxpopuli/ember-rolldown`](../rolldown)).

It's intentionally bundler-agnostic (no `vite`/`rolldown` dependency) so both
meta-plugins can consume the same logic.

Requires node 24+, and — since this package ships TypeScript source — a
modern TypeScript when type-checking: 6+ with `lib` covering `es2025` (e.g.
`esnext`).

`@babel/core` is a peer dependency (`^7.28.10 || ^8.0.0`) rather than a
dependency: it's the core that ends up executing the consuming project's babel
config, so it has to be the same major as the plugins that config names. Babel
refuses to load a v7 plugin into a v8 core (and vice versa), so a copy pinned
here would break every project on the other major.

## Exports

### `maybeBabel(options?)`

A babel plugin (`@rollup/plugin-babel`) wrapped in a
[`@rolldown/pluginutils`](https://github.com/rolldown/rolldown) filter so babel
runs **only** on files that actually need it:

- template-tag files (`.gts`/`.gjs`)
- files importing template/macro modules (`@ember/template-compiler`,
  `@embroider/macros`, …)
- local (non-`node_modules`) code using decorators

Everything else skips babel and is handled by the bundler's native (oxc)
transform. The point: don't buy rolldown/oxc speed and then give it all back by
routing every module through babel.

`options` extends `@rollup/plugin-babel`'s options, plus a `filter.include`
(`imports` / `code`) to opt additional files in.

### `extensions`

The list of file extensions ember source can be authored in. Mirrors
embroider's canonical list (see `extensions.ts` for details).

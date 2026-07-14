# `@nullvoxpopuli/ember-rolldown`

A batteries-included meta-plugin for building Ember v2 libraries (addons) with
[rolldown](https://rolldown.rs/) — or [tsdown](https://tsdown.dev/), which is
built on top of rolldown and also emits `.d.ts` files.

It compiles `.gts`/`.gjs` and template-tag (`<template>`) source into
publishable output, so a single `ember()` call replaces the usual stack of
`@embroider/*` externals handling, content-tag preprocessing, and babel wiring.

## Install

```bash
npm add --save-dev @nullvoxpopuli/ember-rolldown
```

Requires node 24+

## Usage

In your `tsdown.config.js` (recommended — emits declarations):

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  sourcemap: true,
  clean: true,
  dts: true,
  plugins: [ember()],
});
```

Or in a plain `rolldown.config.js`:

```js
import { defineConfig } from "rolldown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  input: ["src/index.ts"],
  plugins: [ember()],
});
```

You still need a `babel.config.js` for template compilation, decorators, and
type stripping. `ember()` runs it for you.

## What `ember()` does

`ember()` returns an array of rolldown plugins:

- **`emberExternals()`** — keeps your `dependencies`, `peerDependencies`, and
  the ember virtual packages (e.g. `@ember/component`, `@glimmer/tracking`, the
  template compiler) external, so the consuming app resolves them.
- **`emberTransform()`** — preprocesses `<template>` via
  [content-tag](https://github.com/embroider-build/content-tag) and maps
  `.gts`/`.gjs` to `.ts`/`.js` so rolldown understands them. Also rewrites
  `.gts` specifiers in emitted `.d.ts` files.
- **`emberBabel()`** — runs your `babel.config.js` with
  `babelHelpers: "bundled"`.

## Configuration

```ts
ember({
  babel: {
    // defaults to ./babel.config.js in the cwd
    configFile: "./babel.config.js",
    // defaults to "bundled" -- correct for libraries
    babelHelpers: "bundled",
  },
});
```

## Credit

The `emberExternals` and `emberTransform` plugins are derived from
[embroider-build/embroider#2658](https://github.com/embroider-build/embroider/pull/2658).

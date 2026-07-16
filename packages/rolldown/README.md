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

Requires node 24+, and — since these packages ship TypeScript source — a
modern TypeScript when type-checking: 6+ with `lib` covering `es2025` (e.g.
`esnext`).

## Usage

In your `tsdown.config.js` (recommended — emits declarations):

```js
import { defineConfig, ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  plugins: [ember()],
});
```

This builds your entry to `dist/*.js` and `dist/*.d.ts` with sourcemaps,
cleaning `dist/` between builds and leaving the ember virtual packages to the
consuming app. You choose the `entry` and `plugins`; any tsdown option you
pass wins.

Or in a plain `rolldown.config.js`:

```js
import { defineConfig } from "rolldown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  input: ["src/index.ts"],
  plugins: [ember()],
});
```

A `babel.config.js` is optional. Without one, `ember()` compiles templates
(to `precompileTemplate`), decorators (via
[decorator-transforms](https://github.com/ef4/decorator-transforms)), and
TypeScript; with one, your config runs instead.

### Declarations

Declarations are emitted with isolated declarations — the only declaration
pipeline that can see `<template>` (`.gts`/`.gjs`) modules, which exist only
inside the bundler's module graph. Your `tsconfig.json` must enable it
(`ember()` errors otherwise):

```jsonc
{
  "compilerOptions": {
    "isolatedDeclarations": true,
  },
}
```

Isolated declarations means every exported value carries an explicit type
annotation. For template-only components:

```gts
import type { TOC } from "@ember/component/template-only";

export const Badge: TOC<BadgeSignature> = <template>...</template>;
```

## What `ember()` does

`ember()` returns an array of rolldown plugins:

- **`emberIsolatedDeclarations()`** — errors when a `tsconfig.json` is present
  without `isolatedDeclarations: true`.
- **`emberExternals()`** — keeps your `dependencies`, `peerDependencies`, and
  the ember virtual packages (e.g. `@ember/component`, `@glimmer/tracking`, the
  template compiler) external, so the consuming app resolves them.
- **`emberTransform()`** — preprocesses `<template>` via
  [content-tag](https://github.com/embroider-build/content-tag) and maps
  `.gts`/`.gjs` to `.ts`/`.js` so rolldown understands them. Also rewrites
  `.gts` specifiers in emitted `.d.ts` files.
- **`emberBabel()`** — runs babel with `babelHelpers: "bundled"`, but only on
  the files that actually need it (template-tag, decorators, template imports);
  everything else stays on rolldown's fast native (oxc) transform.

## Configuration

```ts
ember({
  babel: {
    configFile: "./babel.config.js",
    babelHelpers: "bundled",
    plugins: [],
    filter: { include: { imports: ["ember-concurrency"], code: [] } },
  },
});
```

Each option is documented on `BabelOptions`.

## Credit

The `emberExternals` and `emberTransform` plugins are derived from
[embroider-build/embroider#2658](https://github.com/embroider-build/embroider/pull/2658).

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

Import `defineConfig` from the bundler you're using — `tsdown` or `rolldown` —
so it carries that tool's own config types; `@nullvoxpopuli/ember-rolldown`
provides `ember()` (the defaults travel with the plugin, not `defineConfig`).

In your `tsdown.config.js` (recommended — emits declarations):

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

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

## App re-exports

For libraries whose modules must appear in the consuming app's namespace
(classic resolution: `{{a-component}}`, services and helpers looked up by
name), `appReexports()` does the same job as `@embroider/addon-dev`'s
`appReexports` rollup plugin. It's a separate import because most libraries
don't need it:

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";
import { appReexports } from "@nullvoxpopuli/ember-rolldown/app-reexports";

export default defineConfig({
  entry: ["./src/index.ts", "./src/components/**/*.gts"],
  plugins: [ember(), appReexports({ include: ["components/**"] })],
});
```

For every built file matching `include` (minus `exclude` and `.d.ts` files),
it writes a module under `dist/_app_/` re-exporting from the library's own
name, and records the set in `package.json` under `ember-addon.app-js`.
`mapFilename` renames a re-export; `exports` picks which bindings it forwards
(default `["default"]`).

Unlike the embroider plugin, nothing is written unless its content actually
differs from what is on disk — `_app_/` modules are compared byte-for-byte
and `package.json` is only rewritten when the `app-js` map itself changed —
so rebuilds don't re-trigger file watchers.

## Credit

The `emberExternals` and `emberTransform` plugins are derived from
[embroider-build/embroider#2658](https://github.com/embroider-build/embroider/pull/2658).

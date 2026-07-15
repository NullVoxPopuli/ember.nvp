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

A `babel.config.js` is optional: if your project has one, `ember()` uses it;
otherwise a built-in default config applies (TypeScript stripping, template
compilation to `precompileTemplate`, and
[decorator-transforms](https://github.com/ef4/decorator-transforms)).

### Declarations (`dts: true`)

Declarations are emitted with oxc's isolated declarations — it is the only
declaration pipeline that can see compiled `<template>` (`.gts`/`.gjs`)
modules, which exist only inside the bundler's module graph (the `tsc`-based
pipeline reads from disk and cannot). This is required: `ember()` errors when
a `tsconfig.json` is present without it. Set it in your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "isolatedDeclarations": true,
  },
}
```

The practical rule isolated declarations imposes: every exported value needs
an explicit type annotation. In particular, exported template-only components:

```gts
import type { TOC } from "@ember/component/template-only";

export const Badge: TOC<BadgeSignature> = <template>...</template>;
```

## What `ember()` does

`ember()` returns an array of rolldown plugins:

- **`emberIsolatedDeclarations()`** — errors when a `tsconfig.json` is present
  without `isolatedDeclarations: true` (see above).
- **`emberExternals()`** — keeps your `dependencies`, `peerDependencies`, and
  the ember virtual packages (e.g. `@ember/component`, `@glimmer/tracking`, the
  template compiler) external, so the consuming app resolves them.
- **`emberTransform()`** — preprocesses `<template>` via
  [content-tag](https://github.com/embroider-build/content-tag) and maps
  `.gts`/`.gjs` to `.ts`/`.js` so rolldown understands them. Also rewrites
  `.gts` specifiers in emitted `.d.ts` files.
- **`emberBabel()`** — runs babel with `babelHelpers: "bundled"`, but only on
  the files that actually need it (template-tag, decorators, template imports);
  everything else stays on rolldown's fast native (oxc) transform. Uses your
  `babel.config.js` when present, the built-in defaults otherwise.

## Configuration

```ts
ember({
  babel: {
    // undefined (default): auto-detect babel.config.{js,mjs,cjs,json};
    // a string: use that file; false: always use the built-in defaults
    configFile: "./babel.config.js",
    // defaults to "bundled" -- correct for libraries
    babelHelpers: "bundled",
    // extra babel plugins, appended after the config's plugins
    plugins: [],
    // opt additional files into babel (see maybeBabel's filter)
    filter: { include: { imports: ["ember-concurrency"], code: [] } },
  },
});
```

## Credit

The `emberExternals` and `emberTransform` plugins are derived from
[embroider-build/embroider#2658](https://github.com/embroider-build/embroider/pull/2658).

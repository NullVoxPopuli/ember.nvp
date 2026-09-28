# `@nullvoxpopuli/ember-rolldown`

A batteries-included meta-plugin for building Ember v2 libraries (addons) with
[rolldown](https://rolldown.rs/), or with [tsdown](https://tsdown.dev/), which
is built on top of rolldown and also emits `.d.ts` files.

It compiles `.gts` / `.gjs` and template-tag (`<template>`) source into
publishable output. A single `ember()` call replaces the usual stack of
`@embroider/*` externals handling, content-tag preprocessing, and babel wiring.

## Install

```bash
npm add --save-dev @nullvoxpopuli/ember-rolldown
```

Requires node 24+.

These packages ship TypeScript source, so type-checking needs a modern
TypeScript: 6+ with `lib` covering `es2025` (e.g. `esnext`).

## Usage

Import `defineConfig` from the bundler you use, `tsdown` or `rolldown`, so it
carries that tool's own config types. `@nullvoxpopuli/ember-rolldown` provides
`ember()`. The defaults travel with the plugin, not with `defineConfig`.

In your `tsdown.config.js` (recommended, because it emits declarations):

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  plugins: [ember()],
});
```

This builds your entry to `dist/*.js` and `dist/*.d.ts` with sourcemaps. It
cleans `dist/` between builds and leaves the ember virtual packages to the
consuming app. You choose the `entry` and `plugins`. Any tsdown option you pass
wins.

Or in a plain `rolldown.config.js`:

```js
import { defineConfig } from "rolldown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  input: ["src/index.ts"],
  plugins: [ember()],
});
```

A babel config is optional. Without one, `ember()` compiles templates (to
`precompileTemplate`), decorators (via
[decorator-transforms](https://github.com/ef4/decorator-transforms)), and
TypeScript. With one, your config runs instead. A `babel.publish.config.*` is
preferred over a `babel.config.*`. See
[Publish vs. development babel config](#publish-vs-development-babel-config).

### Entrypoints

Entries may be any extension: `.ts`, `.js`, `.gts`, `.gjs`.

```js
export default defineConfig({
  entry: ["./src/index.ts", "./src/components/menu.gts"],
  plugins: [ember()],
});
```

Whatever the source extension, the emitted `.js` and `.d.ts` paths mirror the
entry paths. The example emits `dist/index.js` + `dist/index.d.ts` and
`dist/components/menu.js` + `dist/components/menu.d.ts`.

Type imports resolve against those emitted paths. So your entries, together
with your `exports` map, _are_ your public API. A module that isn't an entry has
no stable `dist/` path of its own. It is only reachable through the entrypoints
that re-export it.

### Declarations

Declarations are emitted with isolated declarations. That is the only
declaration pipeline that can see `<template>` (`.gts` / `.gjs`) modules, which
exist only inside the bundler's module graph. The tsconfig your build uses must
enable it. `ember()` errors otherwise.

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

#### Keeping the constraint off dev-only code

`isolatedDeclarations` is a constraint on how _published_ code is written, so it
must cover only the code you emit declarations for.

If your package also holds dev-only code (a demo app, in-package tests), putting
the flag on the single `tsconfig.json` that covers everything would force
explicit annotations on demo components and test helpers that never get a
`.d.ts`.

The tsconfig `ember()` checks is the one
[tsdown's `tsconfig` option](https://tsdown.dev/options/tsconfig) points at. So
point the build at a publish-only config, and leave `tsconfig.json` alone for
editors and `tsc --noEmit`:

```js
// tsdown.config.js
export default defineConfig({
  entry: ["./src/index.ts"],
  // include: ["src/**/*"], isolatedDeclarations: true
  tsconfig: "./tsconfig.publish.json",
  plugins: [ember()],
});
```

Any path works, so the publish config can live wherever you keep build
configuration: `tsconfig: "./config/tsconfig.publish.json"`. A directory works
too: `tsconfig: "./config"` picks up `config/tsconfig.json`.

`tsconfig: false` is rejected while declarations are on. With no tsconfig there
is no `isolatedDeclarations`, and the fallback pipeline can't see compiled
`.gts`, so it would fail later with "Source file not found". Set `dts: false`
alongside it if the library ships no types.

A tsconfig's relative paths resolve against the file itself. So a config kept in
`config/` wants `"include": ["../src/**/*"]` and `"rootDir": "../src"`. The build
won't tell you if you get that wrong, because tsdown drives declaration emit
from `entry`, not from the tsconfig's `include`. `tsc` / `ember-tsc` and your
editor will tell you, if you ever point them at that config.

The tradeoff: isolated-declaration errors in `src` then surface when you build,
rather than in your editor, since the editor uses `tsconfig.json`. Run the build
(or `tsc --noEmit -p tsconfig.publish.json`) in CI so nothing lands unchecked.

## CSS

Components that import co-located CSS (`import './popup.css'`) need
[`@tsdown/css`](https://www.npmjs.com/package/@tsdown/css) installed in your
library. tsdown auto-detects it and bundles every imported stylesheet into a
single CSS file in `dist/`. Install the version matching your `tsdown` version.
They are released in lockstep.

```bash
npm add --save-dev @tsdown/css
```

Without it, tsdown's css-guard fails the build on the first CSS import. Because
the importing component module never loads, any declaration that references
that component dangles. That surfaces as misleading `UNLOADABLE_DEPENDENCY`
errors on `<component>.d.ts` files.

### ember-scoped-css

[ember-scoped-css](https://github.com/auditboard/ember-scoped-css) works with
this pipeline. Its template transform rides along via `ember()`'s
`babel.templateTransforms` option. Its unplugin (`ember-scoped-css/rollup`)
resolves the scoped CSS requests the transform injects:

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";
import { scopedCSS } from "ember-scoped-css/rollup";
import { scopedCSS as scopedCssBabel } from "ember-scoped-css/babel";

export default defineConfig({
  entry: ["./src/index.ts"],
  css: { inject: true },
  plugins: [
    ember({
      babel: {
        plugins: [scopedCssBabel()],
        templateTransforms: [scopedCssBabel.template({})],
      },
    }),
    scopedCSS(),
  ],
});
```

This scopes co-located `.css` files, inline `<style scoped>` blocks, and the
`scopedClass` pseudo-helper. That last one is what the `babel.plugins` entry
handles. Leave it off if you don't use `scopedClass` in module code.

`css.inject` matters for libraries. It keeps the `import "./style.css"`
statement in `dist/index.js`, so consuming apps pull the styles in through the
module graph. Without it, the bundled CSS is emitted but nothing loads it.

## What `ember()` does

`ember()` returns an array of rolldown plugins:

- **`emberIsolatedDeclarations()`** errors when the tsconfig the build uses
  (tsdown's `tsconfig` option, defaulting to `tsconfig.json`) is present without
  `isolatedDeclarations: true`.
- **`emberExternals()`** keeps your `dependencies`, `peerDependencies`, and the
  ember virtual packages (e.g. `@ember/component`, `@glimmer/tracking`, the
  template compiler) external, so the consuming app resolves them.
- **`emberBundle()`** replaces `emberExternals()` in bundle mode. It makes the
  ember virtual packages resolvable, so they can be bundled.
- **`emberTransform()`** preprocesses `<template>` via
  [content-tag](https://github.com/embroider-build/content-tag) and maps
  `.gts` / `.gjs` to `.ts` / `.js` so rolldown understands them. It also
  rewrites `.gts` specifiers in emitted `.d.ts` files.
- **`emberBabel()`** runs babel with `babelHelpers: "bundled"`, but only on the
  files that need it (template-tag, decorators, template imports). Everything
  else stays on rolldown's fast native (oxc) transform. It uses your
  `babel.publish.config.*` (root or `config/`) in preference to your
  `babel.config.*`.

## Configuration

```ts
ember({
  bundle: false,
  babel: {
    configFile: "./babel.config.js",
    babelHelpers: "bundled",
    plugins: [],
    templateTransforms: [],
    filter: { include: { imports: ["ember-concurrency"], code: [] } },
  },
});
```

Each option is documented on `BabelOptions`.

`templateTransforms` feeds template AST transforms to the default
template-compilation step. It can't be combined with a babel config file. A
config lists `babel-plugin-ember-template-compilation` itself, so its
transforms belong there.

### Bundle mode

`bundle: true` builds a self-contained package instead of a library: something
that runs on any page, such as a custom element.

```js
export default defineConfig({
  entry: ["./src/index.ts", "./src/register.ts"],
  plugins: [ember({ bundle: true })],
});
```

The output contains ember and every other dependency, with templates already
compiled. Declarations are bundled the same way.

The production build of ember is bundled. To bundle the development build
(assertions and deprecation messages), add the `development` condition:

```js
export default defineConfig({
  entry: ["./src/index.ts", "./src/register.ts"],
  plugins: [ember({ bundle: true })],
  inputOptions: { resolve: { conditionNames: ["development"] } },
});
```

Bundle mode applies to the built-in babel defaults. With your own babel config
file, set `targetFormat: "wire"` on `babel-plugin-ember-template-compilation`
yourself.

Do not combine bundle mode with tsdown's `unbundle` option.

### Publish vs. development babel config

A library's plain `babel.config.*` is usually its _development_ config. It
compiles `@embroider/macros` away, targets the wire format, and wires up
whatever the in-package demo app or test suite needs.

None of that belongs in a published artifact. Macros must survive for the
consuming app to evaluate. The wire format is private between one template
compiler and one glimmer runtime of the same version.

Babel's own resolution can't tell those apart, so `ember()` looks for a config
named for publishing first. With no explicit `configFile`, detection is:

1. `babel.publish.config.{mjs,cjs,js,mts,cts,ts,json}` in the package root
2. the same names in `config/`
3. otherwise babel's own resolution (`babel.config.*`, honoring `rootMode`)
4. otherwise no config file. Templates, decorators and TypeScript are still
   handled by the built-in defaults.

So a library that keeps both configs needs no `babel` option at all:

```
my-addon/
  babel.config.mjs          # dev: macros compiled, wire format, test-app wiring
  babel.publish.config.mjs  # what ember() uses
```

...and so does one that keeps build configuration out of its root:

```
my-addon/
  babel.config.mjs
  config/
    babel.publish.config.mjs  # what ember() uses
    tsconfig.publish.json     # see above
```

Set `configFile` explicitly to override that. `configFile: false` ignores
config files entirely. That is what you want when your publish config would
only restate the built-in defaults.

## App re-exports

Some libraries need their modules to appear in the consuming app's namespace
for classic resolution: `{{a-component}}`, services and helpers looked up by
name. For those, `appReexports()` does the same job as `@embroider/addon-dev`'s
`appReexports` rollup plugin. It's a separate import because most libraries
don't need it:

```js
import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";
import { appReexports } from "@nullvoxpopuli/ember-rolldown/app-reexports";

export default defineConfig({
  entry: ["./src/index.ts", "./src/services/session.ts"],
  plugins: [ember(), appReexports()],
});
```

With no arguments, top-level services (`services/*`) are re-exported. Under
strict mode, components and helpers are imported, but services are still
injected by name.

A string or array of strings is the include glob(s), optionally followed by the
remaining options. An object gives full control:

```js
appReexports(); // services/*
appReexports("components/**"); // one include glob
appReexports(["services/*", "helpers/*"]);
appReexports("components/**", { exclude: ["components/-private/**"] });
appReexports({ include: ["services/*", "helpers/*"], exclude: [...] });
```

For every built file matching `include` (minus `exclude` and `.d.ts` files), it
writes a module under `dist/_app_/` re-exporting from the library's own name,
and records the set in `package.json` under `ember-addon.app-js`.
`mapFilename` renames a re-export. `exports` picks which bindings it forwards
(default `["default"]`).

Nothing is written unless its content differs from what is on disk, so rebuilds
don't re-trigger file watchers.

## Credit

The `emberExternals` and `emberTransform` plugins are derived from
[embroider-build/embroider#2658](https://github.com/embroider-build/embroider/pull/2658).

# `@nullvoxpopuli/ember-vite`

A speed-optimized default meta-config for ember projects.

## Install

```bash
npm add @nullvoxpopuli/ember-vite
```

Requires node 24+, and — since these packages ship TypeScript source — a
modern TypeScript when type-checking: 6+ with `lib` covering `es2025` (e.g.
`esnext`).

## Usage

in your vite config

```js
import { defineConfig } from "vite";
import { ember } from "@nullvoxpopuli/ember-vite";

export default defineConfig({
  plugins: [
    ember(),
  ],
}
```

And remove any plugins from embroider or babel.
Then delete from your package.json: `@rollup/plugin-babel`, `@embroider/core`, `@embroider/vite`.

> [!NOTE]
> babel related deps are still needed for linting, so don't delete those

## Requirements

- `type=module` in your ember app
- babel config must be named `babel.config.js`
- `@embroider/vite` is up to date~ish

## Configuration

The `ember()` plugin takes the following options:

```ts
ember({
  // optional production configs
  production: {
    // optional configuration of codeSplitting.groups
    // in the vite config.
    //
    // Docs here:
    // https://rolldown.rs/reference/OutputOptions.codeSplitting#groups
    codeSplittingGroups: [
      /* ... */
    ],
  },
  // optional babel config
  babel: {
    // defaults to true.
    // when babel runs, do so in parallel across many cores.
    parallel: false,
    // optional way to configure when babel is activateed.
    // by default, all transforming is oxc, except when babel is needed
    // (for things not currently implemented in oxc)
    include: {
      // if a file imports from anything in this array, use babel instead of
      // oxc for that file.
      //
      // For example: ['ember-concurrency', 'ember-intl/format-message'],
      whenImporting: [
        /* ... */
      ],
    },
  },
});
```

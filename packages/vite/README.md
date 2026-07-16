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
  production: {
    codeSplittingGroups: [
      /* https://rolldown.rs/reference/OutputOptions.codeSplitting#groups */
    ],
  },
  babel: {
    parallel: false,
    include: {
      whenImporting: ["ember-concurrency", "ember-intl/format-message"],
    },
  },
});
```

Each option is documented on its type.

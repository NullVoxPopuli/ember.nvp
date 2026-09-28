# `@nullvoxpopuli/ember-vite`

A speed-optimized default meta-config for ember projects.

## Install

```bash
npm add @nullvoxpopuli/ember-vite
```

Requires node 24+. These packages ship TypeScript source, so type-checking
needs TypeScript 6+ with `lib` covering `es2025` (for example `esnext`).

## Usage

In your vite config:

```js
import { defineConfig } from "vite";
import { ember } from "@nullvoxpopuli/ember-vite";

export default defineConfig({
  plugins: [ember()],
});
```

Then:

1. Remove any plugins from embroider or babel.
2. Delete from your package.json: `@rollup/plugin-babel`, `@embroider/core`, `@embroider/vite`.

> [!NOTE]
> Linting still needs the babel related deps, so keep those.

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

# minimal-library

An Ember v2 library (addon) built with
[`@nullvoxpopuli/ember-rolldown`](https://github.com/NullVoxPopuli/ember.nvp/tree/main/packages/rolldown)
and [tsdown](https://tsdown.dev/).

## Development

```bash
pnpm install
```

Build the distributable (JS + `.d.ts` into `dist/`):

```bash
pnpm build
```

Rebuild on change while developing:

```bash
pnpm start
```

## Structure

- `src/` — your library source. Author components in `.gts`/`.gjs`
  (template-tag) and plain modules in `.ts`/`.js`.
- `src/index.ts` — the public entry point. Everything a consumer can import
  must be re-exported from here (or added as an entry in `tsdown.config.js`).
- `dist/` — the built output that gets published (git-ignored).

## Publishing

`dist/` is built automatically on `prepack`, so `npm publish` ships the
compiled output plus your `src/`.

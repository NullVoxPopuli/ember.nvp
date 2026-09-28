# minimal-extension

A [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) browser extension whose popup is an Ember app.

## Developing

The popup is a regular web page.
The fastest feedback loop is the vite dev server in a normal browser tab:

```bash
pnpm dev
```

To run it as an extension, build in watch mode:

```bash
pnpm build:watch
```

Then load the `dist/` directory as an unpacked extension:

- **Chrome / Edge / Brave**: `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select `dist/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → select `dist/manifest.json`

After a rebuild, re-open the popup (or reload the extension) to see changes.

## Anatomy

- `public/manifest.json` is the extension manifest. It is copied verbatim into `dist/`.
  Add [`background`](https://developer.chrome.com/docs/extensions/reference/manifest/background),
  [`content_scripts`](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts),
  permissions, and icons here as your extension grows.
- `index.html` is the popup page (`action.default_popup`).
  Extension pages forbid inline scripts, so the app boots from `app/boot.ts`.
- `app/` is a normal Ember app.
  Extension pages have no URL bar, so routing uses `locationType: "none"`.

## Building for release

```bash
pnpm build
```

Zip the contents of `dist/` and upload it to the extension store(s) of your choosing.

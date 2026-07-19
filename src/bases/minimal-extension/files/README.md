# minimal-extension

A [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) browser extension whose popup is an Ember app.

## Developing

The popup is a regular web page, so the fastest feedback loop is the vite dev server in a normal browser tab:

```bash
pnpm dev
```

To run as an actual extension, build (in watch mode) and load the `dist/` directory as an unpacked extension:

```bash
pnpm build:watch
```

- **Chrome / Edge / Brave**: `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select `dist/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → select `dist/manifest.json`

After a rebuild, re-open the popup (or reload the extension) to see changes.

## Anatomy

- `public/manifest.json` — the extension manifest; copied verbatim into `dist/`. Add [`background`](https://developer.chrome.com/docs/extensions/reference/manifest/background), [`content_scripts`](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts), permissions, and icons here as your extension grows.
- `index.html` — the popup page (`action.default_popup`). Extension pages are served with a `script-src 'self'` Content-Security-Policy, so the app boots from `app/boot.ts` rather than an inline script.
- `app/` — a normal Ember app. Routing uses `locationType: "none"`, since extension pages have no URL bar to bind to.

## Building for release

```bash
pnpm build
```

Zip the contents of `dist/` and upload it to the extension store(s) of your choosing.

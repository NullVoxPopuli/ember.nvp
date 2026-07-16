import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ViteDevServer } from "vite";

/**
 * Everything a QUnit + testem run needs, with no project-specific
 * references: root-relative specifiers keep it independent of where the
 * project keeps its files, and the globs pick up tests/** as well as
 * co-located `*-test` modules under src/**.
 */
const DEFAULT_TEST_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tests</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="qunit"></div>
    <div id="qunit-fixture">
      <div id="ember-testing-container">
        <div id="ember-testing"></div>
      </div>
    </div>

    <script src="/testem.js" integrity="" data-embroider-ignore></script>
    <script type="module">
      import "ember-testing";
    </script>

    <script type="module">
      import { start } from "/tests/test-helper";
      import.meta.glob("/tests/**/*.{js,ts,gjs,gts}", { eager: true });
      import.meta.glob("/src/**/*-test.{js,ts,gjs,gts}", { eager: true });
      start();
    </script>
  </body>
</html>
`;

/**
 * Lets a project run its tests without maintaining a tests/index.html:
 * whenever that file is absent, this plugin answers for it -- `load`
 * supplies the html to the build (so `tests/index.html` still lands in
 * dist for testem), and the dev-server middleware serves it (through
 * `transformIndexHtml`, so the html goes through the same pipeline as an
 * on-disk file).
 *
 * A tests/index.html on disk always wins; every hook here defers to it.
 */
export function testHtml() {
  const htmlPath = join(process.cwd(), "tests", "index.html");

  return {
    name: "ember:default-test-html",

    resolveId(id: string) {
      if (id === htmlPath && !existsSync(htmlPath)) {
        return id;
      }
    },

    load(id: string) {
      if (id === htmlPath && !existsSync(htmlPath)) {
        return DEFAULT_TEST_HTML;
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (existsSync(htmlPath)) return next();

        const url = (req.url ?? "").split("?")[0];

        if (url !== "/tests" && url !== "/tests/" && url !== "/tests/index.html") {
          return next();
        }

        const html = await server.transformIndexHtml("/tests/index.html", DEFAULT_TEST_HTML);

        res.setHeader("Content-Type", "text/html");
        res.end(html);
      });
    },
  };
}

import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "tsdown";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "../index.ts";

const require = createRequire(import.meta.url);

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/** Babel resolves plugins relative to the config; a temp dir has no node_modules. */
function pluginUrl(specifier: string): string {
  return pathToFileURL(require.resolve(specifier)).href;
}

/**
 * A working ember babel config -- TypeScript stripping plus template
 * compilation, the shape a real publish config has -- with one extra plugin
 * that rewrites the string `"MARKER"` to `name`, so the built output says which
 * config file babel actually loaded.
 *
 * The dev and publish variants are deliberately near-identical apart from that
 * marker: what's under test is *which file gets picked up*, and a config that
 * couldn't compile the fixture would fail for reasons unrelated to that.
 */
function markerConfig(name: string): string {
  return [
    `import transformTypeScript from '${pluginUrl("@babel/plugin-transform-typescript")}';`,
    `import templateCompilation from '${pluginUrl("babel-plugin-ember-template-compilation")}';`,
    ``,
    `export default {`,
    `  plugins: [`,
    `    [transformTypeScript, { allExtensions: true, onlyRemoveTypeImports: true, allowDeclareFields: true }],`,
    `    [templateCompilation, { targetFormat: 'hbs' }],`,
    `    function marker() {`,
    `      return {`,
    `        visitor: {`,
    `          StringLiteral(path) {`,
    `            if (path.node.value === 'MARKER') path.node.value = '${name}';`,
    `          },`,
    `        },`,
    `      };`,
    `    },`,
    `  ],`,
    `};`,
  ].join("\n");
}

/**
 * A publish tsconfig covering only `src`. Relative paths in a tsconfig resolve
 * against the file itself, so one kept in `config/` has to reach back out --
 * exactly the thing a library moving its build config into `config/` gets wrong.
 */
function publishTsconfig(directory: "." | "config"): string {
  const src = directory === "config" ? "../src" : "./src";

  return JSON.stringify({
    include: [`${src}/**/*`],
    compilerOptions: {
      isolatedDeclarations: true,
      declaration: true,
      rootDir: src,
    },
  });
}

/**
 * The tsconfig.json a library with in-package dev code actually has: covers
 * everything, deliberately *without* isolatedDeclarations. If the build reads
 * this one instead of the publish config, the guard fails the build -- which is
 * what makes every assertion below meaningful.
 */
const devTsconfig = JSON.stringify({
  include: ["src/**/*", "demo-app/**/*", "tests/**/*"],
  compilerOptions: { declaration: true },
});

interface Layout {
  /** Where `babel.publish.config.mjs` lives, or `false` for "no publish config". */
  babel: "." | "config" | false;
  /** Where `tsconfig.publish.json` lives. */
  tsconfig: "." | "config";
}

interface Built {
  files: string[];
  js: string;
}

/**
 * Builds a library laid out the way a real one is -- a dev babel config and a
 * dev tsconfig.json alongside publish-only counterparts -- through the whole
 * `ember()` plugin set under tsdown, declarations included.
 */
async function buildLibrary({ babel, tsconfig }: Layout): Promise<Built> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-library-"));

  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", type: "module" }),

    // Dev-side configuration, which must lose to the publish-side files.
    "babel.config.mjs": markerConfig("dev"),
    "tsconfig.json": devTsconfig,

    // Dev-only source, covered by tsconfig.json and by nothing the build reads.
    "demo-app/app.gts": [
      `export const notAnnotated = { anything: 'goes here' };`,
      `export default <template>demo</template>;`,
    ].join("\n"),

    [`${tsconfig}/tsconfig.publish.json`]: publishTsconfig(tsconfig),

    "src/index.gts": [
      `import type { TOC } from '@ember/component/template-only';`,
      ``,
      `export const marker: string = 'MARKER';`,
      ``,
      `export const Greeting: TOC<object> = <template>hi</template>;`,
    ].join("\n"),
  };

  if (babel !== false) {
    files[`${babel}/babel.publish.config.mjs`] = markerConfig("publish");
  }

  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, source, "utf8");
  }

  const previousCwd = process.cwd();
  process.chdir(dir);
  restoreCwd = () => process.chdir(previousCwd);

  await build({
    entry: ["./src/index.gts"],
    config: false,
    logLevel: "silent",
    tsconfig: `./${path.join(tsconfig, "tsconfig.publish.json")}`,
    plugins: [ember()],
  });

  const distDir = path.join(dir, "dist");
  const built: Built = { files: [], js: "" };

  for (const entry of await readdir(distDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    built.files.push(path.relative(distDir, path.join(entry.parentPath, entry.name)));
  }

  built.files.sort();
  built.js = await readFile(path.join(distDir, "index.js"), "utf8");

  return built;
}

describe("a library laid out with dev and publish configs", () => {
  for (const babel of [".", "config"] as const) {
    for (const tsconfig of [".", "config"] as const) {
      const where = (directory: string) => (directory === "." ? "the package root" : "config/");

      it(`builds with babel publish config in ${where(babel)} and tsconfig in ${where(tsconfig)}`, async () => {
        const built = await buildLibrary({ babel, tsconfig });

        // The publish babel config ran, not the dev one sitting next to it...
        expect(built.js).toContain(`"publish"`);
        expect(built.js).not.toContain(`"dev"`);

        // ...and it really ran: <template> came out as a precompileTemplate
        // call, which only that config's template-compilation step produces.
        expect(built.js).toContain("precompileTemplate");
        expect(built.js).not.toContain("<template>");

        // Declarations emitted, so the guard read the publish tsconfig -- the
        // dev tsconfig.json covering demo-app/ has no isolatedDeclarations and
        // would have failed the build.
        expect(built.files).toContain("index.d.ts");
        expect(built.files).toContain("index.js");
      });
    }
  }

  it("falls back to the dev babel config when the library has no publish one", async () => {
    const built = await buildLibrary({ babel: false, tsconfig: "." });

    expect(built.js).toContain(`"dev"`);
    expect(built.files).toContain("index.d.ts");
  });

  it("leaves dev-only source out of the build entirely", async () => {
    // demo-app/app.gts exports an un-annotated const and an inferred default --
    // both isolated-declarations errors. It builds fine because the publish
    // tsconfig doesn't cover it, which is the whole point of the split.
    const built = await buildLibrary({ babel: ".", tsconfig: "." });

    expect(built.files.some((file) => file.includes("app"))).toBe(false);
  });
});

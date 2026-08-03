import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles } from "#test-helpers";
import { writeLibrarySource } from "./library-src-fixtures.ts";
import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * A library whose package also holds dev-only code (a demo app, in-package
 * tests) keeps two of each build config: a permissive `tsconfig.json` and
 * `babel.config.js` that editors and `tsc --noEmit` use over everything, and
 * publish-only counterparts covering just what gets published. Either publish
 * config can sit in the package root or in `config/`.
 *
 * These tests generate a real library, put the configs in each of those
 * places, and run the real `pnpm build`.
 */

/**
 * A development babel config: strips TypeScript, but leaves `<template>` as the
 * `@ember/template-compiler` call content-tag produced. Publishing this output
 * would tie the artifact to one exact ember-source.
 */
const devBabelConfig = `export default {
  plugins: [
    ["@babel/plugin-transform-typescript", { allExtensions: true, allowDeclareFields: true }],
  ],
};
`;

/**
 * A publish babel config: compiles templates to \`precompileTemplate\`, which is
 * what a published library ships (the consuming app does the final compile).
 */
const publishBabelConfig = `export default {
  plugins: [
    ["@babel/plugin-transform-typescript", { allExtensions: true, allowDeclareFields: true }],
    ["babel-plugin-ember-template-compilation", { targetFormat: "hbs" }],
    ["module:decorator-transforms", { runtime: { import: "decorator-transforms/runtime-esm" } }],
  ],
};
`;

/**
 * The `tsconfig.json` such a library actually has: it covers the demo app as
 * well as `src`, and deliberately has no `isolatedDeclarations` -- dev-only
 * code shouldn't be held to a declaration-emit constraint. If the build reads
 * this file rather than the publish tsconfig, the guard fails it, which is what
 * makes every assertion below meaningful.
 */
const devTsconfig = `{
  "extends": "@ember/library-tsconfig",
  "include": ["src", "demo-app"],
  "compilerOptions": {
    "lib": ["esnext", "dom", "dom.iterable"],
    "types": ["ember-source/types", "@glint/ember-tsc/types"]
  }
}
`;

/**
 * Relative paths in a tsconfig resolve against the file itself, so the copy
 * kept in `config/` has to reach back out to `src`.
 */
function publishTsconfig(directory: "." | "config"): string {
  const src = directory === "config" ? "../src" : "./src";

  return `{
  "extends": "@ember/library-tsconfig",
  "include": ["${src}"],
  "compilerOptions": {
    "rootDir": "${src}",
    "lib": ["esnext", "dom", "dom.iterable"],
    "isolatedDeclarations": true,
    "types": ["ember-source/types", "@glint/ember-tsc/types"]
  }
}
`;
}

/** `tsconfigOption` is a literal expression: a quoted path, or `false`. */
function tsdownConfig(tsconfigOption: string): string {
  return `import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  tsconfig: ${tsconfigOption},
  plugins: [ember()],
});
`;
}

/** Every place a publish config can be found, so each layout starts clean. */
const BABEL_CONFIG_PATHS = ["babel.publish.config.js", "config/babel.publish.config.js"];
const TSCONFIG_PATHS = [
  "tsconfig.publish.json",
  "config/tsconfig.publish.json",
  "config/tsconfig.json",
  "tsconfig.base.json",
];

describe("publish configs", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ type: "library", name: "my-lib", layers: ["typescript"] });

    await writeLibrarySource(project, "typescript");

    // A library that writes its own babel config declares the plugins it uses.
    const manifest = JSON.parse((await project.read("package.json"))!);

    manifest.devDependencies["@babel/core"] = "^7.28.10";
    manifest.devDependencies["@babel/plugin-transform-typescript"] = "^7.28.10";
    manifest.devDependencies["babel-plugin-ember-template-compilation"] = "^4.0.0";

    await writeFile(
      join(project.directory, "package.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    // Dev-only source: exports with no type annotations, which the publish
    // tsconfig must not cover.
    await mkdir(join(project.directory, "demo-app"), { recursive: true });
    await writeFile(
      join(project.directory, "demo-app", "app.gts"),
      `export const anything = { not: "annotated" };\nexport default <template>demo</template>;\n`,
      "utf-8",
    );

    await writeFile(join(project.directory, "tsconfig.json"), devTsconfig, "utf-8");
    await writeFile(join(project.directory, "babel.config.js"), devBabelConfig, "utf-8");

    const install = await execa("pnpm install", { cwd: project.directory, shell: true });
    expect(install.exitCode).toBe(0);
  });

  afterAll(async () => {
    if (process.env.CI) return;

    await rm(project.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  /** Clears every publish config, so one test's layout can't satisfy the next. */
  async function resetConfigs() {
    for (const relative of [...BABEL_CONFIG_PATHS, ...TSCONFIG_PATHS]) {
      await rm(join(project.directory, relative), { force: true });
    }

    await rm(join(project.directory, "dist"), { recursive: true, force: true });
    await mkdir(join(project.directory, "config"), { recursive: true });
  }

  async function runBuild() {
    const build = await execa("pnpm build", {
      cwd: project.directory,
      shell: true,
      reject: false,
      all: true,
    });

    return { build, output: await project.read("dist/index.js") };
  }

  /** Puts the publish configs in the requested places and runs the real build. */
  async function buildWith({
    babel,
    tsconfig,
  }: {
    babel: "." | "config" | false;
    tsconfig: "." | "config";
  }) {
    await resetConfigs();

    if (babel !== false) {
      const relative = join(babel, "babel.publish.config.js");

      await writeFile(join(project.directory, relative), publishBabelConfig, "utf-8");
    }

    const tsconfigRelative = join(tsconfig, "tsconfig.publish.json");

    await writeFile(join(project.directory, tsconfigRelative), publishTsconfig(tsconfig), "utf-8");
    await writeFile(
      join(project.directory, "tsdown.config.js"),
      tsdownConfig(`"./${tsconfigRelative}"`),
      "utf-8",
    );

    return await runBuild();
  }

  for (const babel of [".", "config"] as const) {
    for (const tsconfig of [".", "config"] as const) {
      const where = (directory: string) => (directory === "." ? "the package root" : "config/");

      it(`builds with the babel config in ${where(babel)} and the tsconfig in ${where(tsconfig)}`, async () => {
        const { build, output } = await buildWith({ babel, tsconfig });

        expect(build.exitCode, build.all).toBe(0);

        // The publish babel config ran: templates came out as
        // precompileTemplate, which only its template-compilation step emits.
        expect(output).toContain("precompileTemplate");
        expect(output).not.toContain("createTemplateFactory");

        // ...and the dev config, which has no template compilation, did not.
        expect(output).not.toContain("@ember/template-compiler");

        // Declarations emitted, so the guard read the publish tsconfig: the
        // dev tsconfig.json covering demo-app/ has no isolatedDeclarations and
        // would have failed the build.
        expect(await listFiles(join(project.directory, "dist"))).toContain("index.d.ts");
      });
    }
  }

  it("falls back to the dev babel config when there is no publish one", async () => {
    const { build, output } = await buildWith({ babel: false, tsconfig: "." });

    expect(build.exitCode, build.all).toBe(0);

    // Nothing compiled the template, so content-tag's output survives -- the
    // artifact you don't want to publish, which is why the preference exists.
    expect(output).toContain("@ember/template-compiler");
    expect(output).not.toContain("precompileTemplate");
  });

  /**
   * Writes `files` into the project and builds with `tsconfigOption` as tsdown's
   * `tsconfig`, for the cases about *which* tsconfig the guard ends up reading.
   * The publish babel config is always present so these fail for tsconfig
   * reasons only.
   */
  async function buildWithTsconfigOption(
    tsconfigOption: string,
    files: Record<string, string> = {},
  ) {
    await resetConfigs();

    await writeFile(
      join(project.directory, "babel.publish.config.js"),
      publishBabelConfig,
      "utf-8",
    );

    for (const [relative, contents] of Object.entries(files)) {
      await writeFile(join(project.directory, relative), contents, "utf-8");
    }

    await writeFile(
      join(project.directory, "tsdown.config.js"),
      tsdownConfig(tsconfigOption),
      "utf-8",
    );

    return await runBuild();
  }

  it("fails when the publish tsconfig itself lacks isolatedDeclarations", async () => {
    const { build } = await buildWithTsconfigOption(`"./tsconfig.publish.json"`, {
      "tsconfig.publish.json": publishTsconfig(".").replace(
        `"isolatedDeclarations": true,\n    `,
        "",
      ),
    });

    expect(build.exitCode).not.toBe(0);
    expect(build.all).toContain('"compilerOptions.isolatedDeclarations": true');
    expect(build.all).toContain("tsconfig.publish.json");
  });

  it("accepts a directory, reading the tsconfig.json inside it", async () => {
    const { build } = await buildWithTsconfigOption(`"./config"`, {
      "config/tsconfig.json": publishTsconfig("config"),
    });

    expect(build.exitCode, build.all).toBe(0);
  });

  it("takes the flag from an extends chain", async () => {
    const { build } = await buildWithTsconfigOption(`"./tsconfig.publish.json"`, {
      "tsconfig.base.json": `{ "compilerOptions": { "isolatedDeclarations": true } }\n`,
      "tsconfig.publish.json": publishTsconfig(".").replace(
        `"extends": "@ember/library-tsconfig"`,
        `"extends": ["@ember/library-tsconfig", "./tsconfig.base.json"]`,
      ),
    });

    expect(build.exitCode, build.all).toBe(0);
  });

  it("rejects tsconfig: false while declarations are on", async () => {
    // No tsconfig means no isolatedDeclarations, so tsdown falls back to the
    // tsc-based pipeline, which can't see compiled .gts and dies with
    // "Source file not found". Fail with something actionable instead.
    const { build } = await buildWithTsconfigOption("false");

    expect(build.exitCode).not.toBe(0);
    expect(build.all).toContain("`tsconfig: false` cannot be combined with declaration emit");
    expect(build.all).not.toContain("Source file not found");
  });

  it("allows tsconfig: false for a library that ships no types", async () => {
    await resetConfigs();

    await writeFile(
      join(project.directory, "babel.publish.config.js"),
      publishBabelConfig,
      "utf-8",
    );
    await writeFile(
      join(project.directory, "tsdown.config.js"),
      `import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  tsconfig: false,
  dts: false,
  plugins: [ember()],
});
`,
      "utf-8",
    );

    const { build } = await runBuild();

    expect(build.exitCode, build.all).toBe(0);
    expect(await listFiles(join(project.directory, "dist"))).not.toContain("index.d.ts");
  });

  it("keeps dev-only source out of the build", async () => {
    // demo-app/app.gts would be an isolated-declarations error, and builds fine
    // only because the publish tsconfig doesn't cover it.
    const { build } = await buildWith({ babel: ".", tsconfig: "." });

    expect(build.exitCode, build.all).toBe(0);
    expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
      [
        "index.d.ts",
        "index.d.ts.map",
        "index.js",
        "index.js.map",
      ]
    `);
  });
});

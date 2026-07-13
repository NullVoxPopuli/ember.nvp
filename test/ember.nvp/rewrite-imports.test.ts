import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { rewriteImportsToMatchFiles } from "#utils/rewrite-imports.js";

/**
 * Generation renames files (e.g. type removal turns .ts into .js), so
 * import specifiers are checked against the emitted project tree:
 * whatever file actually exists on disk wins.
 */
describe("rewriteImportsToMatchFiles", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  /**
   * Lays out an emitted-project fixture on disk (the way generation
   * stages real files) and returns its root.
   */
  async function makeProject(files: Record<string, string>) {
    const dir = await mkdtemp(join(tmpdir(), "rewrite-imports-test-"));
    dirs.push(dir);

    for (const [path, contents] of Object.entries(files)) {
      await mkdir(join(dir, dirname(path)), { recursive: true });
      await writeFile(join(dir, path), contents);
    }

    return dir;
  }

  const manifest = JSON.stringify({
    name: "fixture",
    imports: {
      "#app/*": "./app/*",
      "#config": "./app/config.js",
    },
  });

  it("rewrites a specifier whose file was renamed", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/app.js": "",
      "app/config.js": "",
    });

    const result = rewriteImportsToMatchFiles(
      [`import Application from "#app/app.ts";`, `import config from "#config";`].join("\n"),
      join(project, "tests/test-helper.js"),
    );

    expect(result).toMatchInlineSnapshot(`
      "import Application from "#app/app.js";
      import config from "#config";"
    `);
  });

  it("leaves a specifier alone when its file exists as written", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/helpers/x.ts": "",
    });

    const result = rewriteImportsToMatchFiles(
      `import x from "./helpers/x.ts";`,
      join(project, "app/consumer.ts"),
    );

    expect(result).toMatchInlineSnapshot(`"import x from "./helpers/x.ts";"`);
  });

  it("adds the on-disk extension to extensionless local imports", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/helpers/x.js": "",
      "app/app.ts": "",
    });

    const result = rewriteImportsToMatchFiles(
      [`import x from "./helpers/x";`, `import Application from "#app/app";`].join("\n"),
      join(project, "app/consumer.js"),
    );

    expect(result).toMatchInlineSnapshot(`
      "import x from "./helpers/x.js";
      import Application from "#app/app.ts";"
    `);
  });

  it("keeps an extensionless specifier whose fully-specified form would not map", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/config.js": "",
    });

    // `#config` maps to "./app/config.js" -- the extension lives in the
    // `imports` target, so "#config.js" would not resolve
    const result = rewriteImportsToMatchFiles(
      `import config from "#config";`,
      join(project, "app/consumer.js"),
    );

    expect(result).toMatchInlineSnapshot(`"import config from "#config";"`);
  });

  it("rewrites relative, re-export, and dynamic import() specifiers", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/thing.js": "",
      "shared/other.js": "",
      "app/lazy.js": "",
    });

    const result = rewriteImportsToMatchFiles(
      [
        `export { thing } from "./thing.ts";`,
        `export * from "../shared/other.ts";`,
        `export async function load() {`,
        `  return await import("./lazy.ts");`,
        `}`,
      ].join("\n"),
      join(project, "app/consumer.js"),
    );

    expect(result).toMatchInlineSnapshot(`
      "export { thing } from "./thing.js";
      export * from "../shared/other.js";
      export async function load() {
        return await import("./lazy.js");
      }"
    `);
  });

  it("leaves a specifier alone when no file matches at all", async () => {
    const project = await makeProject({
      "package.json": manifest,
    });

    const result = rewriteImportsToMatchFiles(
      `import missing from "./does-not-exist.ts";`,
      join(project, "app/consumer.js"),
    );

    expect(result).toMatchInlineSnapshot(`"import missing from "./does-not-exist.ts";"`);
  });

  it("leaves package specifiers and non-import strings alone", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/looks-like-a-file.js": "",
    });

    const result = rewriteImportsToMatchFiles(
      [`import lib from "some-lib/file.ts";`, `const notAnImport = "./looks-like-a-file.ts";`].join(
        "\n",
      ),
      join(project, "app/consumer.js"),
    );

    expect(result).toMatchInlineSnapshot(`
      "import lib from "some-lib/file.ts";
      const notAnImport = "./looks-like-a-file.ts";"
    `);
  });

  it("rewrites imports in gjs files while preserving the template", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/components/button.gjs": "",
    });

    const result = rewriteImportsToMatchFiles(
      [
        `import Component from "@glimmer/component";`,
        `import Button from "./button.gts";`,
        ``,
        `export default class Foo extends Component {`,
        `  <template>`,
        `    <Button />`,
        `  </template>`,
        `}`,
      ].join("\n"),
      join(project, "app/components/foo.gjs"),
    );

    expect(result).toMatchInlineSnapshot(`
      "import Component from "@glimmer/component";
      import Button from "./button.gjs";
      export default class Foo extends Component {
        <template><Button /></template>
      }"
    `);
  });

  it("keeps comments in files whose imports are rewritten", async () => {
    const project = await makeProject({
      "package.json": manifest,
      "app/app.js": "",
    });

    const result = rewriteImportsToMatchFiles(
      [
        `// top comment`,
        `import Application from "#app/app.ts";`,
        ``,
        `/**`,
        ` * doc comment for start`,
        ` */`,
        `export function start() {`,
        `  // inner comment`,
        `  Application.create();`,
        `}`,
      ].join("\n"),
      join(project, "tests/test-helper.js"),
    );

    expect(result).toMatchInlineSnapshot(`
      "// top comment
      import Application from "#app/app.js";
      /**
       * doc comment for start
       */
      export function start() {
        // inner comment
        Application.create();
      }"
    `);
  });
});

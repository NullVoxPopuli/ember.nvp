import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { removeTypes } from "#utils/remove-types.js";

/**
 * When generating a JS project, .ts / .gts files are converted and renamed
 * to .js / .gjs. Import specifiers are then checked against the emitted
 * project tree: whatever file actually exists on disk wins.
 */
describe("removeTypes", () => {
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
    const dir = await mkdtemp(join(tmpdir(), "remove-types-test-"));
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

  describe("import specifiers match the files on disk", () => {
    it("rewrites a specifier whose file was renamed by type removal", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/app.js": "",
        "app/config.js": "",
      });

      const result = await removeTypes(
        ".ts",
        [`import Application from "#app/app.ts";`, `import config from "#config";`].join("\n"),
        join(project, "tests/test-helper.js"),
      );

      expect(result).toContain(`#app/app.js`);
      expect(result).toContain(`#config`);
    });

    it("leaves a specifier alone when its file exists as written", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/helpers/x.ts": "",
      });

      const result = await removeTypes(
        ".ts",
        `import x from "./helpers/x.ts";`,
        join(project, "app/consumer.js"),
      );

      expect(result).toContain(`./helpers/x.ts`);
    });

    it("leaves extensionless specifiers alone", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/helpers/x.js": "",
      });

      const result = await removeTypes(
        ".ts",
        `import x from "./helpers/x";`,
        join(project, "app/consumer.js"),
      );

      expect(result).toContain(`./helpers/x`);
    });

    it("rewrites relative, re-export, and dynamic import() specifiers", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/thing.js": "",
        "shared/other.js": "",
        "app/lazy.js": "",
      });

      const result = await removeTypes(
        ".ts",
        [
          `export { thing } from "./thing.ts";`,
          `export * from "../shared/other.ts";`,
          `export async function load() {`,
          `  return await import("./lazy.ts");`,
          `}`,
        ].join("\n"),
        join(project, "app/consumer.js"),
      );

      expect(result).toContain(`./thing.js`);
      expect(result).toContain(`../shared/other.js`);
      expect(result).toContain(`./lazy.js`);
    });

    it("leaves a specifier alone when no file matches at all", async () => {
      const project = await makeProject({
        "package.json": manifest,
      });

      const result = await removeTypes(
        ".ts",
        `import missing from "./does-not-exist.ts";`,
        join(project, "app/consumer.js"),
      );

      expect(result).toContain(`./does-not-exist.ts`);
    });

    it("leaves package specifiers and non-import strings alone", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/looks-like-a-file.js": "",
      });

      const result = await removeTypes(
        ".ts",
        [
          `import lib from "some-lib/file.ts";`,
          `const notAnImport = "./looks-like-a-file.ts";`,
        ].join("\n"),
        join(project, "app/consumer.js"),
      );

      expect(result).toContain(`some-lib/file.ts`);
      expect(result).toContain("./looks-like-a-file.ts");
    });

    it("rewrites imports in .gts files while preserving the template", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/components/button.gjs": "",
      });

      const result = await removeTypes(
        ".gts",
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

      expect(result).toContain(`./button.gjs`);
      expect(result).toContain("<template>");
      expect(result).toContain("<Button />");
    });

    it("keeps comments in files whose imports are rewritten", async () => {
      const project = await makeProject({
        "package.json": manifest,
        "app/app.js": "",
      });

      const result = await removeTypes(
        ".ts",
        [
          `// top comment`,
          `import Application from "#app/app.ts";`,
          ``,
          `/**`,
          ` * doc comment for start`,
          ` */`,
          `export function start(): void {`,
          `  // inner comment`,
          `  Application.create();`,
          `}`,
        ].join("\n"),
        join(project, "tests/test-helper.js"),
      );

      expect(result).toContain(`#app/app.js`);
      expect(result).toContain("// top comment");
      expect(result).toContain("doc comment for start");
      expect(result).toContain("// inner comment");
    });
  });
});

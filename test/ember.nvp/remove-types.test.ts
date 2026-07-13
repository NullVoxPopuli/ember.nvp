import { describe, it, expect } from "vitest";

import { removeTypes } from "#utils/remove-types.js";

/**
 * When generating a JS project, .ts / .gts files are converted and renamed
 * to .js / .gjs -- so import specifiers that point at project files via an
 * explicit extension have to be rewritten to match what ends up on disk.
 */
describe("removeTypes", () => {
  describe("import specifier extensions", () => {
    it("rewrites local .ts / .gts specifiers in static imports", async () => {
      let result = await removeTypes(
        ".ts",
        [
          `import Application from "#app/app.ts";`,
          `import config from "#config";`,
          `import Button from "./button.gts";`,
          `import helper from "../helpers/x.ts";`,
        ].join("\n"),
      );

      expect(result).toContain("#app/app.js");
      expect(result).toContain("#config");
      expect(result).toContain("./button.gjs");
      expect(result).toContain("../helpers/x.js");
      expect(result).not.toContain(".ts");
      expect(result).not.toContain(".gts");
    });

    it("rewrites re-exports and dynamic import()", async () => {
      let result = await removeTypes(
        ".ts",
        [
          `export { thing } from "./thing.ts";`,
          `export * from "./other.gts";`,
          `export async function load() {`,
          `  return await import("./lazy.ts");`,
          `}`,
        ].join("\n"),
      );

      expect(result).toContain("./thing.js");
      expect(result).toContain("./other.gjs");
      expect(result).toContain(`import("./lazy.js")`);
    });

    it("keeps comments in files whose imports are rewritten", async () => {
      let result = await removeTypes(
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
      );

      expect(result).toContain("#app/app.js");
      expect(result).toContain("// top comment");
      expect(result).toContain("doc comment for start");
      expect(result).toContain("// inner comment");
    });

    it("leaves package specifiers and non-import strings alone", async () => {
      let result = await removeTypes(
        ".ts",
        [
          `import lib from "some-lib/file.ts";`,
          `const notAnImport = "./looks-like-a-file.ts";`,
        ].join("\n"),
      );

      expect(result).toContain("some-lib/file.ts");
      expect(result).toContain("./looks-like-a-file.ts");
    });

    it("rewrites imports in .gts files while preserving the template", async () => {
      let result = await removeTypes(
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
      );

      expect(result).toContain("./button.gjs");
      expect(result).toContain("<template>");
      expect(result).toContain("<Button />");
    });
  });
});

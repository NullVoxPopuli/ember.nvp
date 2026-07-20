import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";

import { emberTransform } from "./transform.ts";

/**
 * Drives the plugin through a real rolldown build. `files` is a map of
 * relative path -> source; the build entry is `index.ts`. Every bare (package)
 * specifier is marked external so the build only exercises the local
 * `.gts`/`.gjs`/`.ts` handling and doesn't need real dependencies installed.
 * Returns the concatenated code of every emitted chunk.
 */
async function bundle(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-build-"));

  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, source, "utf8");
  }

  const isLocal = (id: string) => id.startsWith(".") || id.startsWith("/") || path.isAbsolute(id);

  const build = await rolldown({
    input: path.join(dir, "index.ts"),
    plugins: [emberTransform()],
    external: (id) => !isLocal(id),
    onwarn() {},
  });

  const { output } = await build.generate({ format: "es" });

  const code = output
    .filter((chunk): chunk is typeof chunk & { code: string } => "code" in chunk)
    .map((chunk) => chunk.code)
    .join("\n");

  // rolldown's `//#region <path>` comments reference the random temp dir;
  // collapse them to the bare filename so snapshots stay deterministic.
  return code.replace(/(\/\/#region ).*\/([^/\n]+)$/gm, "$1$2");
}

describe("emberTransform (full plugin via rolldown)", () => {
  it("compiles a .gts module's <template> and keeps bare imports external", async () => {
    const code = await bundle({
      "index.ts": `export { default as Foo } from './foo.gts';`,
      "foo.gts": [
        `import Component from '@glimmer/component';`,
        `export default class Foo extends Component {`,
        `  <template>Hello</template>`,
        `}`,
      ].join("\n"),
    });

    // <template> is gone, replaced by a content-tag `template(...)` call.
    expect(code).not.toContain("<template>");
    expect(code).toContain("template(");
    // The bare import survived as an external dependency.
    expect(code).toContain(`from "@glimmer/component"`);
    // ...and it pulls in the template-compiler runtime import.
    expect(code).toContain("@ember/template-compiler");

    expect(code).toMatchInlineSnapshot(`
      "import { template } from "@ember/template-compiler";
      import Component from "@glimmer/component";
      //#region foo.ts
      var Foo = class extends Component {
      	static {
      		template(\`Hello\`, {
      			component: this,
      			eval() {
      				return eval(arguments[0]);
      			}
      		});
      	}
      };
      //#endregion
      export { Foo };
      "
    `);
  });

  it("compiles .gjs alongside .gts and plain .ts in one graph", async () => {
    const code = await bundle({
      "index.ts": [
        `export { default as Foo } from './foo.gts';`,
        `export { greet } from './util.gjs';`,
        `export { helper } from './plain.ts';`,
      ].join("\n"),
      "foo.gts": `<template>Foo</template>`,
      "util.gjs": [
        `export function greet() { return 'hi'; }`,
        `<template>{{greet}}</template>`,
      ].join("\n"),
      "plain.ts": `export function helper() { return 1; }`,
    });

    expect(code).not.toContain("<template>");
    expect(code).toContain("function greet()");
    expect(code).toContain("function helper()");
    expect(code).toContain("export {");

    expect(code).toMatchInlineSnapshot(`
      "import { template } from "@ember/template-compiler";
      //#region foo.ts
      var foo_default = template(\`Foo\`, { eval() {
      	return eval(arguments[0]);
      } });
      //#endregion
      //#region util.js
      function greet() {
      	return "hi";
      }
      var util_default = template(\`{{greet}}\`, { eval() {
      	return eval(arguments[0]);
      } });
      //#endregion
      //#region plain.ts
      function helper() {
      	return 1;
      }
      //#endregion
      export { foo_default as Foo, greet, helper };
      "
    `);
  });

  it("resolves a .gts module that imports another .gts relatively", async () => {
    const code = await bundle({
      "index.ts": `export { default as Page } from './page.gts';`,
      "page.gts": [
        `import Widget from './widget.gts';`,
        `export default class Page {`,
        `  Widget = Widget;`,
        `  <template><Widget /></template>`,
        `}`,
      ].join("\n"),
      "widget.gts": `<template>widget</template>`,
    });

    // Both templates compiled, and the relative .gts import resolved (bundled).
    expect(code).not.toContain("<template>");
    expect(code).not.toContain(".gts");
    expect(code).toContain("template(");

    expect(code).toMatchInlineSnapshot(`
      "import { template } from "@ember/template-compiler";
      //#region widget.ts
      var widget_default = template(\`widget\`, { eval() {
      	return eval(arguments[0]);
      } });
      //#endregion
      //#region page.ts
      var Page = class {
      	Widget = widget_default;
      	static {
      		template(\`<Widget />\`, {
      			component: this,
      			eval() {
      				return eval(arguments[0]);
      			}
      		});
      	}
      };
      //#endregion
      export { Page };
      "
    `);
  });
});

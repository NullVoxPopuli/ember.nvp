import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";

import { emberExternals } from "./externals.ts";

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/**
 * An ember-source stub whose `ember-addon.renamed-modules` provides
 * `@glimmer/runtime` (file-path keys, like the real manifest).
 */
const EMBER_SOURCE_STUB = {
  name: "ember-source",
  version: "0.0.0",
  "ember-addon": {
    "renamed-modules": {
      "@glimmer/runtime/index.js": "ember-source/@glimmer/runtime/index.js",
      "@ember/-internals/glimmer/index.js": "ember-source/@ember/-internals/glimmer/index.js",
    },
  },
};

/**
 * Writes a fixture package (manifest + optional stub ember-source in its
 * node_modules) and cds into it — the plugin reads both from the library's
 * own context, like the tsdown CLI.
 */
async function fixture(manifest: object, { emberSource = true } = {}): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-externals-"));
  await writeFile(path.join(dir, "package.json"), JSON.stringify(manifest));

  if (emberSource) {
    const stubDir = path.join(dir, "node_modules/ember-source");
    await mkdir(stubDir, { recursive: true });
    await writeFile(path.join(stubDir, "package.json"), JSON.stringify(EMBER_SOURCE_STUB));
  }

  const previousCwd = process.cwd();
  process.chdir(dir);
  restoreCwd = () => process.chdir(previousCwd);

  return dir;
}

/** Runs the plugin's own hooks directly against the current fixture. */
function resolveWith(source: string): unknown {
  const plugin = emberExternals();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
  (plugin.buildStart as any).call({ addWatchFile() {} });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
  return (plugin.resolveId as any).handler(source);
}

describe("emberExternals", () => {
  it("externalizes declared dependencies and the ember virtual packages", async () => {
    await fixture({ dependencies: { "some-dep": "*" } });
    expect(resolveWith("some-dep")).toBe(false);
    expect(resolveWith("@ember/component")).toBe(false);
    expect(resolveWith("@glimmer/tracking")).toBe(false);
  });

  it("externalizes the modules ember-source provides via renamed-modules", async () => {
    // Private API like @glimmer/runtime exists only inside the app's
    // ember-source (its ember-addon.renamed-modules) — @embroider/core's
    // emberVirtualPackages doesn't list it.
    await fixture({});
    expect(resolveWith("@glimmer/runtime")).toBe(false);
    expect(resolveWith("@ember/-internals/glimmer")).toBe(false);
  });

  it("does not blanket-externalize @glimmer packages ember-source doesn't provide", async () => {
    // e.g. @glimmer/component is a real package a library may want bundled;
    // only declared deps / virtual packages / renamed-modules are external.
    await fixture({});
    expect(resolveWith("@glimmer/not-provided")).toBeUndefined();
  });

  it("leaves undeclared packages alone, with or without ember-source", async () => {
    await fixture({});
    expect(resolveWith("left-pad")).toBeUndefined();

    await fixture({}, { emberSource: false });
    expect(resolveWith("left-pad")).toBeUndefined();
    // No ember-source in the graph -> no renamed-modules to consult.
    expect(resolveWith("@glimmer/runtime")).toBeUndefined();
  });

  it("keeps a renamed-modules import external through a real build", async () => {
    const dir = await fixture({ name: "build-fixture" });
    await writeFile(
      path.join(dir, "index.ts"),
      `import { curry } from '@glimmer/runtime';\nexport const curried: unknown = curry;\n`,
    );

    const warnings: string[] = [];
    const build = await rolldown({
      input: path.join(dir, "index.ts"),
      plugins: [emberExternals()],
      onwarn(warning) {
        warnings.push(warning.code ?? String(warning));
      },
    });
    const { output } = await build.generate({ format: "es" });

    expect(warnings.filter((code) => code === "UNRESOLVED_IMPORT")).toEqual([]);

    const code = output.filter((chunk) => "code" in chunk).map((chunk) => chunk.code)[0] ?? "";
    expect(code).toContain(`from "@glimmer/runtime"`);
  });
});

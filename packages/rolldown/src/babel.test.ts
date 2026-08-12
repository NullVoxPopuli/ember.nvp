import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";
import { version as babelVersion } from "@babel/core";

import { emberBabel, type BabelOptions } from "./babel.ts";
import { emberTransform } from "./transform.ts";

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/**
 * A babel config whose only plugin rewrites the string `"MARKER"` to `name`, so
 * the emitted code says which config file babel actually loaded.
 */
function markerConfig(name: string): string {
  return [
    `export default {`,
    `  plugins: [`,
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
 * Builds a `.gts` entry (so babel actually runs -- `maybeBabel` skips files that
 * need no transform) in a temp dir that becomes the cwd, the way config
 * detection sees it under the tsdown CLI. Returns the emitted code.
 */
async function bundleWithBabel(
  files: Record<string, string>,
  options?: BabelOptions,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-babel-"));

  const withDefaults: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", type: "module" }),
    "index.gts": [
      `export const marker = 'MARKER';`,
      `export default <template>hi</template>;`,
    ].join("\n"),
    ...files,
  };

  for (const [relative, source] of Object.entries(withDefaults)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, source, "utf8");
  }

  const previousCwd = process.cwd();
  process.chdir(dir);
  restoreCwd = () => process.chdir(previousCwd);

  const build = await rolldown({
    input: [path.join(dir, "index.gts")],
    plugins: [emberTransform(), emberBabel(options)],
    external: (id) => !(id.startsWith(".") || path.isAbsolute(id)),
    onwarn() {},
  });

  const { output } = await build.generate({ format: "es" });

  return output
    .filter((chunk): chunk is typeof chunk & { code: string } => "code" in chunk)
    .map((chunk) => chunk.code)
    .join("\n");
}

describe("emberBabel", () => {
  it("rejects templateTransforms combined with a config file", () => {
    expect(() =>
      emberBabel({ configFile: "./babel.config.js", templateTransforms: ["some-transform"] }),
    ).toThrow(/pass the transforms/);
  });

  it("allows templateTransforms when config files are opted out", () => {
    expect(() =>
      emberBabel({ configFile: false, templateTransforms: ["some-transform"] }),
    ).not.toThrow();
  });

  describe("config detection", () => {
    it("prefers babel.publish.config over babel.config", async () => {
      const code = await bundleWithBabel({
        "babel.config.mjs": markerConfig("dev"),
        "babel.publish.config.mjs": markerConfig("publish"),
      });

      expect(code).toContain(`"publish"`);
      expect(code).not.toContain(`"dev"`);
    });

    it("falls back to babel.config when there is no publish config", async () => {
      const code = await bundleWithBabel({ "babel.config.mjs": markerConfig("dev") });

      expect(code).toContain(`"dev"`);
    });

    it("uses an explicit configFile over either", async () => {
      const code = await bundleWithBabel(
        {
          "babel.config.mjs": markerConfig("dev"),
          "babel.publish.config.mjs": markerConfig("publish"),
          "babel.explicit.config.mjs": markerConfig("explicit"),
        },
        { configFile: "./babel.explicit.config.mjs" },
      );

      expect(code).toContain(`"explicit"`);
      expect(code).not.toContain(`"publish"`);
    });

    it("ignores every config file when configFile is false", async () => {
      const code = await bundleWithBabel(
        {
          "babel.config.mjs": markerConfig("dev"),
          "babel.publish.config.mjs": markerConfig("publish"),
        },
        { configFile: false },
      );

      expect(code).toContain(`"MARKER"`);
    });
  });

  /**
   * Babel majors are not mix-and-match: a v7 plugin loaded into v8's core (or
   * the reverse) throws `Requires Babel "^7.0.0-0", but was loaded with "8.x"`
   * before it transforms anything, and the two parsers disagree about the TS
   * AST besides -- v8 moves enum members onto a `TSEnumBody` node that v7's
   * transform doesn't know to visit. So the whole default plugin set has to run
   * on whichever major the consumer resolved.
   */
  describe(`default plugins under @babel/core ${babelVersion}`, () => {
    it("compiles a .gts using the features the defaults exist for", async () => {
      const code = await bundleWithBabel(
        {
          "index.gts": [
            `enum Level { Low, High }`,
            `class Counter { @tracked count = Level.Low; }`,
            `export const marker: string = 'MARKER';`,
            `export { Level, Counter };`,
            `export default <template>hi</template>;`,
          ].join("\n"),
        },
        { configFile: false },
      );

      // TypeScript is stripped (enums become real values, annotations go away)
      expect(code).toContain("Level");
      expect(code).not.toMatch(/\benum\b/);
      expect(code).not.toContain("marker: string");
      // decorator-transforms rewrote the decorated field against its runtime
      expect(code).toContain("decorator-transforms/runtime-esm");
      expect(code).not.toMatch(/@tracked/);
      // the template became a precompileTemplate call, not wire format
      expect(code).toContain("precompileTemplate");
    });
  });
});

describe("babel version ranges", () => {
  /**
   * `@babel/plugin-transform-typescript` is versioned in lockstep with
   * `@babel/core` and asserts the major it was loaded into, so a consumer that
   * can resolve one range but not the other gets a crash rather than a
   * resolution error. Keeping the two declarations identical means package
   * managers always pick a matched pair.
   */
  it("declares @babel/core and @babel/plugin-transform-typescript identically", async () => {
    const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));

    expect(manifest.peerDependencies["@babel/plugin-transform-typescript"]).toBe(
      manifest.peerDependencies["@babel/core"],
    );
    expect(manifest.dependencies).not.toHaveProperty("@babel/core");
    expect(manifest.dependencies).not.toHaveProperty("@babel/plugin-transform-typescript");
  });
});

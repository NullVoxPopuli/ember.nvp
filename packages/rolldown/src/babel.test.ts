import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";

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
});

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import type { InputOptions } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";

import { emberBundle, emberSourceAliases } from "./bundle.ts";

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/**
 * An ember-source stub shaped like the real package:
 * - a `./*` export whose conditions pick one of two builds
 * - a `renamed-modules` map keyed by module file path
 */
const EMBER_SOURCE_MANIFEST = {
  name: "ember-source",
  version: "0.0.0",
  type: "module",
  exports: {
    "./*": {
      development: "./dist/dev/packages/*",
      production: "./dist/prod/packages/*",
      default: "./dist/prod/packages/*",
    },
    "./package.json": "./package.json",
  },
  "ember-addon": {
    "renamed-modules": {
      "@ember/modifier/index.js": "ember-source/@ember/modifier/index.js",
      "@ember/modifier/on.js": "ember-source/@ember/modifier/on.js",
      "@ember/-internals/glimmer/index.js": "ember-source/@ember/-internals/glimmer/index.js",
      "@glimmer/runtime/index.js": "ember-source/@glimmer/runtime/index.js",
      "rsvp/index.js": "ember-source/rsvp/index.js",
      "ember/index.js": "ember-source/ember/index.js",
    },
  },
};

/**
 * Each provided module exists in both builds, and says which build it is.
 */
const EMBER_SOURCE_MODULES = {
  "@ember/modifier/index.js": `export const on = "on from BUILD";`,
  "@ember/modifier/on.js": `export const on = "on from BUILD";`,
};

async function fixture({ emberSource = true } = {}): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-bundle-"));
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: "0.0.0", type: "module" }),
  );

  if (emberSource) {
    const stubDir = path.join(dir, "node_modules/ember-source");
    await mkdir(stubDir, { recursive: true });
    await writeFile(path.join(stubDir, "package.json"), JSON.stringify(EMBER_SOURCE_MANIFEST));

    for (const build of ["dev", "prod"]) {
      for (const [modulePath, source] of Object.entries(EMBER_SOURCE_MODULES)) {
        const file = path.join(stubDir, "dist", build, "packages", modulePath);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, source.replace("BUILD", build));
      }
    }
  }

  const previousCwd = process.cwd();
  process.chdir(dir);
  restoreCwd = () => process.chdir(previousCwd);

  return dir;
}

async function bundle(dir: string, entry: string, resolve: InputOptions["resolve"] = {}) {
  await writeFile(path.join(dir, "index.js"), entry);

  const build = await rolldown({
    input: path.join(dir, "index.js"),
    plugins: [emberBundle()],
    resolve,
    onwarn() {},
  });
  const { output } = await build.generate({ format: "es" });

  return output.filter((chunk) => "code" in chunk).map((chunk) => chunk.code)[0] ?? "";
}

describe("emberSourceAliases", () => {
  it("aliases each provided package into ember-source", async () => {
    await fixture();

    expect(emberSourceAliases()).toEqual({
      "@ember/modifier": "ember-source/@ember/modifier",
      "@ember/-internals": "ember-source/@ember/-internals",
      "@glimmer/runtime": "ember-source/@glimmer/runtime",
      rsvp: "ember-source/rsvp",
      ember: "ember-source/ember",
    });
  });

  it("has nothing to alias without ember-source in the graph", async () => {
    await fixture({ emberSource: false });

    expect(emberSourceAliases()).toEqual({});
  });
});

describe("emberBundle", () => {
  it("bundles a provided package's index and module files from the production build", async () => {
    const dir = await fixture();

    const code = await bundle(
      dir,
      `import { on } from "@ember/modifier";\nimport { on as onModule } from "@ember/modifier/on";\nexport { on, onModule };`,
    );

    expect(code).toContain(`"on from prod"`);
    expect(code).not.toContain(`from "@ember/modifier`);
  });

  it("follows the development condition", async () => {
    const dir = await fixture();

    const code = await bundle(dir, `export { on } from "@ember/modifier";`, {
      conditionNames: ["development"],
    });

    expect(code).toContain(`"on from dev"`);
  });

  it("keeps explicit aliases", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "mine.js"), `export const on = "mine";`);

    const code = await bundle(dir, `export { on } from "@ember/modifier";`, {
      alias: { "@ember/modifier": path.join(dir, "mine.js") },
    });

    expect(code).toContain(`"mine"`);
  });
});

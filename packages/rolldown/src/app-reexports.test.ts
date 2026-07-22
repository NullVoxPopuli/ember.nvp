import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { rolldown, type Plugin } from "rolldown";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appReexports, type AppReexportsOptions } from "./app-reexports.ts";

/**
 * The plugin reads and writes package.json relative to the current working
 * directory (matching the other plugins in this package), so each test runs
 * inside its own temp project.
 */
describe("appReexports", () => {
  let projectDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "app-reexports-"));

    await writeFile(
      join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "my-lib",
          version: "1.0.0",
          "ember-addon": { version: 2, type: "addon" },
        },
        null,
        2,
      ) + "\n",
    );

    await mkdir(join(projectDir, "src/components"), { recursive: true });
    await mkdir(join(projectDir, "src/utils"), { recursive: true });
    await writeFile(
      join(projectDir, "src/components/foo.js"),
      "export default function foo() {}\n",
    );
    await writeFile(
      join(projectDir, "src/utils/math.js"),
      "export function add(a, b) { return a + b; }\n",
    );

    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(projectDir, { recursive: true, force: true });
  });

  async function build(
    include?: string | string[] | AppReexportsOptions,
    options?: Omit<AppReexportsOptions, "include">,
  ) {
    const bundle = await rolldown({
      input: {
        "components/foo": "./src/components/foo.js",
        "utils/math": "./src/utils/math.js",
      },
      plugins: [appReexports(include, options)],
    });

    await bundle.write({ dir: "dist" });
    await bundle.close();
  }

  async function readJson(path: string) {
    return JSON.parse(await readFile(path, "utf8"));
  }

  it("writes _app_ re-exports and records them in package.json", async () => {
    await build({ include: ["components/**"] });

    expect(await readFile("dist/_app_/components/foo.js", "utf8")).toMatchInlineSnapshot(`
      "export { default } from "my-lib/components/foo";
      "
    `);

    const manifest = await readJson("package.json");

    expect(manifest["ember-addon"]).toMatchInlineSnapshot(`
      {
        "app-js": {
          "./components/foo.js": "./dist/_app_/components/foo.js",
        },
        "type": "addon",
        "version": 2,
      }
    `);

    // utils/math.js didn't match include
    await expect(stat("dist/_app_/utils/math.js")).rejects.toThrow();
  });

  it("accepts a string argument as the include glob", async () => {
    await build("components/**");

    const manifest = await readJson("package.json");

    expect(Object.keys(manifest["ember-addon"]["app-js"])).toEqual(["./components/foo.js"]);
  });

  it("accepts an array of include globs", async () => {
    await build(["components/**", "utils/**"]);

    const manifest = await readJson("package.json");

    expect(Object.keys(manifest["ember-addon"]["app-js"])).toEqual([
      "./components/foo.js",
      "./utils/math.js",
    ]);
  });

  it("accepts options as the second argument alongside a string or array include", async () => {
    await build("**/*.js", { exclude: ["utils/**"] });

    let manifest = await readJson("package.json");

    expect(Object.keys(manifest["ember-addon"]["app-js"])).toEqual(["./components/foo.js"]);

    await build(["components/**", "utils/**"], {
      mapFilename: (name) => name.replace("math", "arithmetic"),
    });

    manifest = await readJson("package.json");

    expect(manifest["ember-addon"]["app-js"]).toEqual({
      "./components/foo.js": "./dist/_app_/components/foo.js",
      "./utils/arithmetic.js": "./dist/_app_/utils/arithmetic.js",
    });
  });

  it("defaults to top-level services", async () => {
    await mkdir(join(projectDir, "src/services/nested"), { recursive: true });
    await writeFile(join(projectDir, "src/services/session.js"), "export default class {}\n");
    await writeFile(join(projectDir, "src/services/nested/deep.js"), "export default class {}\n");

    const bundle = await rolldown({
      input: {
        "components/foo": "./src/components/foo.js",
        "services/session": "./src/services/session.js",
        "services/nested/deep": "./src/services/nested/deep.js",
      },
      plugins: [appReexports()],
    });

    await bundle.write({ dir: "dist" });
    await bundle.close();

    const manifest = await readJson("package.json");

    // services/* is not deep: nested services (and everything else) stay out
    expect(manifest["ember-addon"]["app-js"]).toEqual({
      "./services/session.js": "./dist/_app_/services/session.js",
    });
  });

  it("respects exclude", async () => {
    await build({ include: ["**/*.js"], exclude: ["utils/**"] });

    const manifest = await readJson("package.json");

    expect(Object.keys(manifest["ember-addon"]["app-js"])).toEqual(["./components/foo.js"]);
  });

  it("supports mapFilename and custom exports", async () => {
    await build({
      include: ["utils/**"],
      mapFilename: (name) => name.replace("math", "arithmetic"),
      exports: () => ["add"],
    });

    expect(await readFile("dist/_app_/utils/arithmetic.js", "utf8")).toMatchInlineSnapshot(`
      "export { add } from "my-lib/utils/math";
      "
    `);

    const manifest = await readJson("package.json");

    expect(manifest["ember-addon"]["app-js"]).toMatchInlineSnapshot(`
      {
        "./utils/arithmetic.js": "./dist/_app_/utils/arithmetic.js",
      }
    `);
  });

  it("never re-exports .d.ts files", async () => {
    const emitDeclaration: Plugin = {
      name: "test:emit-declaration",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "components/foo.d.ts",
          source: "declare const foo: () => void;\nexport default foo;\n",
        });
      },
    };

    const bundle = await rolldown({
      input: { "components/foo": "./src/components/foo.js" },
      plugins: [emitDeclaration, appReexports({ include: ["**/*"] })],
    });

    await bundle.write({ dir: "dist" });
    await bundle.close();

    const manifest = await readJson("package.json");

    expect(Object.keys(manifest["ember-addon"]["app-js"])).toEqual(["./components/foo.js"]);
    await expect(stat("dist/_app_/components/foo.d.ts")).rejects.toThrow();
  });

  it("does not touch files whose content would be unchanged", async () => {
    await build({ include: ["components/**"] });

    const epoch = new Date(0);

    await utimes("package.json", epoch, epoch);
    await utimes("dist/_app_/components/foo.js", epoch, epoch);

    await build({ include: ["components/**"] });

    expect((await stat("package.json")).mtimeMs).toBe(0);
    expect((await stat("dist/_app_/components/foo.js")).mtimeMs).toBe(0);
  });

  it("leaves an equivalent package.json alone, regardless of formatting", async () => {
    await build({ include: ["components/**"] });

    // Same app-js map, different formatting: the plugin must not reformat.
    const reformatted =
      JSON.stringify(await readJson("package.json"), null, 4).replace(/\n/g, "\r\n") + "\r\n";

    await writeFile("package.json", reformatted);
    await build({ include: ["components/**"] });

    expect(await readFile("package.json", "utf8")).toBe(reformatted);
  });

  it("rewrites package.json when the app-js map changes", async () => {
    await build({ include: ["components/**"] });
    await build({ include: ["utils/**"] });

    const manifest = await readJson("package.json");

    expect(manifest["ember-addon"]["app-js"]).toEqual({
      "./utils/math.js": "./dist/_app_/utils/math.js",
    });
  });
});

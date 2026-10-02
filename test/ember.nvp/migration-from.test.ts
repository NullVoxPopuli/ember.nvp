import { describe, it, expect, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { rm } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { packageJson } from "ember-apply";
import { checkMigration, detectMigration, formatFindings, MigrationError } from "#migration-from";
import { Project } from "#utils/project.js";
import { cli, generate, mktemp } from "#test-helpers";
import type { ProjectType } from "#types";
import {
  addonBlueprint,
  appBlueprint,
  classicAddon,
  classicApp,
} from "./migration-from-fixtures.ts";

const FIXTURES = {
  "addon-blueprint": addonBlueprint,
  "app-blueprint": appBlueprint,
  "classic-build-app-blueprint": classicApp,
  "classic-build-addon-blueprint": classicAddon,
};

const dirs: string[] = [];

afterAll(async () => {
  if (process.env.CI) return;

  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

async function fixture(name: keyof typeof FIXTURES, files: Record<string, string> = {}) {
  let dir = await mktemp(`migration-from-${name}`);
  dirs.push(dir);

  for (let [file, contents] of Object.entries({ ...FIXTURES[name], ...files })) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), contents);
  }

  return dir;
}

async function migrate(directory: string, type: ProjectType, layers: string[]) {
  let { name } = await packageJson.read(directory);

  return generate({ directory, name, type, layers });
}

/**
 * @returns the titles of the unsupported findings, or undefined when the migration succeeds
 */
async function unsupported(directory: string, type: ProjectType) {
  try {
    await migrate(directory, type, []);
  } catch (error) {
    if (error instanceof MigrationError) {
      return error.findings.map((finding) => finding.title);
    }

    throw error;
  }
}

function read(directory: string, file: string) {
  return readFile(join(directory, file), "utf-8");
}

describe("detectMigration", () => {
  const cases = {
    "addon-blueprint": "@ember/addon-blueprint",
    "app-blueprint": "@ember/app-blueprint",
    "classic-build-app-blueprint": "@ember-tooling/classic-build-app-blueprint",
    "classic-build-addon-blueprint": "@ember-tooling/classic-build-addon-blueprint",
  };

  for (let [name, label] of Object.entries(cases)) {
    it(`detects ${label}`, async () => {
      let dir = await fixture(name as keyof typeof FIXTURES);

      expect(detectMigration(dir)?.label).toBe(label);
    });
  }

  for (let type of ["app", "library"] as const) {
    it(`detects nothing in a ${type} that ember.nvp generates`, async () => {
      let project = await generate({ type });
      dirs.push(project.directory);

      expect(detectMigration(project.directory)).toBe(undefined);
    });
  }
});

describe("@ember/addon-blueprint", () => {
  it("moves the build to tsdown", async () => {
    let dir = await fixture("addon-blueprint");

    await migrate(dir, "library", ["typescript", "qunit"]);

    for (let file of [
      "rollup.config.mjs",
      "babel.config.cjs",
      "babel.publish.config.cjs",
      "tsconfig.publish.json",
      "testem.cjs",
      "index.html",
      "demo-app",
      "unpublished-development-types",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let config = await read(dir, "tsdown.config.js");

    expect(config).toContain(`"./src/**/*.{js,ts,gjs,gts}"`);
    expect(config).toContain(
      `appReexports(["components/**/*.js", "helpers/**/*.js", "modifiers/**/*.js", "services/**/*.js"])`,
    );

    let manifest = await packageJson.read(dir);

    expect(manifest.type).toBe("module");
    expect(manifest.scripts.build).toBe("tsdown");
    expect(manifest.exports["."].types).toBe("./dist/index.d.ts");
    expect(manifest.files).not.toContain("declarations");
    expect(manifest["ember-addon"].main).toBe("addon-main.cjs");
    expect(manifest.devDependencies).not.toHaveProperty("@embroider/addon-dev");
    expect(manifest.devDependencies).not.toHaveProperty("rollup");
    expect(manifest.devDependencies).toHaveProperty("tsdown");
  });

  it("stops at .hbs templates and public assets, and changes nothing", async () => {
    let dir = await fixture("addon-blueprint", {
      "src/components/greeting.hbs": "Hello",
      "src/components/greeting.js": "export default class Greeting {}",
    });
    let rollup = await read(dir, "rollup.config.mjs");

    await writeFile(
      join(dir, "rollup.config.mjs"),
      rollup.replace("addon.clean(),", "addon.clean(),\n    addon.publicAssets('public'),"),
    );

    expect(await unsupported(dir, "library")).toEqual(["Templates in .hbs files", "Public assets"]);
    expect(existsSync(join(dir, "rollup.config.mjs"))).toBe(true);
  });
});

describe("@ember/app-blueprint", () => {
  it("moves the app off @embroider/compat", async () => {
    let dir = await fixture("app-blueprint");

    await migrate(dir, "app", ["typescript", "qunit"]);

    for (let file of [
      "ember-cli-build.mjs",
      "babel.config.mjs",
      "config/environment.js",
      "config/optional-features.json",
      "app/config/environment.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let html = await read(dir, "index.html");

    expect(html).not.toContain("content-for");
    expect(html).not.toContain("@embroider/virtual");
    expect(html).toContain(`<link rel="stylesheet" href="/app/styles/app.css" />`);
    expect(html).toContain(`import Application from "#app/app";`);

    let app = await read(dir, "app/app.ts");

    expect(app).toContain(`import "@warp-drive/ember/install";`);
    expect(app).toContain(`"./services/page-title": PageTitleService`);
    expect(app).toContain(`importSync("./deprecation-workflow");`);

    expect(await read(dir, "app/router.ts")).toContain(`import config from '#config';`);
    expect(await read(dir, "babel.config.js")).toContain("setConfig(config, {");

    let manifest = await packageJson.read(dir);

    expect(manifest.scripts.build).toBe("vite build");
    expect(manifest.devDependencies).not.toHaveProperty("ember-cli");
    expect(manifest.devDependencies).not.toHaveProperty("@embroider/compat");
    expect(manifest.devDependencies).toHaveProperty("@nullvoxpopuli/ember-vite");
  });

  it("stops at compat features, and changes nothing", async () => {
    let dir = await fixture("app-blueprint", {
      "app/components/greeting.hbs": "Hello",
      "vendor/legacy.js": "window.legacy = true;",
    });
    let build = await read(dir, "ember-cli-build.mjs");

    await writeFile(
      join(dir, "ember-cli-build.mjs"),
      build.replace("// Add options here", "sassOptions: {},"),
    );

    expect(await unsupported(dir, "app")).toEqual([
      "Templates in .hbs files",
      "Build settings in ember-cli-build",
      "Files in vendor/",
    ]);
    expect(existsSync(join(dir, "ember-cli-build.mjs"))).toBe(true);
  });

  it("reads the top level of node_modules, when there is one", async () => {
    let dir = await fixture("app-blueprint", {
      "node_modules/ember-cli-mirage/package.json": JSON.stringify({
        name: "ember-cli-mirage",
        version: "3.0.4",
        keywords: ["ember-addon"],
      }),
      // installed, but not a dependency of the app
      "node_modules/ember-fetch/package.json": JSON.stringify({
        name: "ember-fetch",
        version: "8.1.2",
        keywords: ["ember-addon"],
      }),
      "node_modules/@acme/session/package.json": JSON.stringify({
        name: "@acme/session",
        version: "1.0.0",
        keywords: ["ember-addon"],
        exports: { "./*": "./dist/*.js" },
        "ember-addon": {
          version: 2,
          "app-js": { "./services/session.js": "./dist/_app_/services/session.js" },
        },
      }),
    });

    await packageJson.addDevDependencies({ "@acme/session": "link:../session" }, dir);

    let project = new Project(dir, {
      name: "my-app",
      type: "app",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    expect((await checkMigration(project))?.report.unsupported).toEqual([]);

    await packageJson.addDevDependencies({ "ember-cli-mirage": "^3.0.0" }, dir);

    let report = (await checkMigration(project))?.report;

    expect(report?.unsupported.map((finding) => finding.where)).toEqual([
      ["ember-cli-mirage@3.0.4"],
    ]);

    await packageJson.removeDevDependencies(["ember-cli-mirage"], dir);
    await migrate(dir, "app", ["typescript"]);

    let app = await read(dir, "app/app.ts");

    expect(app).toContain(`import SessionService from "@acme/session/_app_/services/session";`);
    expect(app).toContain(`"./services/session": SessionService,`);
  });

  it("stops at an ember-source older than 7.2", async () => {
    let dir = await fixture("app-blueprint");

    await packageJson.modify((json) => {
      json.devDependencies["ember-source"] = "~6.4.0";
    }, dir);

    expect(await unsupported(dir, "app")).toEqual(["An ember-source older than 7.2"]);
  });
});

describe("@ember-tooling/classic-build-app-blueprint", () => {
  it("moves the app from ember-cli to Vite", async () => {
    let dir = await fixture("classic-build-app-blueprint");

    await migrate(dir, "app", ["typescript", "qunit"]);

    for (let file of ["ember-cli-build.js", "app/index.html", "testem.js", "types/global.d.ts"]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    let html = await read(dir, "index.html");

    expect(html).not.toContain("{{");
    expect(html).not.toContain("assets/vendor");
    expect(html).toContain(`<link rel="icon" href="/assets/favicon.png">`);
    expect(html).toContain(`import Application from "#app/app";`);

    expect(await read(dir, "tsconfig.json")).toContain("@ember/app-tsconfig");

    let manifest = await packageJson.read(dir);

    expect(manifest.devDependencies).not.toHaveProperty("ember-cli-app-version");
    expect(manifest.devDependencies).not.toHaveProperty("@tsconfig/ember");
  });
});

describe("testem configs", () => {
  it("lists browser flags that differ from the new testem config", async () => {
    let dir = await fixture("classic-build-app-blueprint", {
      "testem.js": classicApp["testem.js"]!.replace(
        "'--disable-software-rasterizer',",
        "'--use-gl=angle',",
      ),
    });
    let project = new Project(dir, {
      name: "my-classic-app",
      type: "app",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    let todo = (await checkMigration(project))?.report.todo ?? [];
    let flags = todo.find((finding) => finding.title.startsWith("Browser flags"));

    expect(flags?.where).toEqual([
      "--use-gl=angle: only in testem.js",
      "--disable-software-rasterizer: only in testem.cjs",
    ]);
  });
});

describe("@ember-tooling/classic-build-addon-blueprint", () => {
  it("makes a v2 addon that builds with tsdown", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "addon/components/greeting.gjs": "<template>Hello</template>",
      "addon/utils/shout.js":
        "import { quiet } from 'my-classic-addon/utils/quiet';\n\nexport const shout = (text) => quiet(text).toUpperCase();\n",
      "addon/utils/quiet.js": "export const quiet = (text) => text;\n",
      "addon-test-support/index.js": "export function setupGreeting() {}\n",
      "app/components/greeting.js":
        "export { default } from 'my-classic-addon/components/greeting';\n",
    });

    await migrate(dir, "library", ["qunit"]);

    for (let file of [
      "index.js",
      "ember-cli-build.js",
      "addon",
      "app",
      ".npmignore",
      "tests/dummy",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(false);
    }

    expect(await read(dir, "src/components/greeting.gjs")).toBe("<template>Hello</template>");
    expect(await read(dir, "src/utils/shout.js")).toContain(`from "./quiet.js";`);
    expect(existsSync(join(dir, "src/test-support/index.js"))).toBe(true);
    expect(await read(dir, "addon-main.cjs")).toContain("addonV1Shim");
    expect(existsSync(join(dir, ".prettierrc.cjs"))).toBe(true);
    expect(await read(dir, "tsdown.config.js")).toContain(
      `appReexports(["components/greeting.js"])`,
    );

    let manifest = await packageJson.read(dir);

    expect(manifest["ember-addon"]).toEqual({ version: 2, type: "addon", main: "addon-main.cjs" });
    expect(manifest.exports["./test-support"]).toBe("./dist/test-support/index.js");
    expect(manifest.dependencies).toHaveProperty("@embroider/addon-shim");
    expect(manifest.dependencies).not.toHaveProperty("ember-cli-babel");
  });

  it("keeps a dummy app with a demo of its own, and lists it", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "tests/dummy/app/router.js": `Router.map(function () {\n  this.route("docs");\n});\n`,
    });
    let project = new Project(dir, {
      name: "my-classic-addon",
      type: "library",
      path: dir,
      layers: [],
      packageManager: "pnpm",
    });

    let result = await checkMigration(project);

    expect(result?.report.todo.map((finding) => finding.title)).toContain("A dummy app");

    await migrate(dir, "library", []);

    expect(existsSync(join(dir, "tests/dummy/app/router.js"))).toBe(true);
  });

  it("stops at ember-cli hooks, and changes nothing", async () => {
    let dir = await fixture("classic-build-addon-blueprint", {
      "index.js": `'use strict';\n\nmodule.exports = {\n  name: require('./package').name,\n  included() {},\n  contentFor() {},\n};\n`,
      "addon/styles/addon.css": ".greeting {}",
    });

    expect(await unsupported(dir, "library")).toEqual([
      "ember-cli hooks in the addon's main file",
      "Styles that ember-cli merges into the app",
    ]);
    expect(existsSync(join(dir, "index.js"))).toBe(true);
  });
});

describe("the type question", () => {
  it("stops when the selected type differs from the blueprint's", async () => {
    let dir = await fixture("addon-blueprint");

    expect(await unsupported(dir, "app")).toEqual(["A library from @ember/addon-blueprint"]);
  });
});

describe("formatFindings", () => {
  it("numbers the findings and shortens long lists", () => {
    let where = Array.from({ length: 10 }, (_, i) => `app/components/c${i}.hbs`);

    expect(
      formatFindings([
        { title: "Templates in .hbs files", where, action: "Convert them.\nThe build needs it." },
        { title: "Public assets", action: "Import them." },
      ]),
    ).toMatchInlineSnapshot(`
      "1. Templates in .hbs files
         - app/components/c0.hbs
         - app/components/c1.hbs
         - app/components/c2.hbs
         - app/components/c3.hbs
         - app/components/c4.hbs
         - app/components/c5.hbs
         - app/components/c6.hbs
         - app/components/c7.hbs
         - and 2 more
         Convert them.
         The build needs it.

      2. Public assets
         Import them."
    `);
  });
});

describe("the CLI", () => {
  it("lists what to change, and writes nothing", async () => {
    let dir = await fixture("app-blueprint", { "app/components/greeting.hbs": "Hello" });
    let args = [
      "--name",
      "my-vite-app",
      "--path",
      dir,
      "--replaceOrUpdate",
      "update",
      "--type",
      "app",
      "--layers",
      "qunit",
      "--packageManager",
      "pnpm",
      "--confirm",
      "yes",
    ];

    let result = await cli(args)
      .execaPromise.then((res) => res)
      .catch((error) => error);
    let output = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`);

    expect(result.exitCode).toBe(1);
    expect(output).toContain("ember.nvp cannot migrate this project yet");
    expect(output).toContain("app/components/greeting.hbs");
    expect(existsSync(join(dir, "ember-cli-build.mjs"))).toBe(true);
  });
});

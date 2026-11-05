import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, reapply } from "#test-helpers";
import { layers } from "#layers";
import { KEYWORDS } from "../../src/layers/agents-md/index.js";
import { execa } from "execa";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

const agentsMd = layers.find((layer) => layer.name === "agents-md")!;

describe("agents-md layer, app with ssr", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ layers: ["agents-md", "ssr", "qunit"] });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await agentsMd.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("lists the project's scripts and import aliases", async () => {
    let agents = (await project.read("AGENTS.md"))!;
    let manifest = JSON.parse((await project.read("package.json"))!);

    for (let [name, script] of Object.entries(manifest.scripts)) {
      expect(agents).toContain(`- \`pnpm ${name}\`: \`${script}\``);
    }

    for (let alias of Object.keys(manifest.imports)) {
      expect(agents).toContain(`- \`${alias}\``);
    }
  });

  it("lists the checks in order", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain(`## Check your work

After a change, run these scripts in this order:

1. \`pnpm test\`
2. \`pnpm build\``);
  });

  it("has the sections of the app base and the qunit layer", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Modern Ember");
    expect(agents).toContain("## Project layout");
    expect(agents).toContain("- `app/app` registers the modules");
    expect(agents).toContain("## Tests (QUnit)");
  });

  it("has the section of the ssr layer", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Server-side rendering (vite-ember-ssr)");
    expect(agents).toContain("### 404 pages");
  });

  it("has no vite preview notes, because server.js serves the build", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).not.toContain("## Production build");
  });

  it("keeps text outside its section when it runs again", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    await writeFile(join(project.directory, "AGENTS.md"), `Before.\n\n${agents}\nAfter.\n`);

    await reapply(project, ["agents-md", "ssr", "qunit"]);

    let again = (await project.read("AGENTS.md"))!;

    expect(again.startsWith("Before.\n\n<!-- ember.nvp:start -->")).toBe(true);
    expect(again.trimEnd().endsWith("After.")).toBe(true);
    expect(again.match(/ember\.nvp:start/g)).toHaveLength(1);
  });
});

/**
 * A template that uses each keyword from AGENTS.md without an import.
 * Static mode renders it to dist/index.html at build time.
 */
const KEYWORDS_TEMPLATE = `const greet = (name) => \`Hi \${name}\`;

<template>
  <p id="eq">{{if (eq 1 1) "eq works"}}</p>
  <p id="logic">{{if (and true (not false) (or false true)) "logic works"}}</p>
  {{#let (fn greet "Ember") as |greetEmber|}}
    <p id="fn">{{(greetEmber)}}</p>
  {{/let}}
  <button type="button" {{on "click" greet}}>on works</button>
</template>
`;

describe("agents-md layer, template keywords", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      layers: ["agents-md", "ssr"],
      options: { ssr: { mode: "static" } },
    });

    await writeFile(join(project.directory, "app/templates/index.gjs"), KEYWORDS_TEMPLATE);
    await execa("pnpm install", { cwd: project.directory, shell: true });
    await execa("pnpm build", { cwd: project.directory, shell: true });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("uses every keyword that AGENTS.md lists", () => {
    for (let keyword of KEYWORDS) {
      expect(KEYWORDS_TEMPLATE, keyword).toMatch(new RegExp(`[({]${keyword} `));
    }
  });

  it("renders each keyword without an import", async () => {
    let html = (await project.read("dist/index.html"))!;

    expect(html).toContain("eq works");
    expect(html).toContain("logic works");
    expect(html).toContain("Hi Ember");
    expect(html).toContain("on works");
  });
});

describe("agents-md layer, library", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ type: "library", layers: ["agents-md"] });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup, with the library layout", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(await agentsMd.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
    expect(agents).toContain("An Ember library");
    expect(agents).toContain("- `src/` holds the source.");
    expect(agents).not.toContain("`app/app`");
  });
});

describe.each([
  { type: "extension" as const, line: "- `public/manifest.json` is the extension manifest." },
  { type: "custom-element" as const, line: "- `src/element` is the custom element." },
])("agents-md layer, $type", ({ type, line }) => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ type, layers: ["agents-md"] });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("has the layout of its base", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Project layout");
    expect(agents).toContain(line);
  });
});

describe("agents-md layer, app with vitest and typescript", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      layers: ["agents-md", "vitest", "typescript", "prettier"],
      options: { typescript: { version: "7" } },
    });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("checks lint, types, and tests, in order", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain(`1. \`pnpm lint\`
2. \`pnpm test\`
3. \`pnpm build\``);
  });

  it("has the sections of the vitest and typescript layers", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Tests (Vitest)");
    expect(agents).toContain("## Types");
    expect(agents).toContain("Imports of `.gts` and `.gjs` modules must include the extension.");
  });

  it("tells how vite preview serves the build", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Production build");
    expect(agents).toContain("`pnpm build`, then `pnpm preview`, serves the build on `$PORT`.");
    expect(agents).toContain(
      '"import.meta.env.API_URL": JSON.stringify(process.env.API_URL ?? ""),',
    );
  });
});

const FILTER_TESTS = `import { module, test } from "qunit";

module("Unit | alpha", function () {
  test("alpha one", function (assert) {
    assert.ok(true);
  });
});

module("Unit | beta", function () {
  test("beta one", function (assert) {
    assert.ok(true);
  });
});
`;

describe("agents-md layer, QUnit filter", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ layers: ["agents-md", "qunit"] });

    await writeFile(join(project.directory, "tests/unit/filter-test.js"), FILTER_TESTS);
    await execa("pnpm install", { cwd: project.directory, shell: true });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("runs only the matching tests with the commands from AGENTS.md", async () => {
    let agents = (await project.read("AGENTS.md"))!;
    let commands = agents
      .match(/```sh\n([\s\S]*?)```/)![1]!
      .trim()
      .split("\n")
      .map((line) => line.trim().replace("<text>", "beta"));

    let output = "";

    for (let command of commands) {
      output = (await execa(command, { cwd: project.directory, shell: true })).stdout;
    }

    expect(output).toContain("beta one");
    expect(output).not.toContain("alpha one");
    expect(output).toContain("# pass  1");
  });
});

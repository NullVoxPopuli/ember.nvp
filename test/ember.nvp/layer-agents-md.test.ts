import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, reapply } from "#test-helpers";
import { layers } from "#layers";
import { IMPORTS } from "../../src/layers/agents-md/index.js";
import { execa } from "execa";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

const agentsMd = layers.find((layer) => layer.name === "agents-md")!;

/**
 * Every name that IMPORTS brings in, so that a module can use them all.
 */
function importedNames() {
  let names: string[] = [];

  for (let match of IMPORTS.matchAll(/^import (\w+)?,? ?(?:\{([^}]*)\})? from/gm)) {
    if (match[1]) names.push(match[1]);

    for (let name of (match[2] ?? "").split(",")) {
      if (name.trim()) names.push(name.trim());
    }
  }

  return names;
}

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

  it("has the section of the ssr layer", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(agents).toContain("## Server-side rendering (vite-ember-ssr)");
    expect(agents).toContain("### 404 pages");
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

  it("lists imports that exist", async () => {
    let names = importedNames();

    expect(names).toContain("LinkTo");

    await writeFile(
      join(project.directory, "app/agents-imports.js"),
      `${IMPORTS}\n\nconsole.log(${names.join(", ")});\n`,
    );

    let app = (await project.read("app/app.js"))!;

    await writeFile(join(project.directory, "app/app.js"), `import "./agents-imports.js";\n${app}`);

    await execa("pnpm install", { cwd: project.directory, shell: true });

    let build = await execa("pnpm vite build", { cwd: project.directory, shell: true, all: true });

    expect(build.exitCode, build.all).toBe(0);
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

  it("is setup, without the app layout", async () => {
    let agents = (await project.read("AGENTS.md"))!;

    expect(await agentsMd.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
    expect(agents).toContain("An Ember library");
    expect(agents).not.toContain("## Project layout");
  });
});

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { layers } from "#layers";
import { execa } from "execa";
import { glob, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";
import type { ProjectType } from "#types";

/**
 * Generates projects with the icons layer, renders an icon from the template,
 * then type checks and builds them.
 */

const icons = layers.find((layer) => layer.name === "icons")!;

const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>`;

const TEMPLATES: Record<string, string> = {
  "svg-jar": `import Arrow from "#app/icons/arrow.svg";

<template>
  <Arrow class="icon" aria-hidden="true" />
</template>
`,
  "unplugin-icons": `import Check from "~icons/lucide/check";

<template>
  <Check class="icon" aria-hidden="true" />
</template>
`,
};

async function readBuilt(project: Project, pattern: string) {
  let contents = "";

  for await (let entry of glob(pattern, { cwd: project.directory })) {
    contents += await readFile(join(project.directory, entry), "utf-8");
  }

  return contents;
}

interface Case {
  type: ProjectType;
  layerNames: string[];
  tool: string;
  ssr?: { mode: string };
}

describe.each<Case>([
  { type: "app", layerNames: ["icons"], tool: "svg-jar" },
  { type: "app", layerNames: ["icons", "typescript"], tool: "svg-jar" },
  { type: "extension", layerNames: ["icons"], tool: "svg-jar" },
  { type: "app", layerNames: ["icons"], tool: "unplugin-icons" },
  { type: "app", layerNames: ["icons", "typescript"], tool: "unplugin-icons" },
  {
    type: "app",
    layerNames: ["icons", "ssr"],
    tool: "unplugin-icons",
    ssr: { mode: "static" },
  },
])("icons layer, $type with $layerNames and $tool", ({ type, layerNames, tool, ssr }) => {
  let project: Project;
  let built: string;

  beforeAll(async () => {
    project = await generate({
      type,
      layers: layerNames,
      options: ssr ? { icons: { tool }, ssr } : { icons: { tool } },
    });

    let application = ["gts", "gjs"]
      .map((ext) => `app/templates/application.${ext}`)
      .find((file) => project.hasFile(file))!;

    await writeFile(join(project.directory, application), TEMPLATES[tool]!);
    await mkdir(join(project.directory, "app/icons"), { recursive: true });
    await writeFile(join(project.directory, "app/icons/arrow.svg"), ARROW);

    await execa("pnpm install", { cwd: project.directory, shell: true });

    if (tool === "unplugin-icons") {
      await execa("pnpm add -D @iconify-json/lucide", { cwd: project.directory, shell: true });
    }

    await execa("pnpm build", { cwd: project.directory, shell: true });

    built = await readBuilt(project, "dist/**/*.{js,svg}");
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await icons.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it.runIf(ssr)("keeps the ssr layer set up", async () => {
    let ssrLayer = layers.find((layer) => layer.name === "ssr")!;

    expect(await ssrLayer.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it.runIf(ssr)("renders the icon into the prerendered page", async () => {
    expect(await project.read("dist/index.html")).toContain("M20 6L9 17l-5-5");
  });

  it("installs only the selected tool", async () => {
    let manifest = JSON.parse((await project.read("package.json"))!);
    let devDeps = Object.keys(manifest.devDependencies);

    expect(devDeps.includes("@svg-jar/plugin")).toBe(tool === "svg-jar");
    expect(devDeps.includes("unplugin-icons")).toBe(tool === "unplugin-icons");
  });

  it.runIf(tool === "svg-jar")("builds the icon into a sprite sheet", () => {
    expect(built).toMatch(/<symbol[^>]*id="[^"]+"[^>]*>\s*<path d="M5 12h14"/);
    expect(built).toMatch(/sprite-[\w-]+\.svg#/);
  });

  it.runIf(tool === "unplugin-icons")("builds the icon from the icon set", () => {
    expect(built).toContain("M20 6L9 17l-5-5");
    /**
     * An error message of the runtime template compiler.
     */
    expect(built).not.toContain("Invalid block parameters syntax");
  });

  it.runIf(layerNames.includes("typescript"))("type checks the icon import", async () => {
    let result = await execa("pnpm lint:types", {
      cwd: project.directory,
      shell: true,
      reject: false,
    });

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  });
});

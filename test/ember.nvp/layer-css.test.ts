import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { layers } from "#layers";
import { execa } from "execa";
import { glob, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";
import type { ProjectType } from "#types";

/**
 * Generates projects with the css layer, builds them,
 * and reads the build for the Tailwind utilities and the scoped classes that a template uses.
 */

const css = layers.find((layer) => layer.name === "css")!;

const TEMPLATE = `<template>
  <h1 class="text-3xl font-bold underline">Welcome to Ember</h1>
  <p class="greeting">Hello</p>

  <style scoped>
    .greeting {
      color: rebeccapurple;
    }
  </style>

  {{outlet}}
</template>
`;

const SCOPED_CLASS = /\.greeting_[0-9a-f]+/;

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
  tools: string[];
  ssr?: { mode: string };
}

describe.each<Case>([
  { type: "app", layerNames: ["css"], tools: ["tailwind", "scoped-css"] },
  { type: "extension", layerNames: ["css"], tools: ["tailwind", "scoped-css"] },
  {
    type: "app",
    layerNames: ["css", "ssr"],
    tools: ["tailwind", "scoped-css"],
    ssr: { mode: "static" },
  },
  { type: "app", layerNames: ["css"], tools: ["tailwind"] },
  { type: "app", layerNames: ["css"], tools: ["scoped-css"] },
])("css layer, $type with $layerNames and $tools", ({ type, layerNames, tools, ssr }) => {
  let project: Project;
  let builtCSS: string;

  beforeAll(async () => {
    project = await generate({
      type,
      layers: layerNames,
      options: ssr ? { css: { tools }, ssr } : { css: { tools } },
    });

    let application = ["gts", "gjs"]
      .map((ext) => `app/templates/application.${ext}`)
      .find((file) => project.hasFile(file))!;

    await writeFile(
      join(project.directory, application),
      tools.includes("scoped-css")
        ? TEMPLATE
        : TEMPLATE.replace(/\n {2}<style scoped>[^]*<\/style>\n/, ""),
    );

    await execa("pnpm install", { cwd: project.directory, shell: true });
    await execa("pnpm build", { cwd: project.directory, shell: true });

    builtCSS = await readBuilt(project, "dist/**/*.css");
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await css.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("installs only the selected tools", async () => {
    let manifest = JSON.parse((await project.read("package.json"))!);
    let devDeps = Object.keys(manifest.devDependencies);

    expect(devDeps.includes("tailwindcss")).toBe(tools.includes("tailwind"));
    expect(devDeps.includes("ember-scoped-css")).toBe(tools.includes("scoped-css"));
  });

  it.runIf(tools.includes("tailwind"))("builds the utilities that the template uses", () => {
    expect(builtCSS).toContain(".text-3xl");
    expect(builtCSS).toContain(".font-bold");
    /**
     * Preflight comes from `@import "tailwindcss"`, not from the utilities.
     */
    expect(builtCSS).toMatch(/box-sizing:\s*border-box/);
  });

  it.runIf(tools.includes("tailwind"))("links the built stylesheet from the page", async () => {
    expect(await project.read("dist/index.html")).toMatch(
      /<link rel="stylesheet"[^>]*href="[^"]*\.css"/,
    );
  });

  it.runIf(tools.includes("scoped-css"))("scopes the classes of the template", async () => {
    let builtJS = await readBuilt(project, "dist/**/*.js");
    let scoped = builtCSS.match(SCOPED_CLASS)?.[0];

    expect(scoped).toBeTruthy();
    expect(builtCSS).not.toMatch(/\.greeting\s*\{/);
    expect(builtJS).toContain(scoped!.slice(1));
  });
});

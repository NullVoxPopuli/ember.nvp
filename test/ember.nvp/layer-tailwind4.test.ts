import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { layers } from "#layers";
import { execa } from "execa";
import { glob, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";
import type { ProjectType } from "#types";

/**
 * Generates projects with the tailwind4 layer, builds them,
 * and reads the built CSS for the utilities that a template uses.
 */

const tailwind = layers.find((layer) => layer.name === "tailwind4")!;

const TEMPLATE = `<template>
  <h1 class="text-3xl font-bold underline">Welcome to Ember</h1>

  {{outlet}}
</template>
`;

async function builtCSS(project: Project) {
  let css = "";

  for await (let entry of glob("dist/**/*.css", { cwd: project.directory })) {
    css += await readFile(join(project.directory, entry), "utf-8");
  }

  return css;
}

describe.each([
  { type: "app", layerNames: ["tailwind4"] },
  { type: "extension", layerNames: ["tailwind4"] },
  { type: "app", layerNames: ["tailwind4", "ssr"], options: { ssr: { mode: "static" } } },
] as const)("tailwind4 layer, $type with $layerNames", ({ type, layerNames, options }) => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: type as ProjectType,
      layers: layerNames.slice(),
      options,
    });

    let application = ["gts", "gjs"]
      .map((ext) => `app/templates/application.${ext}`)
      .find((file) => project.hasFile(file))!;

    await writeFile(join(project.directory, application), TEMPLATE);

    await execa("pnpm install", { cwd: project.directory, shell: true });
    await execa("pnpm build", { cwd: project.directory, shell: true });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await tailwind.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("builds the utilities that the template uses", async () => {
    let css = await builtCSS(project);

    expect(css).toContain(".text-3xl");
    expect(css).toContain(".font-bold");
    /**
     * Preflight comes from `@import "tailwindcss"`, not from the utilities.
     */
    expect(css).toMatch(/box-sizing:\s*border-box/);
  });

  it("links the built stylesheet from the page", async () => {
    expect(await project.read("dist/index.html")).toMatch(
      /<link rel="stylesheet"[^>]*href="[^"]*\.css"/,
    );
  });
});

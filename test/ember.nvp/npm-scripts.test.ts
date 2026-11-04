import { beforeAll, describe, it, expect, afterAll } from "vitest";
import { generate } from "#test-helpers";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * A machine with npm can lack pnpm, so the scripts of an npm project must not call pnpm.
 */
describe("an npm project", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({
      type: "app",
      packageManager: "npm",
      layers: ["qunit", "prettier", "eslint-bundled"],
    });

    /**
     * The generator links the unpublished workspace packages with `link:`, which npm rejects.
     * For a directory, npm's `file:` is a symlink too.
     */
    let manifest = (await project.read("package.json"))!;

    await writeFile(
      join(project.directory, "package.json"),
      manifest.replaceAll('"link:', '"file:'),
    );

    let { exitCode, stderr } = await project.run("npm install --no-audit --no-fund");

    expect(exitCode, String(stderr)).toBe(0);
  });

  afterAll(async () => {
    if (process.env.CI) return;

    await rm(project.directory, { recursive: true, force: true });
  });

  it("has no pnpm in its scripts", async () => {
    let manifest = JSON.parse((await project.read("package.json"))!);

    for (let [name, script] of Object.entries(manifest.scripts)) {
      expect(script, name).not.toMatch(/\bpnpm\b/);
    }
  });

  it("runs npm test", async () => {
    let { exitCode, stdout, stderr } = await project.run("npm test");

    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  });
});

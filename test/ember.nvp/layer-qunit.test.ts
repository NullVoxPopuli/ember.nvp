import { describe, it, afterAll, expect } from "vitest";
import { generate } from "#test-helpers";
import { execa } from "execa";
import { rm } from "node:fs/promises";

/**
 * The replace-or-update question only matters when a project already exists
 * at the target path. These tests generate a project, assert the baseline
 * state, then regenerate over it the way the CLI does once the user has
 * answered the question, and assert the resulting project output is correct
 * for each answer.
 */
describe("layer: qunit", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("it boots and run tests", async () => {
    const project = await generate({ type: "app", layers: ["qunit"] });
    dirs.push(project.directory);

    let install = await execa("pnpm install", { cwd: project.directory, shell: true });
    expect(install.exitCode).toBe(0);

    let test = await execa("pnpm test", { cwd: project.directory, shell: true });
    expect(test.exitCode).toBe(0);
  });
});

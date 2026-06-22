import { describe, it, expect, afterAll } from "vitest";
import { generate, layers, expectIsSetup } from "#test-helpers";
import { generateProject } from "ember.nvp";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rimraf } from "rimraf";

/**
 * The replace-or-update question only matters when a project already exists
 * at the target path. These tests generate a project, assert the baseline
 * state, then regenerate over it the way the CLI does once the user has
 * answered the question, and assert the resulting project output is correct
 * for each answer.
 */
describe("generating over an existing project", () => {
  const prettier = layers.find((layer) => layer.name === "prettier")!;
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rimraf(dir, { maxRetries: 3, retryDelay: 100 });
    }
  });

  it("'update' regenerates in place, keeping unrelated files", async () => {
    const project = await generate({ type: "app", layers: ["prettier"] });
    dirs.push(project.directory);

    const userFile = join(project.directory, "my-untracked-file.txt");
    await writeFile(userFile, "the user added this");

    // Baseline: a valid project exists, with the desired layer and the
    // user's own file present.
    expect(existsSync(join(project.directory, "package.json")), "baseline package.json").toBe(true);
    expect(existsSync(userFile), "baseline user file").toBe(true);
    await expectIsSetup(project, prettier);

    await generateProject(project, "update");

    // After update: the pre-existing project and the user's file are
    // preserved, and it is still a valid, fully-set-up project.
    expect(existsSync(userFile), "unrelated file preserved by update").toBe(true);
    expect(existsSync(join(project.directory, "package.json"))).toBe(true);
    await expectIsSetup(project, prettier);
  });

  it("'replace' wipes the directory and produces a fresh project", async () => {
    const project = await generate({ type: "app", layers: ["prettier"] });
    dirs.push(project.directory);

    const userFile = join(project.directory, "my-untracked-file.txt");
    await writeFile(userFile, "the user added this");

    // Baseline: a valid project exists, with the desired layer and the
    // user's own file present.
    expect(existsSync(join(project.directory, "package.json")), "baseline package.json").toBe(true);
    expect(existsSync(userFile), "baseline user file").toBe(true);
    await expectIsSetup(project, prettier);

    await generateProject(project, "replace");

    // After replace: everything that was there before is gone, replaced by a
    // freshly generated, valid project with the desired layers.
    expect(existsSync(userFile), "stale file removed by replace").toBe(false);
    expect(existsSync(join(project.directory, "package.json"))).toBe(true);
    await expectIsSetup(project, prettier);
  });

  it("defaults to a non-destructive update when no answer is given", async () => {
    const project = await generate({ type: "app", layers: ["prettier"] });
    dirs.push(project.directory);

    const userFile = join(project.directory, "my-untracked-file.txt");
    await writeFile(userFile, "the user added this");

    // Baseline: a valid project exists, with the desired layer and the
    // user's own file present.
    expect(existsSync(join(project.directory, "package.json")), "baseline package.json").toBe(true);
    expect(existsSync(userFile), "baseline user file").toBe(true);
    await expectIsSetup(project, prettier);

    await generateProject(project);

    // After a no-arg regenerate: nothing is destroyed.
    expect(existsSync(userFile), "unrelated file preserved by default").toBe(true);
    expect(existsSync(join(project.directory, "package.json"))).toBe(true);
    await expectIsSetup(project, prettier);
  });
});

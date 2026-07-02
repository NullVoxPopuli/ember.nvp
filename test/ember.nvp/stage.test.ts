import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { Stage } from "ember.nvp";
import { mktemp } from "#test-helpers";

async function makeTargetProject() {
  const target = join(await mktemp("stage-target"), "my-app");

  await mkdir(join(target, "app"), { recursive: true });
  await mkdir(join(target, "node_modules/some-dep"), { recursive: true });
  await writeFile(join(target, "package.json"), `{ "name": "my-app" }`);
  await writeFile(join(target, "app/app.js"), `export default class App {}`);
  await writeFile(join(target, "tsconfig.json"), `{}`);
  await writeFile(join(target, "node_modules/some-dep/index.js"), `module.exports = 1;`);

  return target;
}

describe("Stage", () => {
  describe("a new project (target does not exist)", () => {
    it("stages writes without touching the target, then commits them", async () => {
      const target = join(await mktemp("stage-new"), "my-app");
      const stage = await Stage.create(target);

      expect(stage.isNew).toBe(true);

      await mkdir(join(stage.directory, "app"), { recursive: true });
      await writeFile(join(stage.directory, "package.json"), `{ "name": "my-app" }`);
      await writeFile(join(stage.directory, "app/app.js"), `export default class App {}`);

      expect(existsSync(target), "target is untouched while staged").toBe(false);

      const changes = await stage.changes();

      expect(changes).toEqual([
        { path: "app/app.js", status: "added" },
        { path: "package.json", status: "added" },
      ]);

      await stage.commit();

      expect(await readFile(join(target, "package.json"), "utf-8")).toBe(`{ "name": "my-app" }`);
      expect(existsSync(join(target, "app/app.js"))).toBe(true);
      expect(existsSync(stage.directory), "stage is cleaned up after commit").toBe(false);
    });

    it("carries a git repo initialized in the stage over to the target", async () => {
      const target = join(await mktemp("stage-git"), "my-app");
      const stage = await Stage.create(target);

      await writeFile(join(stage.directory, "readme.md"), `hi`);
      execSync("git init --initial-branch=main", { cwd: stage.directory, stdio: "pipe" });

      await stage.commit();

      expect(existsSync(join(target, ".git"))).toBe(true);
      expect(existsSync(join(target, "readme.md"))).toBe(true);
    });
  });

  describe("an existing project (seeded stage)", () => {
    it("seeds the target's files, excluding node_modules and .git", async () => {
      const target = await makeTargetProject();
      execSync("git init --initial-branch=main", { cwd: target, stdio: "pipe" });

      const stage = await Stage.create(target);

      expect(stage.isNew).toBe(false);
      expect(existsSync(join(stage.directory, "package.json"))).toBe(true);
      expect(existsSync(join(stage.directory, "app/app.js"))).toBe(true);
      expect(existsSync(join(stage.directory, "node_modules"))).toBe(false);
      expect(existsSync(join(stage.directory, ".git"))).toBe(false);

      await stage.discard();
    });

    it("detects added, modified, and deleted files", async () => {
      const target = await makeTargetProject();
      const stage = await Stage.create(target);

      await writeFile(join(stage.directory, ".prettierrc.js"), `export default {};`);
      await writeFile(join(stage.directory, "package.json"), `{ "name": "renamed" }`);
      await rm(join(stage.directory, "tsconfig.json"));

      const changes = await stage.changes();

      expect(changes).toEqual([
        { path: ".prettierrc.js", status: "added" },
        { path: "package.json", status: "modified" },
        { path: "tsconfig.json", status: "deleted" },
      ]);

      await stage.discard();
    });

    it("commit only touches changed paths, preserving node_modules and unrelated files", async () => {
      const target = await makeTargetProject();
      const stage = await Stage.create(target);

      await writeFile(join(stage.directory, "package.json"), `{ "name": "renamed" }`);
      await rm(join(stage.directory, "tsconfig.json"));

      await stage.commit();

      expect(await readFile(join(target, "package.json"), "utf-8")).toBe(`{ "name": "renamed" }`);
      expect(
        existsSync(join(target, "tsconfig.json")),
        "deleted in stage -> deleted in target",
      ).toBe(false);
      expect(existsSync(join(target, "app/app.js")), "unchanged files are untouched").toBe(true);
      expect(
        existsSync(join(target, "node_modules/some-dep/index.js")),
        "node_modules survives commit",
      ).toBe(true);
    });

    it("discard leaves the target exactly as it was", async () => {
      const target = await makeTargetProject();
      const stage = await Stage.create(target);

      await writeFile(join(stage.directory, "package.json"), `{ "name": "renamed" }`);

      await stage.discard();

      expect(await readFile(join(target, "package.json"), "utf-8")).toBe(`{ "name": "my-app" }`);
      expect(existsSync(stage.directory)).toBe(false);
    });

    it("reports no changes when nothing was modified", async () => {
      const target = await makeTargetProject();
      const stage = await Stage.create(target);

      expect(await stage.changes()).toEqual([]);

      await stage.discard();
    });
  });

  describe("diff", () => {
    it("renders a unified diff for added, modified, and deleted files", async () => {
      const target = await makeTargetProject();
      const stage = await Stage.create(target);

      await writeFile(join(stage.directory, ".prettierrc.js"), `export default {};`);
      await writeFile(join(stage.directory, "package.json"), `{ "name": "renamed" }`);
      await rm(join(stage.directory, "tsconfig.json"));

      const diff = await stage.diff();

      expect(diff).toContain(`+++ b/.prettierrc.js`);
      expect(diff).toContain(`+export default {};`);

      expect(diff).toContain(`--- a/package.json`);
      expect(diff).toContain(`-{ "name": "my-app" }`);
      expect(diff).toContain(`+{ "name": "renamed" }`);

      expect(diff).toContain(`--- a/tsconfig.json`);
      expect(diff).toContain(`+++ /dev/null`);

      await stage.discard();
    });
  });
});

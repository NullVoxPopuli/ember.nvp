import { describe, it, expect, afterAll } from "vitest";
import { generate, mktemp } from "#test-helpers";
import { detectProjectType } from "#bases";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProjectType } from "#types";

const dirs: string[] = [];

afterAll(async () => {
  if (process.env.CI) return;

  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

async function fixture(files: Record<string, string>) {
  let dir = await mktemp("detect-project-type");
  dirs.push(dir);

  for (let [file, contents] of Object.entries(files)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), contents);
  }

  return dir;
}

describe("detectProjectType", () => {
  const types: ProjectType[] = ["app", "library", "extension", "custom-element", "widget"];

  for (const type of types) {
    it(`detects a generated ${type}`, async () => {
      const project = await generate({ type });
      dirs.push(project.directory);

      expect(detectProjectType(project.directory)).toBe(type);
    });
  }

  it("detects a v2 addon with a docs app as a library", async () => {
    const dir = await fixture({
      "package.json": JSON.stringify({ "ember-addon": { version: 2, type: "addon" } }),
      "index.html": "<!doctype html>",
      "src/index.ts": "",
    });

    expect(detectProjectType(dir)).toBe("library");
  });

  it("detects a classic addon as a library", async () => {
    const dir = await fixture({
      "package.json": JSON.stringify({ keywords: ["ember-addon"] }),
      "addon/index.js": "",
      "app/index.js": "",
    });

    expect(detectProjectType(dir)).toBe("library");
  });

  it("detects a vite app", async () => {
    const dir = await fixture({
      "package.json": JSON.stringify({ "ember-addon": { version: 2, type: "app" } }),
      "index.html": "<!doctype html>",
    });

    expect(detectProjectType(dir)).toBe("app");
  });

  it("detects an app with a web app manifest as an app", async () => {
    const dir = await fixture({
      "package.json": "{}",
      "app/app.ts": "",
      "public/manifest.json": JSON.stringify({ name: "my-pwa", display: "standalone" }),
    });

    expect(detectProjectType(dir)).toBe("app");
  });

  it("makes no guess for a project it does not know", async () => {
    const dir = await fixture({ "package.json": JSON.stringify({ name: "a-node-script" }) });

    expect(detectProjectType(dir)).toBe(undefined);
  });
});

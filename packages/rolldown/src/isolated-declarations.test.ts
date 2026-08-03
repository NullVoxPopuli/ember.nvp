import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "tsdown";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "../index.ts";

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/**
 * Runs a real tsdown build of a single trivial entry in a temp dir, so the
 * isolated-declarations guard reads the tsconfig files written by the test the
 * same way it does under the tsdown CLI. Returns the build's rejection, or
 * `undefined` when it succeeded.
 */
async function buildFixture(
  files: Record<string, string>,
  tsconfig?: string | boolean,
): Promise<Error | undefined> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-isolated-declarations-"));

  const withDefaults: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.0.0", type: "module" }),
    "src/index.ts": `export const greeting: string = 'hello';`,
    ...files,
  };

  for (const [relative, source] of Object.entries(withDefaults)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, source, "utf8");
  }

  const previousCwd = process.cwd();
  process.chdir(dir);
  restoreCwd = () => process.chdir(previousCwd);

  try {
    await build({
      entry: ["./src/index.ts"],
      config: false,
      logLevel: "silent",
      tsconfig,
      plugins: [ember()],
    });

    return undefined;
  } catch (error) {
    return error as Error;
  }
}

const withFlag = JSON.stringify({
  compilerOptions: { isolatedDeclarations: true, declaration: true },
});
const withoutFlag = JSON.stringify({ compilerOptions: { declaration: true } });

describe("isolated declarations guard", () => {
  it("errors when the cwd tsconfig.json does not set the flag", async () => {
    const error = await buildFixture({ "tsconfig.json": withoutFlag });

    expect(error?.message).toContain(`must set "compilerOptions.isolatedDeclarations": true`);
  });

  it("passes when the cwd tsconfig.json sets the flag", async () => {
    expect(await buildFixture({ "tsconfig.json": withFlag })).toBeUndefined();
  });

  it("checks the tsconfig the `tsconfig` option points at, not tsconfig.json", async () => {
    // The shape a library with in-package dev code wants: a permissive
    // tsconfig.json for editors and `tsc --noEmit` over everything, and a
    // publish-only tsconfig -- the one the build uses -- carrying the flag.
    const error = await buildFixture(
      { "tsconfig.json": withoutFlag, "tsconfig.publish.json": withFlag },
      "./tsconfig.publish.json",
    );

    expect(error).toBeUndefined();
  });

  it("errors when the tsconfig the `tsconfig` option points at lacks the flag", async () => {
    const error = await buildFixture(
      { "tsconfig.json": withFlag, "tsconfig.publish.json": withoutFlag },
      "./tsconfig.publish.json",
    );

    expect(error?.message).toContain("tsconfig.publish.json");
    expect(error?.message).toContain(`must set "compilerOptions.isolatedDeclarations": true`);
  });

  it("resolves a directory `tsconfig` option to the tsconfig.json inside it", async () => {
    const error = await buildFixture(
      { "tsconfig.json": withFlag, "config/tsconfig.json": withoutFlag },
      "./config",
    );

    expect(error?.message).toContain(`must set "compilerOptions.isolatedDeclarations": true`);
  });

  it("skips the check when there is no tsconfig at all", async () => {
    expect(await buildFixture({})).toBeUndefined();
  });

  it("skips the check when tsconfig is disabled", async () => {
    expect(await buildFixture({ "tsconfig.json": withoutFlag }, false)).toBeUndefined();
  });

  it("inherits the flag through an extends chain", async () => {
    const error = await buildFixture({
      "tsconfig.base.json": withFlag,
      "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
    });

    expect(error).toBeUndefined();
  });
});

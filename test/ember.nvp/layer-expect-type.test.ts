import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, expectIsSetup, layers } from "#test-helpers";
import { writeLibrarySource } from "./library-src-fixtures.ts";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Project } from "ember.nvp";

const expectType = layers.find((layer) => layer.name === "expect-type")!;

async function typecheck(project: Project) {
  return execa("pnpm lint:type-tests", {
    cwd: project.directory,
    shell: true,
    all: true,
    reject: false,
  });
}

describe("layer: expect-type", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("TypeScript library", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        layers: ["typescript", "expect-type"],
      });
      dirs.push(project.directory);

      await writeLibrarySource(project, "typescript");

      let install = await execa("pnpm install", { cwd: project.directory, shell: true });
      expect(install.exitCode).toBe(0);
    });

    it("is setup", async () => {
      await expectIsSetup(project, expectType);
    });

    it("the generated type tests pass", async () => {
      let result = await typecheck(project);

      expect(result.exitCode, result.all).toBe(0);
    });

    it("checks the library's real exports", async () => {
      await writeFile(
        join(project.directory, "type-tests/math.test.ts"),
        `import { expectTypeOf } from "expect-type";
import { add } from "../src/index.ts";

expectTypeOf(add).parameters.toEqualTypeOf<[number, number]>();
expectTypeOf(add).returns.toEqualTypeOf<number>();
`,
      );

      let result = await typecheck(project);

      expect(result.exitCode, result.all).toBe(0);
    });

    it("fails on a wrong type assertion", async () => {
      await writeFile(
        join(project.directory, "type-tests/wrong.test.ts"),
        `import { expectTypeOf } from "expect-type";
import { add } from "../src/index.ts";

expectTypeOf(add).returns.toEqualTypeOf<string>();
`,
      );

      let result = await typecheck(project);

      expect(result.exitCode).not.toBe(0);
      expect(result.all).toContain("wrong.test.ts");
    });

    it("keeps type tests out of the build", async () => {
      await rm(join(project.directory, "type-tests/wrong.test.ts"));

      let build = await execa("pnpm build", { cwd: project.directory, shell: true });
      expect(build.exitCode).toBe(0);

      expect(existsSync(join(project.directory, "dist/type-tests"))).toBe(false);
    });
  });

  describe("JavaScript library", () => {
    it("adds nothing (no declarations to test)", async () => {
      let project = await generate({ type: "library", name: "my-lib", layers: ["expect-type"] });
      dirs.push(project.directory);

      await expectIsSetup(project, expectType);

      expect(existsSync(join(project.directory, "type-tests"))).toBe(false);
      expect(await project.read("package.json")).not.toContain("expect-type");
    });
  });
});

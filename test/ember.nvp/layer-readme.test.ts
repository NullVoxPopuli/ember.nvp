import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generate } from "#test-helpers";
import { rm } from "node:fs/promises";
import type { Project } from "ember.nvp";
import { renderTemplate } from "#utils/readme.js";

describe("layer: readme", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  describe("renderTemplate token substitution", () => {
    it("substitutes @@NAME@@, @@TYPE@@, @@PM@@, @@RUN@@ for pnpm", () => {
      const mockProject = {
        name: "my-cool-app",
        type: "app",
        packageManager: "pnpm",
      } as unknown as Project;

      const template = "Name: @@NAME@@ | Type: @@TYPE@@ | PM: @@PM@@ | Run: @@RUN@@";
      const result = renderTemplate(template, mockProject);

      expect(result).toBe("Name: my-cool-app | Type: app | PM: pnpm | Run: pnpm");
    });

    it("substitutes @@RUN@@ for npm", () => {
      const mockProject = {
        name: "my-cool-lib",
        type: "library",
        packageManager: "npm",
      } as unknown as Project;

      const template = "Run: @@RUN@@";
      const result = renderTemplate(template, mockProject);

      expect(result).toBe("Run: npm run");
    });
  });

  describe("App project README generation", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "app",
        name: "my-app",
        packageManager: "pnpm",
        layers: ["readme", "git", "prettier", "typescript"],
      });
      dirs.push(project.directory);
    });

    it("generates README.md with project info and selected layer docs", async () => {
      expect(project.hasFile("README.md")).toBe(true);

      const readmeContent = await project.read("README.md");
      expect(readmeContent).toBeDefined();

      expect(readmeContent).toContain("# my-app");
      expect(readmeContent).toContain("pnpm install");
      expect(readmeContent).toContain("pnpm dev");
      expect(readmeContent).toContain("## Features & Tooling");
      expect(readmeContent).toContain("### Prettier");
      expect(readmeContent).toContain("### TypeScript");
      expect(readmeContent).toContain("pnpm format");
      expect(readmeContent).toContain("pnpm lint:types");
    });
  });

  describe("Library project README generation with npm", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "library",
        name: "my-lib",
        packageManager: "npm",
        layers: ["readme", "prettier"],
      });
      dirs.push(project.directory);
    });

    it("generates README.md with npm-specific commands for library", async () => {
      expect(project.hasFile("README.md")).toBe(true);

      const readmeContent = await project.read("README.md");
      expect(readmeContent).toBeDefined();

      expect(readmeContent).toContain("# my-lib");
      expect(readmeContent).toContain("npm run build");
      expect(readmeContent).toContain("### Prettier");
      expect(readmeContent).toContain("npm run format");
    });
  });
});

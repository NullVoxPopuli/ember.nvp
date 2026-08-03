import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generate } from "#test-helpers";
import { rm } from "node:fs/promises";
import type { Project } from "ember.nvp";

describe("layer: readme", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
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
      expect(await project.read("README.md")).toMatchInlineSnapshot(`
        "# my-app

        An Ember application created with \`ember.nvp\`.

        ## Getting Started

        ### Prerequisites

        - Node.js >= 24
        - pnpm

        ### Installation

        ~~~sh
        pnpm install
        ~~~

        ### Development

        To start the local development server:

        ~~~sh
        pnpm dev
        ~~~

        or

        ~~~sh
        pnpm start
        ~~~

        ## Features & Tooling

        ### Prettier

        Code formatting is managed with [Prettier](https://prettier.io/).

        - \`pnpm format\` - Format code
        - \`pnpm lint:prettier\` - Check code formatting

        ### TypeScript

        This project uses TypeScript and Glint for static type checking.

        - \`pnpm lint:types\` - Typecheck code with Glint/TypeScript
        "
      `);
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
      expect(await project.read("README.md")).toMatchInlineSnapshot(`
        "# my-lib

        An Ember library/addon created with \`ember.nvp\`.

        ## Getting Started

        ### Prerequisites

        - Node.js >= 24
        - npm

        ### Development & Building

        To build the library:

        ~~~sh
        npm run build
        ~~~

        ## Features & Tooling

        ### Prettier

        Code formatting is managed with [Prettier](https://prettier.io/).

        - \`npm run format\` - Format code
        - \`npm run lint:prettier\` - Check code formatting
        "
      `);
    });
  });

  describe("Extension project README generation", () => {
    let project: Project;

    beforeAll(async () => {
      project = await generate({
        type: "extension",
        name: "my-extension",
        packageManager: "pnpm",
        layers: ["readme", "prettier"],
      });
      dirs.push(project.directory);
    });

    it("generates README.md for browser extension project", async () => {
      expect(await project.read("README.md")).toMatchInlineSnapshot(`
        "# my-extension

        A browser extension using Ember created with \`ember.nvp\`.

        ## Getting Started

        ### Prerequisites

        - Node.js >= 24
        - pnpm

        ### Development

        To start development:

        ~~~sh
        pnpm dev
        ~~~

        or

        ~~~sh
        pnpm start
        ~~~

        ### Building

        To build the library:

        ~~~sh
        pnpm build
        ~~~

        or

        ~~~sh
        pnpm build:watch
        ~~~

        ## Features & Tooling

        ### Prettier

        Code formatting is managed with [Prettier](https://prettier.io/).

        - \`pnpm format\` - Format code
        - \`pnpm lint:prettier\` - Check code formatting
        "
      `);
    });
  });
});

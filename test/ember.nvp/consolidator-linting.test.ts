import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { maybeLintWithConcurrently } from "#consolidators/linting.js";
import { Project } from "#utils/project.js";

async function scriptsAfter(scripts: Record<string, string>) {
  let directory = await mkdtemp(join(tmpdir(), "ember-nvp-linting-"));

  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "app", scripts }));
  await maybeLintWithConcurrently(new Project(directory, { packageManager: "pnpm" } as never));

  return JSON.parse(await readFile(join(directory, "package.json"), "utf-8")).scripts;
}

describe("maybeLintWithConcurrently", () => {
  it("runs format after lint:fix only when the project has a format script", async () => {
    expect(await scriptsAfter({ "lint:eslint": "eslint .", "lint:hbs": "ember-template-lint ." }))
      .toMatchInlineSnapshot(`
      {
        "lint": "concurrently "pnpm:lint:*(!fix)" --names "lint:" --prefixColors auto",
        "lint:eslint": "eslint .",
        "lint:fix": "concurrently "pnpm:lint:*:fix" --names "fix:" --prefixColors auto",
        "lint:hbs": "ember-template-lint .",
      }
    `);

    expect(
      await scriptsAfter({
        "lint:eslint": "eslint .",
        "lint:prettier": "prettier --check .",
        format: "prettier --write .",
      }),
    ).toMatchInlineSnapshot(`
      {
        "format": "prettier --write .",
        "lint": "concurrently "pnpm:lint:*(!fix)" --names "lint:" --prefixColors auto",
        "lint:eslint": "eslint .",
        "lint:fix": "concurrently "pnpm:lint:*:fix" --names "fix:" --prefixColors auto && pnpm format",
        "lint:prettier": "prettier --check .",
      }
    `);
  });
});

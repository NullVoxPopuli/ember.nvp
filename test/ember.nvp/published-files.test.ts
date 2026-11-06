import { describe, it, expect } from "vitest";
import { execa } from "execa";
import { globSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

/**
 * Generated projects come from the files of the published package.
 *
 * npm leaves some files out of a package, for example every `.gitignore`.
 * The exclusions are the same as when a base copies its files.
 */
describe("the published package", () => {
  it("has the files of every base", async () => {
    let { stdout } = await execa("pnpm", ["pack", "--dry-run", "--json"], { cwd: root });
    let published = new Set<string>();

    for (let file of JSON.parse(stdout).files as { path: string }[]) {
      published.add(file.path);
    }

    let missing = globSync(["src/bases/*/files/**/*", "src/bases/*/files/**/.*"], {
      cwd: root,
      exclude: ["**/node_modules", "**/dist"],
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
      .filter((path) => !published.has(path));

    expect(missing).toEqual([]);
  });
});

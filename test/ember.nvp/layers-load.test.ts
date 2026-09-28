import { test, expect } from "vitest";
import { execa } from "execa";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

/**
 * vitest runs modules through its own loader,
 * so it does not see import cycles the way Node does.
 *
 * `#layers` awaits a dynamic import of each layer at the top level.
 * If a layer imports a module that imports `#layers` back,
 * the top-level await never settles and Node exits with code 13.
 *
 * Node's loader is the only thing that catches that,
 * so load the module in a child process.
 */
test("the layers module loads in a plain node process", async () => {
  const result = await execa(process.execPath, ["src/layers/index.js"], {
    cwd: root,
    reject: false,
  });

  expect(result.stderr).not.toContain("unsettled top-level await");
  expect(result.exitCode).toBe(0);
});

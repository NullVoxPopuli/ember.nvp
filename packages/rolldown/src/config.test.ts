import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rolldown, type InputOptions } from "rolldown";
import { describe, expect, it } from "vitest";

import { emberConfig } from "./config.ts";

/**
 * A module pair shaped like babel's template-compilation output: an imported
 * constant referenced from a `precompileTemplate` scope object. The constant's
 * value is shorter than its name — the case rolldown's default constant
 * inlining (`optimization.inlineConst`, `mode: "smart"`) substitutes, turning
 * `scope: () => ({ EMPTY })` into `scope: () => ({ EMPTY: "—" })`. Scope
 * entries must be direct references to in-scope values, so the consuming app's
 * template compiler rejects the substituted form.
 */
async function scopeFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-config-"));

  await writeFile(path.join(dir, "constants.js"), `export const EMPTY = "—";\n`);
  await writeFile(
    path.join(dir, "entry.js"),
    `import { setComponentTemplate } from "@ember/component";\n` +
      `import templateOnly from "@ember/component/template-only";\n` +
      `import { precompileTemplate } from "@ember/template-compilation";\n` +
      `import { EMPTY } from "./constants.js";\n` +
      `export const X = setComponentTemplate(precompileTemplate("{{EMPTY}}", {\n` +
      `  strictMode: true,\n` +
      `  scope: () => ({\n` +
      `    EMPTY\n` +
      `  })\n` +
      `}), templateOnly());\n`,
  );

  return dir;
}

async function buildScopeFixture(options: Partial<InputOptions> = {}): Promise<string> {
  const dir = await scopeFixture();
  const build = await rolldown({
    input: path.join(dir, "entry.js"),
    external: /^@ember\//,
    ...options,
  });
  const { output } = await build.generate({});
  return output[0].code;
}

describe("emberConfig", () => {
  it("documents the rolldown default this guards against: short constants inline into scope objects", async () => {
    // If this starts preserving the reference, rolldown changed its default
    // and the guard below may no longer be needed.
    const code = await buildScopeFixture();
    expect(code).toContain(`scope: () => ({ EMPTY: "—" })`);
  });

  it("keeps scope-object constants as references", async () => {
    const code = await buildScopeFixture({ plugins: [emberConfig()] });
    expect(code).toContain(`scope: () => ({ EMPTY })`);
  });

  it("an explicit optimization.inlineConst still wins", async () => {
    const code = await buildScopeFixture({
      plugins: [emberConfig()],
      optimization: { inlineConst: { mode: "smart" } },
    });
    expect(code).toContain(`scope: () => ({ EMPTY: "—" })`);
  });

  it("leaves other explicit optimization options alone while defaulting inlineConst off", async () => {
    const code = await buildScopeFixture({
      plugins: [emberConfig()],
      optimization: { pifeForModuleWrappers: false },
    });
    expect(code).toContain(`scope: () => ({ EMPTY })`);
  });
});

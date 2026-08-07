import { execa } from "execa";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * This package's own published shape: consumers write their build config in
 * TypeScript, so `import { ember } from "@nullvoxpopuli/ember-rolldown"` has to
 * carry types. Without them it is an implicit `any` (TS7016), and a config file
 * silently stops being type-checked.
 */
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Manifest {
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  publishConfig: { exports: Record<string, Record<string, string>> };
}

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as Manifest;
}

async function exists(relative: string) {
  return Boolean(await stat(path.join(packageDir, relative)).catch(() => null));
}

async function declarations() {
  const files = (await readdir(path.join(packageDir, "dist"))).filter((file) =>
    file.endsWith(".d.ts"),
  );

  return Object.fromEntries(
    await Promise.all(
      files.map(
        async (file) =>
          [file, await readFile(path.join(packageDir, "dist", file), "utf8")] as const,
      ),
    ),
  );
}

describe("published types", () => {
  beforeAll(async () => {
    // `clean` is on, but don't let these assertions depend on that: stale
    // artifacts from an earlier build satisfy every one of them on their own
    await rm(path.join(packageDir, "dist"), { recursive: true, force: true });
    await execa("pnpm", ["build"], { cwd: packageDir });
  }, 120_000);

  it("every publishConfig export declares types, and they exist", async () => {
    const manifest = await readManifest();
    const entries = Object.entries(manifest.publishConfig.exports);

    expect(entries.length).toBeGreaterThan(0);

    for (const [subpath, conditions] of entries) {
      expect(conditions, `${subpath} declares types`).toHaveProperty("types");
      expect(await exists(conditions["types"]!), `${subpath} -> ${conditions["types"]}`).toBe(true);
      expect(await exists(conditions["default"]!), `${subpath} -> ${conditions["default"]}`).toBe(
        true,
      );
    }
  });

  /**
   * A declaration may only reach for packages a consumer is guaranteed to have.
   * Reference a devDependency and there are two ways to lose, both quiet:
   * the specifier survives and consumers can't resolve it (`skipLibCheck` hides
   * that, degrading the type to an error type), or the declaration bundler
   * inlines the whole type surface — a ~200kB copy of rolldown's types, in the
   * case that prompted this test, nominally distinct from the consumer's own.
   *
   * `ember()` returns plugins, so `RolldownPluginLike` exists to keep rolldown
   * on the devDependency side of that line.
   */
  it("declarations only reference packages consumers have", async () => {
    const manifest = await readManifest();
    const available = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ]);

    for (const [file, contents] of Object.entries(await declarations())) {
      const specifiers = [...contents.matchAll(/^import .* from "([^"]+)";$/gm)]
        .map(([, specifier]) => specifier!)
        .filter((specifier) => !specifier.startsWith("."));

      for (const specifier of specifiers) {
        const owner = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0]!;

        expect(available, `${file} imports ${specifier}`).toContain(owner);
      }

      // an inlined copy of a bundler's types, rather than an import of them
      expect(contents, `${file} inlines rolldown's types`).not.toMatch(/interface PluginContext/);
    }
  });
});

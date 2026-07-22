import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "tsdown";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "../index.ts";

/**
 * Drives `ember()` through a real tsdown build (the dts pipeline included).
 * `files` is a map of relative path -> source, written into a temp dir that
 * becomes the cwd for the build (the externals and isolated-declarations
 * plugins read package.json / tsconfig.json from cwd, like the tsdown CLI).
 */
async function buildFixture(files: Record<string, string>, entry: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ember-rolldown-dts-"));

  const withDefaults: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "fixture",
      version: "0.0.0",
      type: "module",
      exports: { "./*": { types: "./dist/*.d.ts", default: "./dist/*.js" } },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: { isolatedDeclarations: true, declaration: true },
    }),
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

  await build({
    entry,
    config: false,
    logLevel: "silent",
    plugins: [ember()],
  });

  return dir;
}

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      out.push(path.relative(dir, path.join(entry.parentPath, entry.name)));
    }
  }
  return out.sort();
}

describe("declarations (full ember() via tsdown)", () => {
  it("emits .d.ts for an entry that type-imports from a non-entry .gts", async () => {
    // Mirrors the luna-core shape: the component is in the runtime graph via
    // the index entry, while a second entry (a service) only *type*-imports
    // from it. The service's declaration then references the component's
    // (virtual) .d.ts, which only exists in the bundler's module graph.
    const dir = await buildFixture(
      {
        "src/index.ts": `export { default as Popup } from './popup.gts';`,
        "src/service.ts": [
          `import type { PopupBlock } from './popup.gts';`,
          ``,
          `export class TooltipService {`,
          `  registerPopup(context: PopupBlock): void {`,
          `    void context;`,
          `  }`,
          `}`,
        ].join("\n"),
        "src/popup.gts": [
          `import Component from '@glimmer/component';`,
          ``,
          `export interface PopupBlock {`,
          `  open: () => void;`,
          `}`,
          ``,
          `export interface PopupSignature {`,
          `  Element: HTMLDivElement;`,
          `  Blocks: { default: [PopupBlock] };`,
          `}`,
          ``,
          `export default class Popup extends Component<PopupSignature> {`,
          `  <template>popup</template>`,
          `}`,
        ].join("\n"),
      },
      ["./src/index.ts", "./src/service.ts"],
    );

    const dist = await listFiles(path.join(dir, "dist"));

    expect(dist).toContain("index.d.ts");
    expect(dist).toContain("service.d.ts");

    const serviceDts = await readFile(path.join(dir, "dist/service.d.ts"), "utf8");

    // The PopupBlock type must be reachable: either inlined into the bundled
    // declaration or imported via a specifier that exists in dist.
    expect(serviceDts).toContain("PopupBlock");
    expect(serviceDts).not.toContain(".gts");
  });

  it("bundles co-located CSS (via @tsdown/css) without breaking declarations", async () => {
    // Ember components routinely import a co-located .css file. Without CSS
    // handling the build dies on tsdown's css-guard — and because the failing
    // component module never loads, every declaration that references it
    // dangles (surfacing as misleading UNLOADABLE_DEPENDENCY errors on
    // <component>.d.ts). @tsdown/css (this package's peer) makes both work.
    const dir = await buildFixture(
      {
        "src/index.ts": `export { default as Popup } from './popup.gts';`,
        "src/service.ts": [
          `import type { PopupBlock } from './popup.gts';`,
          ``,
          `export function register(context: PopupBlock): void {`,
          `  void context;`,
          `}`,
        ].join("\n"),
        "src/popup.css": `.popup { color: red; }`,
        "src/popup.gts": [
          `import './popup.css';`,
          `import Component from '@glimmer/component';`,
          ``,
          `export interface PopupBlock {`,
          `  open: () => void;`,
          `}`,
          ``,
          `export default class Popup extends Component {`,
          `  <template>popup</template>`,
          `}`,
        ].join("\n"),
      },
      ["./src/index.ts", "./src/service.ts"],
    );

    const dist = await listFiles(path.join(dir, "dist"));

    const cssFiles = dist.filter((file) => file.endsWith(".css"));
    expect(cssFiles).toHaveLength(1);

    const css = await readFile(path.join(dir, "dist", cssFiles[0]!), "utf8");
    expect(css).toContain(".popup");

    // The cascade regression: the css-importing component's declaration must
    // still be generated and reachable from the service's declaration.
    const serviceDts = await readFile(path.join(dir, "dist/service.d.ts"), "utf8");
    expect(serviceDts).toContain("PopupBlock");
    expect(serviceDts).not.toContain(".gts");
  });
});

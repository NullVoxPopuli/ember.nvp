import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "tsdown";
import { afterEach, describe, expect, it } from "vitest";

import { ember } from "../index.ts";

interface Dist {
  /** Sorted dist-relative paths of every emitted file. */
  files: string[];
  /** dist-relative path -> content, for every emitted .d.ts and .css file. */
  contents: Record<string, string>;
}

let restoreCwd: (() => void) | undefined;

afterEach(() => {
  restoreCwd?.();
  restoreCwd = undefined;
});

/**
 * Drives `ember()` through a real tsdown build (the dts pipeline included).
 * `files` is a map of relative path -> source, written into a temp dir that
 * becomes the cwd for the build (the externals and isolated-declarations
 * plugins read package.json / tsconfig.json from cwd, like the tsdown CLI).
 *
 * Returns the emitted file list plus the full contents of every declaration
 * and css file (js output is covered by transform.test.ts).
 */
async function buildFixture(files: Record<string, string>, entry: string[]): Promise<Dist> {
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

  const distDir = path.join(dir, "dist");
  const dist: Dist = { files: [], contents: {} };

  for (const entry of await readdir(distDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;

    const relative = path.relative(distDir, path.join(entry.parentPath, entry.name));
    dist.files.push(relative);

    if (relative.endsWith(".d.ts") || relative.endsWith(".css")) {
      dist.contents[relative] = await readFile(path.join(distDir, relative), "utf8");
    }
  }

  dist.files.sort();

  return dist;
}

/** One printable document of every captured file, for a single snapshot. */
function printed(dist: Dist): string {
  return Object.entries(dist.contents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, content]) => `//=== ${file}\n${content}`)
    .join("\n");
}

describe("declarations (full ember() via tsdown)", () => {
  it("emits .d.ts for an entry that type-imports from a non-entry .gts", async () => {
    // Mirrors a design-system shape: the component is in the runtime graph via
    // the index entry, while a second entry (a service) only *type*-imports
    // from it. The service's declaration then references the component's
    // (virtual) .d.ts, which only exists in the bundler's module graph.
    const dist = await buildFixture(
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

    expect(dist.files).toMatchInlineSnapshot(`
      [
        "index.d.ts",
        "index.js",
        "index.js.map",
        "popup-CjMmUEVb.d.ts",
        "popup-CjMmUEVb.d.ts.map",
        "service.d.ts",
        "service.d.ts.map",
        "service.js",
        "service.js.map",
      ]
    `);

    expect(printed(dist)).toMatchInlineSnapshot(`
      "//=== index.d.ts
      import { t as Popup } from "./popup-CjMmUEVb.js";
      export { Popup };
      //=== popup-CjMmUEVb.d.ts
      import Component from "@glimmer/component";
      //#region src/popup.d.ts
      interface PopupBlock {
        open: () => void;
      }
      interface PopupSignature {
        Element: HTMLDivElement;
        Blocks: {
          default: [PopupBlock];
        };
      }
      declare class Popup extends Component<PopupSignature> {}
      //#endregion
      export { PopupBlock as n, Popup as t };
      //# sourceMappingURL=popup-CjMmUEVb.d.ts.map
      //=== service.d.ts
      import { n as PopupBlock } from "./popup-CjMmUEVb.js";
      //#region src/service.d.ts
      declare class TooltipService {
        registerPopup(context: PopupBlock): void;
      }
      //#endregion
      export { TooltipService };
      //# sourceMappingURL=service.d.ts.map"
    `);
  });

  it("emits .d.ts when a .gts module is only ever type-imported", async () => {
    // Nothing value-imports popup.gts, so its virtual module never enters the
    // runtime graph: the only route to its declaration is the dts resolver
    // loading it on demand. The declaration pipeline registers modules as
    // their (virtual) source loads, so the import must resolve to the source
    // id — a pre-rewritten `.d.ts` id skips that registration and dangles.
    const dist = await buildFixture(
      {
        "src/service.ts": [
          `import type { PopupBlock } from './components/popup.gts';`,
          ``,
          `export class TooltipService {`,
          `  registerPopup(context: PopupBlock): void {`,
          `    void context;`,
          `  }`,
          `}`,
        ].join("\n"),
        "src/components/popup.gts": [
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
      ["./src/service.ts"],
    );

    expect(dist.files).toMatchInlineSnapshot(`
      [
        "service.d.ts",
        "service.d.ts.map",
        "service.js",
        "service.js.map",
      ]
    `);

    expect(printed(dist)).toMatchInlineSnapshot(`
      "//=== service.d.ts
      import "@glimmer/component";
      //#region src/components/popup.d.ts
      interface PopupBlock {
        open: () => void;
      }
      //#endregion
      //#region src/service.d.ts
      declare class TooltipService {
        registerPopup(context: PopupBlock): void;
      }
      //#endregion
      export { TooltipService };
      //# sourceMappingURL=service.d.ts.map"
    `);
  });

  it("emits .d.ts for a .gts that type-imports another (otherwise unimported) .gts", async () => {
    // A nested component type-imports a sibling from the parent directory;
    // its declaration then carries a relative source specifier for a module
    // that exists only in the bundler's graph (never on disk, never in the
    // runtime graph).
    const dist = await buildFixture(
      {
        "src/index.ts": `export { default as OptionList } from './components/select/option-list.gts';`,
        "src/components/select/option-list.gts": [
          `import Component from '@glimmer/component';`,
          `import type { PopupBlock } from '../popup.gts';`,
          ``,
          `export interface OptionListArgs {`,
          `  registerPopup: (context: PopupBlock) => void;`,
          `}`,
          ``,
          `export default class OptionList extends Component {`,
          `  <template>options</template>`,
          `}`,
        ].join("\n"),
        "src/components/popup.gts": [
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
      ["./src/index.ts"],
    );

    expect(dist.files).toMatchInlineSnapshot(`
      [
        "index.d.ts",
        "index.d.ts.map",
        "index.js",
        "index.js.map",
      ]
    `);

    expect(printed(dist)).toMatchInlineSnapshot(`
      "//=== index.d.ts
      import Component from "@glimmer/component";
      //#region src/components/select/option-list.d.ts
      declare class OptionList extends Component {}
      //#endregion
      export { OptionList };
      //# sourceMappingURL=index.d.ts.map"
    `);
  });

  it("bundles co-located CSS (via @tsdown/css) without breaking declarations", async () => {
    // Ember components routinely import a co-located .css file. Without CSS
    // handling the build dies on tsdown's css-guard — and because the failing
    // component module never loads, every declaration that references it
    // dangles (surfacing as misleading UNLOADABLE_DEPENDENCY errors on
    // <component>.d.ts). @tsdown/css makes both work.
    const dist = await buildFixture(
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

    expect(dist.files).toMatchInlineSnapshot(`
      [
        "index.d.ts",
        "index.js",
        "index.js.map",
        "popup-CytznrQX.d.ts",
        "popup-CytznrQX.d.ts.map",
        "service.d.ts",
        "service.d.ts.map",
        "service.js",
        "service.js.map",
        "style.css",
      ]
    `);

    expect(printed(dist)).toMatchInlineSnapshot(`
      "//=== index.d.ts
      import { t as Popup } from "./popup-CytznrQX.js";
      export { Popup };
      //=== popup-CytznrQX.d.ts
      import Component from "@glimmer/component";
      //#region src/popup.d.ts
      interface PopupBlock {
        open: () => void;
      }
      declare class Popup extends Component {}
      //#endregion
      export { PopupBlock as n, Popup as t };
      //# sourceMappingURL=popup-CytznrQX.d.ts.map
      //=== service.d.ts
      import { n as PopupBlock } from "./popup-CytznrQX.js";
      //#region src/service.d.ts
      declare function register(context: PopupBlock): void;
      //#endregion
      export { register };
      //# sourceMappingURL=service.d.ts.map
      //=== style.css
      .popup {
        color: red;
      }
      "
    `);
  });
});

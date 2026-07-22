import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, listFiles } from "#test-helpers";
import { execa } from "execa";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * Integration test for building a library that uses ember-scoped-css through
 * `@nullvoxpopuli/ember-rolldown` (tsdown):
 *
 * - the `scopedCSS()` unplugin (ember-scoped-css/rollup) resolves and rewrites
 *   the `?scoped=` CSS requests the template transform injects
 * - the template transform + babel plugin ride along via `ember()`'s
 *   `babel.templateTransforms` / `babel.plugins` options
 * - `@tsdown/css` with `css.inject` bundles the scoped CSS into
 *   `dist/style.css` and keeps the import in `dist/index.js`, so consuming
 *   apps load the styles through the module graph
 *
 * Covers all three authoring modes: co-located `.css`, inline
 * `<style scoped>`, and the `scopedClass` pseudo-helper in module code.
 */

const source = {
  "tsdown.config.js": `import { defineConfig } from "tsdown";
import { ember } from "@nullvoxpopuli/ember-rolldown";
import { scopedCSS } from "ember-scoped-css/rollup";
import { scopedCSS as scopedCssBabel } from "ember-scoped-css/babel";

export default defineConfig({
  entry: ["./src/index.ts"],
  css: { inject: true },
  plugins: [
    ember({
      babel: {
        plugins: [scopedCssBabel()],
        templateTransforms: [scopedCssBabel.template({})],
      },
    }),
    scopedCSS(),
  ],
});
`,
  "src/index.ts": `export { Badge, type BadgeSignature } from "./components/badge.gts";
export { Banner, type BannerSignature } from "./components/banner.gts";
export { Chip, type ChipSignature, chipClass } from "./components/chip.gts";
`,
  // co-located CSS
  "src/components/badge.gts": `import type { TOC } from "@ember/component/template-only";

export interface BadgeSignature {
  Element: HTMLSpanElement;
  Blocks: {
    default: [];
  };
}

export const Badge: TOC<BadgeSignature> = <template>
  <span class="badge" ...attributes>{{yield}}</span>
</template>;
`,
  "src/components/badge.css": `.badge {
  border-radius: 0.25rem;
  padding: 0.25rem 0.5rem;
}
`,
  // inline <style scoped>
  "src/components/banner.gts": `import type { TOC } from "@ember/component/template-only";

export interface BannerSignature {
  Element: HTMLDivElement;
  Blocks: {
    default: [];
  };
}

export const Banner: TOC<BannerSignature> = <template>
  <style scoped>
    .banner {
      border: 1px solid;
    }
  </style>
  <div class="banner" ...attributes>{{yield}}</div>
</template>;
`,
  // scopedClass pseudo-helper in module code
  "src/components/chip.gts": `import type { TOC } from "@ember/component/template-only";
import { scopedClass } from "ember-scoped-css";

export const chipClass: string = scopedClass("chip");

export interface ChipSignature {
  Element: HTMLSpanElement;
}

export const Chip: TOC<ChipSignature> = <template>
  <span class="chip" ...attributes></span>
</template>;
`,
  "src/components/chip.css": `.chip {
  display: inline-flex;
}
`,
};

async function writeSource(project: Project) {
  for (let [filePath, contents] of Object.entries(source)) {
    let target = join(project.directory, filePath);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

async function addDependencies(project: Project) {
  let manifestPath = join(project.directory, "package.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  // @tsdown/css releases in lockstep with tsdown; both ranges track 0.22.x
  manifest.devDependencies["@tsdown/css"] = "^0.22.13";
  manifest.devDependencies["ember-scoped-css"] = "^3.1.0";

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

describe("library with ember-scoped-css", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ type: "library", name: "scoped-lib", layers: ["typescript"] });

    await writeSource(project);
    await addDependencies(project);

    let install = await execa("pnpm install", { cwd: project.directory, shell: true });
    expect(install.exitCode).toBe(0);

    let build = await execa("pnpm build", { cwd: project.directory, shell: true });
    expect(build.exitCode).toBe(0);
  });

  afterAll(async () => {
    if (process.env.CI) return;

    await rm(project.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("emits the expected files", async () => {
    expect(await listFiles(join(project.directory, "dist"))).toMatchInlineSnapshot(`
      [
        "index.d.ts",
        "index.d.ts.map",
        "index.js",
        "index.js.map",
        "style.css",
      ]
    `);
  });

  it("scopes classes in the precompiled templates and keeps the CSS import", async () => {
    let output = await project.read("dist/index.js");

    expect(output).toMatchInlineSnapshot(`
      "import './style.css';
      import { precompileTemplate } from "@ember/template-compilation";
      import { setComponentTemplate } from "@ember/component";
      import templateOnly from "@ember/component/template-only";
      //#region src/components/badge.ts
      const Badge = setComponentTemplate(precompileTemplate("<span class=\\"badge_e1025e732\\" ...attributes>{{yield}}</span>", { strictMode: true }), templateOnly());
      //#endregion
      //#region src/components/banner.ts
      const Banner = setComponentTemplate(precompileTemplate("\\n<div class=\\"banner_e88952290\\" ...attributes>{{yield}}</div>", { strictMode: true }), templateOnly());
      //#endregion
      //#region src/components/chip.ts
      const chipClass = "chip_ec34dd962";
      const Chip = setComponentTemplate(precompileTemplate("<span class=\\"chip_ec34dd962\\" ...attributes></span>", { strictMode: true }), templateOnly());
      //#endregion
      export { Badge, Banner, Chip, chipClass };

      //# sourceMappingURL=index.js.map"
    `);

    // the scopedClass import is compiled away; nothing of ember-scoped-css
    // remains at runtime
    expect(output).not.toContain("ember-scoped-css");
  });

  it("rewrites and bundles all three CSS sources", async () => {
    expect(await project.read("dist/style.css")).toMatchInlineSnapshot(`
      ".badge_e1025e732 {
        border-radius: .25rem;
        padding: .25rem .5rem;
      }
      .banner_e88952290 {
        border: 1px solid;
      }
      .chip_ec34dd962 {
        display: inline-flex;
      }
      "
    `);
  });

  it("emits declarations untouched by scoping", async () => {
    let declarations = await project.read("dist/index.d.ts");

    expect(declarations).toContain("declare const Badge: TOC<BadgeSignature>");
    expect(declarations).not.toContain("badge_");
  });
});

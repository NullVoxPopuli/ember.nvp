import { describe, it, afterAll, expect } from "vitest";
import { generate, build, expectIsSetup, layers } from "#test-helpers";
import { execa } from "execa";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const inspectorSupport = layers.find((layer) => layer.name === "inspector-support");

describe("layer: inspector-support", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    if (process.env.CI) return;

    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("wires a TypeScript app, which still builds", async () => {
    const project = await generate({ type: "app", layers: ["typescript", "inspector-support"] });
    dirs.push(project.directory);

    expect(inspectorSupport).toBeTruthy();
    await expectIsSetup(project, inspectorSupport!);

    const install = await execa("pnpm install", { cwd: project.directory, shell: true });
    expect(install.exitCode).toBe(0);

    const result = await build(project);
    expect(result.exitCode).toBe(0);
  });

  it("wires a JavaScript app (no typescript layer), which still builds", async () => {
    const project = await generate({ type: "app", layers: ["inspector-support"] });
    dirs.push(project.directory);

    expect(inspectorSupport).toBeTruthy();
    await expectIsSetup(project, inspectorSupport!);

    const appFile = await readFile(join(project.directory, "app/app.js"), "utf8");
    expect(appFile).toMatchInlineSnapshot(`
      "/**
       * Looking for services that come from addons?
       *
       * See: https://github.com/embroider-build/embroider/issues/2659
       *
       * We currently don't support app-tree merging from libraries.
       *
       * For services, I highly recommend looking in to either of
       * - https://github.com/chancancode/ember-polaris-service-
       * - https://ember-primitives.pages.dev/6-utils/createService.md
       *   - https://ember-primitives.pages.dev/6-utils/createAsyncService.md
       */
      import Application from 'ember-strict-application-resolver';
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      export default class App extends Application {
        modules = { ...import.meta.glob('./router.*', { eager: true }), ...import.meta.glob('./templates/**/*', { eager: true }), ...import.meta.glob('./services/**/*', { eager: true }) };
        inspector = setupInspector(this);
      }"
    `);

    const install = await execa("pnpm install", { cwd: project.directory, shell: true });
    expect(install.exitCode).toBe(0);

    const result = await build(project);
    expect(result.exitCode).toBe(0);
  });
});

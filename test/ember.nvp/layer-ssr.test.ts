import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { generate, reapply } from "#test-helpers";
import { layers } from "#layers";
import { execa, type ResultPromise } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * Generates apps with the ssr layer, builds them,
 * and requests pages from the real `start` script.
 *
 * Each app gets a route whose model comes from a JSON API that this test starts,
 * so the page only has the data when the server rendered it.
 */

const ssr = layers.find((layer) => layer.name === "ssr")!;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  let address = server.address();

  if (!address || typeof address === "string") throw new Error("no port");

  return address.port;
}

async function freePort() {
  let server = createServer();
  let port = await listen(server);

  await new Promise((resolve) => server.close(resolve));

  return port;
}

async function emit(project: Project, files: Record<string, string>) {
  for (let [path, contents] of Object.entries(files)) {
    let filePath = join(project.directory, path);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
}

function itemRoute(ext: "ts" | "js", apiPort: number) {
  return {
    [`app/routes/item.${ext}`]: `import Route from "@ember/routing/route";

export default class ItemRoute extends Route {
  async model() {
    let response = await fetch("http://127.0.0.1:${apiPort}/item");

    return response.json();
  }
}
`,
    [`app/templates/item.g${ext}`]: `<template>
  <p id="item">{{@model.name}}</p>
</template>
`,
  };
}

async function addItemRoute(project: Project, ext: "ts" | "js", apiPort: number) {
  await emit(project, itemRoute(ext, apiPort));

  let router = join(project.directory, `app/router.${ext}`);
  let code = await project.read(`app/router.${ext}`);

  await writeFile(
    router,
    code!.replace(
      "Router.map(function () {});",
      'Router.map(function () {\n  this.route("item");\n});',
    ),
  );
}

/**
 * A JSON API for the item route.
 */
async function startApi() {
  let api = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify({ name: "Pikachu" }));
  });

  return { api, apiPort: await listen(api) };
}

async function waitForServer(url: string, serve: ResultPromise) {
  let exited = false;

  serve.finally(() => (exited = true)).catch(() => {});

  for (let i = 0; i < 600; i++) {
    if (exited) throw new Error(`the server exited:\n${(await serve.catch((e) => e)).all}`);

    try {
      await fetch(url);

      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`no response from ${url}`);
}

describe.each([
  { flavor: "javascript", ext: "js", layerNames: ["ssr", "qunit"] },
  { flavor: "typescript", ext: "ts", layerNames: ["ssr", "qunit", "typescript"] },
] as const)("ssr layer, server mode ($flavor)", ({ ext, layerNames }) => {
  let project: Project;
  let api: Server;
  let serve: ResultPromise;
  let origin: string;

  beforeAll(async () => {
    let started = await startApi();
    let apiPort = started.apiPort;

    api = started.api;
    project = await generate({
      layers: [...layerNames],
      options: { typescript: { version: "7" } },
    });

    await addItemRoute(project, ext, apiPort);

    await execa("pnpm install", { cwd: project.directory, shell: true });
    await execa("pnpm build", { cwd: project.directory, shell: true });

    let port = await freePort();

    origin = `http://127.0.0.1:${port}`;
    /**
     * The "start" script, without pnpm in between,
     * so that kill() stops the server itself.
     */
    serve = execa("node", ["server.js"], {
      cwd: project.directory,
      env: { PORT: String(port) },
      all: true,
    });

    await waitForServer(origin, serve);
  });

  afterAll(async () => {
    serve?.kill();
    api?.close();

    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await ssr.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("renders the application template on the server", async () => {
    let html = await (await fetch(origin)).text();

    expect(html).toContain("Welcome to Ember</h1>");
    expect(html).toContain("window.__vite_ember_ssr_rehydrate__=true");
  });

  it("renders route data on the server, and puts the response in the page", async () => {
    let response = await fetch(`${origin}/item`);
    let html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toMatch(/<p id="item">(<!--[^>]*-->)?Pikachu/);
    expect(html).toContain('id="vite-ember-ssr-shoebox"');
  });

  it("serves the client build", async () => {
    let html = await (await fetch(origin)).text();
    let script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];

    expect(script).toBeTruthy();
    expect((await fetch(`${origin}${script}`)).status).toBe(200);
  });

  it("answers 404 for a missing file", async () => {
    expect((await fetch(`${origin}/favicon.ico`)).status).toBe(404);
  });

  it("runs the tests from the client build", async () => {
    let test = await execa("pnpm test", { cwd: project.directory, shell: true });

    expect(test.exitCode).toBe(0);
  });
});

describe.each([
  { flavor: "javascript", ext: "js", layerNames: ["ssr", "qunit"] },
  { flavor: "typescript", ext: "ts", layerNames: ["ssr", "qunit", "typescript"] },
] as const)("ssr layer, static mode ($flavor)", ({ ext, layerNames }) => {
  let project: Project;
  let api: Server;

  beforeAll(async () => {
    let started = await startApi();

    api = started.api;
    project = await generate({
      layers: [...layerNames],
      options: { typescript: { version: "7" }, ssr: { mode: "static" } },
    });

    await addItemRoute(project, ext, started.apiPort);

    /**
     * What a user does to prerender a route of their own.
     */
    let config = (await project.read("vite.config.mjs"))!;

    await writeFile(
      join(project.directory, "vite.config.mjs"),
      config.replace('routes: ["index"]', 'routes: ["index", "item"]'),
    );

    await execa("pnpm install", { cwd: project.directory, shell: true });
    await execa("pnpm build", { cwd: project.directory, shell: true });
  });

  afterAll(async () => {
    api?.close();

    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup", async () => {
    expect(await ssr.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("has no server", () => {
    expect(project.hasFile("server.js")).toBe(false);
  });

  it("renders the application template to dist/index.html", async () => {
    let html = (await project.read("dist/index.html"))!;

    expect(html).toContain("Welcome to Ember</h1>");
    expect(html).toContain("window.__vite_ember_ssr_rehydrate__=true");
  });

  it("renders route data at build time", async () => {
    let html = (await project.read("dist/item/index.html"))!;

    expect(html).toMatch(/<p id="item">(<!--[^>]*-->)?Pikachu/);
  });

  it("keeps the user's routes when it runs again", async () => {
    await reapply(project, [...layerNames]);

    expect(await project.read("vite.config.mjs")).toContain('routes: ["index", "item"]');
  });

  it("runs the tests from the build", async () => {
    let test = await execa("pnpm test", { cwd: project.directory, shell: true });

    expect(test.exitCode).toBe(0);
  });
});

describe("ssr layer, from server mode to static mode", () => {
  let project: Project;

  beforeAll(async () => {
    project = await generate({ layers: ["ssr", "qunit"] });
    project = await generate({
      directory: project.directory,
      layers: ["ssr", "qunit"],
      options: { ssr: { mode: "static" } },
    });
  });

  afterAll(async () => {
    if (process.env.CI) return;

    if (project?.directory) {
      await rm(project.directory, { recursive: true, force: true });
    }
  });

  it("is setup for static mode", async () => {
    expect(await ssr.isSetup(project, true)).toEqual({ isSetup: true, reasons: [] });
  });

  it("removes what only the server needs", async () => {
    let manifest = JSON.parse((await project.read("package.json"))!);
    let config = (await project.read("vite.config.mjs"))!;

    expect(project.hasFile("server.js")).toBe(false);
    expect(manifest.dependencies.sirv).toBeUndefined();
    expect(manifest.dependencies["vite-ember-ssr"]).toBeUndefined();
    expect(manifest.devDependencies["vite-ember-ssr"]).toBeTruthy();
    expect(config).not.toContain("emberSsr");
    expect(await project.read("testem.cjs")).toContain('cwd: "dist"');
  });
});

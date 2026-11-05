import { execa, type ResultPromise } from "execa";
import { join, relative, sep } from "node:path";
import { styleText } from "node:util";
import { Readable, Writable } from "node:stream";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { generateProject, Project } from "ember.nvp";
import { discoverLayers } from "#layers";
import type { Answers, DiscoveredLayer, ProjectType } from "#types";
import { expect } from "vitest";

const minimalApp = "minimal-app";
const minimalAddon = "minimal-library";
const minimalExtension = "minimal-extension";
const minimalCustomElement = "minimal-custom-element";

export const bases = [minimalApp, minimalAddon, minimalExtension, minimalCustomElement];

export const layers = await discoverLayers();

/**
 * Layers in the same group are alternatives to each other
 * (one eslint config, one test framework).
 *
 * Selecting two of them produces a broken project,
 * so permutations never combine them.
 */
function exclusivityGroup(name: string): string | undefined {
  if (name.startsWith("eslint-")) return "eslint";
  if (name === "qunit" || name === "vitest") return "testing";

  return undefined;
}

export function permutate(toPermutate: string[]): string[][] {
  const out: string[][] = [];

  function backtrack(startIndex: number, prefix: string[], usedGroups: Set<string>) {
    if (prefix.length > 0) out.push(prefix.slice());

    for (let i = startIndex; i < toPermutate.length; i++) {
      if (i > startIndex && toPermutate[i] === toPermutate[i - 1]) {
        // skip duplicates (a,b,c == c,b,a)
        continue;
      }

      let option = toPermutate[i];

      // something has gone wrong if this is undefined
      // (silly TS not understanding loop bounds)
      if (!option) continue;

      const group = exclusivityGroup(option);

      // Skip this option if we already have one from its exclusivity group
      if (group && usedGroups.has(group)) continue;

      if (group) usedGroups.add(group);
      prefix.push(option);
      backtrack(i + 1, prefix, usedGroups);
      prefix.pop();
      if (group) usedGroups.delete(group);
    }
  }

  backtrack(0, [], new Set());
  return out;
}

export async function mktemp(name = "ember.nvp_test-") {
  return await mkdtemp(join(tmpdir(), `${name}-`));
}

export async function reapply(project: Project, layers: string[]) {
  return await generate({
    directory: project.directory,
    layers,
    name: project.name,
    type: project.type,
    packageManager: project.packageManager,
    options: project.desires.options,
  });
}

export async function generate({
  layers: layerNames = [],
  name = "my-app",
  type = "app",
  packageManager = "pnpm",
  directory,
  options,
}: {
  directory?: string;
  layers?: string[];
  name?: string;
  type?: ProjectType;
  packageManager?: "pnpm" | "npm";
  /**
   * Layer options, keyed by layer name
   */
  options?: Answers["options"];
}): Promise<Project> {
  const tempDir = directory ?? (await mktemp(name));

  let selectedLayers = layers.filter((layer) => layerNames.includes(layer.name));
  let project = new Project(tempDir, {
    name,
    type,
    path: tempDir,
    layers: selectedLayers,
    packageManager,
    options,
  });

  await generateProject(project);

  return project;
}

const cliPath = join(import.meta.dirname, "../src/cli/index.js");

/**
 * Runs the CLI. Its stdin is a pipe, not a TTY, so it asks nothing.
 *
 * With `tty: true`, the CLI runs in a pseudo-terminal (a TTY) from `script` (util-linux),
 * so the prompts appear, and writes to stdin answer them.
 */
export function cli(
  args: string[] = [],
  { tty = false, ...options }: { cwd?: string; tty?: boolean } = {},
) {
  let cmd = `node ${cliPath} ${args.join(" ")}`;

  console.log(`Running '${styleText("cyan", cmd)}'`);

  let output = new MockWritable();
  let input = new MockReadable();

  let execaPromise = tty
    ? execa(
        "script",
        [
          "--quiet",
          "--return",
          "--command",
          /**
           * The new TTY has 0 columns, so clack would wrap after every character.
           */
          `stty cols 120 rows 40; ${shellCommand([process.execPath, cliPath].concat(args))}`,
          "/dev/null",
        ],
        options,
      )
    : execa("node", [cliPath, ...args], options);
  if (execaPromise.stdout) {
    execaPromise.stdout.pipe(output);
  }

  return {
    execaPromise,
    output,
    input,
  };
}

function shellCommand(words: string[]) {
  return words.map((word) => `'${word.replaceAll("'", `'\\''`)}'`).join(" ");
}

export class MockWritable extends Writable {
  public buffer: string[] = [];
  public isTTY = false;
  public columns = 80;
  public rows = 20;

  _write(
    chunk: any,
    _encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void,
  ): void {
    this.buffer.push(chunk.toString());
    callback();
  }
}

export class MockReadable extends Readable {
  protected _buffer: unknown[] | null = [];

  _read() {
    if (this._buffer === null) {
      this.push(null);
      return;
    }

    for (const val of this._buffer) {
      this.push(val);
    }

    this._buffer = [];
  }

  pushValue(val: unknown): void {
    this._buffer?.push(val);
  }

  close(): void {
    this._buffer = null;
  }
}

export async function build(project: Project, mode = "development") {
  return await execa("pnpm", ["vite", "build", "--mode", mode], {
    cwd: project.directory,
    env: {
      NODE_ENV: mode,
    },
  });
}

export async function expectIsSetup(project: Project, layer: DiscoveredLayer) {
  let result = await layer.isSetup(project, true);

  if (typeof result === "object") {
    expect(result.reasons, `${layer.name} is setup`).deep.equal([]);
    expect(result.isSetup, `${layer.name} is setup`).toBe(true);
    return;
  }

  expect(result, `${layer.name} is setup`).toBe(true);
}

/**
 * List every file under `directory` (recursively),
 * as sorted paths relative to `directory`.
 *
 * `node_modules` is always excluded.
 * Pass `{ includeDist: false }` to also exclude the `dist/` build output.
 */
export async function listFiles(
  directory: string,
  { includeDist = true }: { includeDist?: boolean } = {},
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split(sep).includes("node_modules"))
    .filter((path) => includeDist || !path.startsWith(`dist${sep}`))
    .sort();
}

export async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  let address = server.address();

  if (!address || typeof address === "string") throw new Error("no port");

  return address.port;
}

/**
 * A port that nothing listens on now.
 */
export async function freePort() {
  let server = createServer();
  let port = await listen(server);

  await new Promise((resolve) => server.close(resolve));

  return port;
}

/**
 * Waits until the server answers, or throws with its output if it exits.
 */
export async function waitForServer(url: string, serve: ResultPromise) {
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

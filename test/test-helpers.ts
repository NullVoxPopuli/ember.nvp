import { execa } from "execa";
import { join } from "node:path";
import { styleText } from "node:util";
import { Readable, Writable } from "node:stream";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generateProject, Project } from "ember.nvp";
import { discoverLayers } from "#layers";
import type { DiscoveredLayer } from "#types";
import { expect } from "vitest";

const minimalApp = "minimal-app";
const minimalAddon = "minimal-library";

export const bases = [minimalApp, minimalAddon];

export const layers = await discoverLayers();

/**
 * Layers in the same group are alternatives to each other (one eslint
 * config, one test framework): selecting two of them would produce a
 * broken project, so permutations never combine them.
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

/**
 * Temporary: `rolldown-plugin-dts` (used by tsdown for `.d.ts` generation)
 * imports `walk` from `yuku-parser`, but yuku-parser >= 0.6.6 moved `walk` to
 * `yuku-ast`. Its dependency range still floats to the broken versions, so a
 * fresh install of a generated library crashes when tsdown builds.
 *
 * The yuku toolchain publishes in lockstep on a shared `@yuku-toolchain/types`,
 * so `yuku-parser` and `yuku-codegen` must be pinned together (pinning only one
 * splits the toolchain and the dts/publint pipeline silently bails). Pin the
 * last working set before install -- here in the test harness only, so the
 * generated blueprint stays override-free. Remove once the plugin is fixed:
 * https://github.com/sxzz/rolldown-plugin-dts/issues/277
 */
export async function pinYukuParser(project: Project): Promise<void> {
  const manifestPath = join(project.directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  manifest.pnpm ??= {};
  manifest.pnpm.overrides ??= {};
  manifest.pnpm.overrides["yuku-parser"] = "0.6.5";
  manifest.pnpm.overrides["yuku-codegen"] = "0.6.5";

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function reapply(project: Project, layers: string[]) {
  return await generate({
    directory: project.directory,
    layers,
    name: project.name,
    type: project.type,
    packageManager: project.packageManager,
  });
}

export async function generate({
  layers: layerNames = [],
  name = "my-app",
  type = "app",
  packageManager = "pnpm",
  directory,
}: {
  directory?: string;
  layers?: string[];
  name?: string;
  type?: "app" | "library";
  packageManager?: "pnpm" | "npm";
}): Promise<Project> {
  const tempDir = directory ?? (await mktemp(name));

  let selectedLayers = layers.filter((layer) => layerNames.includes(layer.name));
  let project = new Project(tempDir, {
    name,
    type,
    path: tempDir,
    layers: selectedLayers,
    packageManager,
  });

  await generateProject(project);

  return project;
}

const cliPath = join(import.meta.dirname, "../src/cli/index.js");

export function cli(args: string[] = []) {
  let cmd = `node ${cliPath} ${args.join(" ")}`;

  console.log(`Running '${styleText("cyan", cmd)}'`);

  let output = new MockWritable();
  let input = new MockReadable();

  let execaPromise = execa("node", args, { shell: true, stdout: output, stdin: input });

  return {
    execaPromise,
    output,
    input,
  };
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

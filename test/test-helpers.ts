import { execa } from "execa";
import { join } from "node:path";
import { styleText } from "node:util";
import { Readable, Writable } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generateProject, Project } from "ember.nvp";
import { discoverLayers } from "#layers";

const minimalApp = "minimal-app";
const minimalAddon = "minimal-library";

export const bases = [minimalApp, minimalAddon];

export const layers = await discoverLayers();

export function permutate(toPermutate: string[]): string[][] {
  const out: string[][] = [];

  function backtrack(startIndex: number, prefix: string[]) {
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

      prefix.push(option);
      backtrack(i + 1, prefix);
      prefix.pop();
    }
  }

  backtrack(0, []);
  return out;
}

export async function generate({
  layers: layerNames = [],
  name = "my-app",
  type = "app",
  packageManager = "pnpm",
}: {
  layers?: string[];
  name?: string;
  type?: string;
  packageManager?: string;
}): Promise<Project> {
  const tempDir = await mkdtemp(join(tmpdir(), `${name}-`));

  let selectedLayers = layers.filter((layer) => layerNames.includes(layer.name));
  let project = new Project(tempDir, {
    name,
    type,
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

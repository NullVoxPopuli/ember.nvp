import { execa } from "execa";
import { join } from "node:path";
import { styleText } from "node:util";

const minimalApp = "minimal-app";
const minimalAddon = "minimal-library";

export const bases = [minimalApp, minimalAddon];

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

const cliPath = join(import.meta.dirname, "../src/cli/index.js");

export function runcli(args: string[] = []) {
  let cmd = `node ${cliPath} ${args.join(" ")}`;

  console.log(`Running '${styleText("cyan", cmd)}'`);

  return execa(cmd, { shell: true, stdout: "inherit", stdin: "/dev/null" });
}

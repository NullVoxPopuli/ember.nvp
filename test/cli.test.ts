import { test, expect as hardExpect } from "vitest";
import { cli } from "./test-helpers.js";

const expect = hardExpect.soft;

test.skip("cli works", async () => {
  let { execaPromise, output, input } = cli();

  await execaPromise;

  expect(execaPromise.exitCode).toBe(0);
});

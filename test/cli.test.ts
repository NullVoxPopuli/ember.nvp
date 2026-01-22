import { test, expect as hardExpect } from "vitest";
import { runcli } from "./test-helpers.js";

const expect = hardExpect.soft;

test("cli works", async () => {
  let { exitCode } = await runcli();

  expect(exitCode).toBe(0);
});

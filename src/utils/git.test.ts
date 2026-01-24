import { describe, expect, it } from "vitest";
import { isInGit, initGit, hasGit } from "./git.js";
import { cwd } from "./cwd.js";
import { mktemp } from "#test-helpers";

describe("isInGit", () => {
  it("in this repo", async () => {
    expect(isInGit(cwd)).toBe(true);
  });

  it("in a temp directory", async () => {
    let tmp = await mktemp();

    expect(isInGit(tmp)).toBe(false);
  });
});

describe("initGit + hasGit", () => {
  it("creates in non-git directory", async () => {
    let tmp = await mktemp();

    expect(hasGit(tmp)).toBe(false);
    initGit(tmp);
    expect(hasGit(tmp)).toBe(true);
  });

  it("attempts in pre-existing git repo", async () => {
    let tmp = await mktemp();

    expect(hasGit(tmp)).toBe(false);
    initGit(tmp);
    expect(hasGit(tmp)).toBe(true);
    initGit(tmp);
    expect(hasGit(tmp)).toBe(true);
  });
});

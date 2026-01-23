import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "#utils/cwd.js";

export function isInGit() {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      encoding: "utf-8",
      cwd,
      stdio: "ignore",
    }).trim();
    return result === "true";
  } catch {
    return false;
  }
}

/**
 *
 * @param {string} directory
 */
export function initGit(directory) {
  try {
    execSync("git init", { cwd: directory, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 *
 * @param {string} directory
 */
export function hasGit(directory) {
  return existsSync(join(directory, ".git"));
}

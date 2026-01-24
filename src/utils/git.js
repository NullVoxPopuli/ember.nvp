import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "#utils/cwd.js";

export function isInGit(directory = cwd) {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      cwd: directory,
    });

    return result.toString().trim() === "true";
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
    execSync("git init --initial-branch=main", { cwd: directory });
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

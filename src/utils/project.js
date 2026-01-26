import { $ } from "execa";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasGit } from "#utils/git.js";

/**
 * State container for the project.
 *
 * May eventually include information for discovering existing state
 * about a project.
 */
export class Project {
  #directory;
  #desires;

  /**
   *
   * @param {string} atDirectory
   * @param {import('./types.ts').Answers} desires
   */
  constructor(atDirectory, desires) {
    this.#directory = atDirectory;
    this.#desires = desires;
  }

  /**
   * @type {string}
   */
  get name() {
    return this.desires.name;
  }

  /**
   * @type {import('#types').ProjectType}
   */
  get type() {
    return this.desires.type;
  }

  /**
   * @type {import('#types').PackageManager}
   */
  get packageManager() {
    return this.desires.packageManager;
  }

  /**
   * @type {string}
   */
  get directory() {
    return this.#directory;
  }

  /**
   * @type {import('./types.ts').Answers}
   */
  get desires() {
    return this.#desires;
  }

  /**
   * @type {boolean}
   */
  get wantsTypeScript() {
    return this.desires.layers.some((layer) => layer.name === "typescript");
  }

  /**
   * @type {boolean}
   */
  get wantsESLint() {
    return this.desires.layers.some((layer) => layer.name.startsWith("eslint"));
  }

  /**
   * @type {boolean}
   */
  get wantsTesting() {
    return this.desires.layers.some((layer) => layer.name === "qunit" || layer.name === "vitest");
  }

  /**
   *
   * @param {string} relativePath
   * @returns {string}
   */
  path(relativePath) {
    return join(this.directory, relativePath);
  }

  /**
   *
   * @param {string} relativePath
   * @returns {boolean}
   */
  hasFile(relativePath) {
    let path = this.path(relativePath);

    return existsSync(path);
  }

  /**
   *
   * @param {string} relativePath
   * @returns {Promise<string|undefined>}
   */
  async read(relativePath) {
    let path = this.path(relativePath);

    if (existsSync(path)) {
      return await readFile(path, "utf-8");
    }

    return;
  }

  /**
   * @param {string} command
   * @returns {import('execa').ResultPromise}
   */
  run(command) {
    return $(command, { cwd: this.directory, shell: true });
  }

  /**
   * @returns {import('execa').ResultPromise}
   */
  install() {
    return this.run(`${this.desires.packageManager} install`);
  }

  /**
   * @param {string} [files='.'] files to add to git, defaults to all files
   * @returns {import('execa').ResultPromise | undefined}
   */
  gitAdd(files = ".") {
    if (!hasGit(this.directory)) return;

    return this.run(`git add ${files}`);
  }

  /**
   * @param {string} message commit message
   * @returns {import('execa').ResultPromise | undefined}
   */
  gitCommit(message) {
    if (!hasGit(this.directory)) return;

    return this.run(`git commit -m ${JSON.stringify(message)}`);
  }

  /**
   * @returns {Promise<boolean>}
   */
  async gitHasDiff() {
    if (!hasGit(this.directory)) return false;

    try {
      await this.run("git diff --exit-code");
      return false; // exit code 0 means no diff
    } catch {
      return true; // exit code 1 means there is a diff
    }
  }
}

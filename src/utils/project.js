import { $ } from "execa";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { hasGit } from "#utils/git.js";
import { assert } from "node:console";
import { layers, layerNames } from "#layers";

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
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async #hasLayer(name) {
    let layer = layers.find((layer) => layer.name === name);

    if (!layer) return false;

    return layer.isSetup(this);
  }

  /**
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async hasLayer(name) {
    switch (name) {
      case "eslint": {
        let eslints = layerNames.filter((name) => name.startsWith("eslint"));
        let results = await Promise.all(eslints.map((name) => this.#hasLayer(name)));

        return results.every(Boolean);
      }
      case "testing": {
        let results = await Promise.all([this.#hasLayer("qunit"), this.#hasLayer("vitest")]);

        return results.every(Boolean);
      }
      default: {
        return this.#hasLayer(name);
      }
    }
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  wantsLayer(name) {
    switch (name) {
      case "eslint": {
        return this.desires.layers.some((layer) => layer.name.startsWith("eslint"));
      }
      case "testing": {
        return this.desires.layers.some(
          (layer) => layer.name === "qunit" || layer.name === "vitest",
        );
      }
      default: {
        return this.desires.layers.some((layer) => layer.name === name);
      }
    }
  }

  /**
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async hasOrWantsLayer(name) {
    return this.wantsLayer(name) || this.hasLayer(name);
  }

  /**
   * @returns {boolean}
   */
  get wantsTypeScript() {
    return this.wantsLayer("typescript");
  }

  /**
   *
   * @param {string} relativePath
   * @returns {string}
   */
  path(relativePath) {
    assert(typeof relativePath === "string");
    assert(!relativePath.startsWith("/"), "relativePath must be relative");
    assert(!relativePath.includes(".."), "relativePath must not traverse directories");

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
   *
   * @param {string} relativePath
   */
  async removeFile(relativePath) {
    let path = this.path(relativePath);

    if (existsSync(path)) {
      await rm(path);
    }
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
   * @returns {Promise<string | undefined>}
   */
  async gitLastCommitMessage() {
    if (!hasGit(this.directory)) return;

    try {
      const result = await this.run("git log -1 --pretty=%B");
      const stdout = result.stdout;
      return typeof stdout === "string" ? stdout.trim() : undefined;
    } catch {
      return;
    }
  }

  /**
   * @returns {Promise<boolean>}
   */
  async gitHasDiff() {
    if (!hasGit(this.directory)) return false;

    try {
      await this.run("git diff --exit-code");
      await this.run("git diff --staged --exit-code");
      return false; // exit code 0 means no diff
    } catch {
      return true; // exit code 1 means there is a diff
    }
  }
}

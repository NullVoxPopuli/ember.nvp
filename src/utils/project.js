import { $ } from "execa";

/**
 * State container for the project.
 *
 * May eventually include information for discovering existing state
 * about a project.
 *
 * @implements {import('./types.ts').Project}
 */
export class Project {
  #directory;
  #desires;

  constructor(atDirectory, desires) {
    this.#directory = atDirectory;
    this.#desires = desires;
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
    return this.desires.layers.some((layer) => layer.name === "TypeScript");
  }

  /**
   * @param {string} command
   * @returns {Promise<import('execa').ResultPromise>}
   */
  run(command) {
    return $(command, { cwd: this.directory, shell: true });
  }

  /**
   * @returns {Promise<import('execa').ResultPromise>}
   */
  install() {
    return this.run(`${this.desires.packageManager} install`);
  }
}

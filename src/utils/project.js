import { $ } from "execa";

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

  get type() {
    return this.desires.type;
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
}

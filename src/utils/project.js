/**
 * State container for the project.
 *
 * May eventually include information for discovering existing state
 * about a project.
 */
export class Project {
  /**
   * @type {string}
   */
  #directory;
  /**
   * @type {Answers}
   */
  #desires;

  constructor(atDirectory, desires) {
    this.#directory = atDirectory;
    this.#desires = desires;
  }

  get directory() {
    return this.#directory;
  }

  get desires() {
    return this.#desires;
  }
}

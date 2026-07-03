import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { styleText } from "node:util";
import { structuredPatch } from "diff";

/**
 * Directories that belong to the target project's environment rather than
 * its generated contents. They are never seeded into the stage, never
 * diffed, and never deleted on commit.
 *
 * (`.git` has one exception: see {@link Stage#commit})
 */
const ENVIRONMENT_DIRECTORIES = new Set(["node_modules", ".git"]);

/**
 * @typedef {'added' | 'modified' | 'deleted'} ChangeStatus
 * @typedef {{ path: string, status: ChangeStatus }} Change
 */

/**
 * A copy-on-write overlay for a project directory, in the spirit of
 * Docker's layered file systems:
 *
 * - the target directory is the read-only lower layer
 * - a real directory in the OS temp dir is the writable upper layer,
 *   seeded ("copied up") from the target
 *
 * All generation (bases, layers, consolidators) runs against the upper
 * layer via `stage.directory`. Because the upper layer is a real
 * directory, layers keep using `node:fs`, `ember-apply`, and even
 * subprocesses (`git`, package managers) exactly as they would against
 * the real project -- an in-process virtual fs can't offer that, since
 * child processes can't see it.
 *
 * Nothing touches the target until {@link Stage#commit}; {@link Stage#discard}
 * throws the upper layer away.
 */
export class Stage {
  /**
   * @param {string} targetDirectory the directory the project should end up in
   * @param {{ seed?: boolean }} [options]
   *   seed: copy the target's current contents into the stage first
   *   (a "copy up"). Defaults to true. Pass false to stage a from-scratch
   *   generation (e.g. the "replace" flow).
   * @returns {Promise<Stage>}
   */
  static async create(targetDirectory, options = {}) {
    const { seed = true } = options;
    const directory = await mkdtemp(join(tmpdir(), "ember.nvp-stage-"));
    const exists = existsSync(targetDirectory);

    if (exists && seed) {
      await cp(targetDirectory, directory, {
        recursive: true,
        force: true,
        filter: (source) => !ENVIRONMENT_DIRECTORIES.has(basename(source)),
      });
    }

    return new Stage(targetDirectory, directory, { isNew: !exists });
  }

  #target;
  #directory;
  #isNew;

  /**
   * Use {@link Stage.create} instead.
   *
   * @param {string} target
   * @param {string} directory
   * @param {{ isNew: boolean }} info
   */
  constructor(target, directory, info) {
    this.#target = target;
    this.#directory = directory;
    this.#isNew = info.isNew;
  }

  /**
   * The writable upper layer. Generate in here,
   * e.g. `new Project(stage.directory, desires)`.
   *
   * @type {string}
   */
  get directory() {
    return this.#directory;
  }

  /**
   * The directory a commit writes to.
   *
   * @type {string}
   */
  get targetDirectory() {
    return this.#target;
  }

  /**
   * Whether the target directory existed when the stage was created.
   *
   * @type {boolean}
   */
  get isNew() {
    return this.#isNew;
  }

  /**
   * Compares the upper layer to the target.
   *
   * @returns {Promise<Change[]>}
   */
  async changes() {
    const staged = await listFiles(this.#directory);
    const existing = existsSync(this.#target) ? await listFiles(this.#target) : new Set();

    /** @type {Change[]} */
    const changes = [];

    for (const path of staged) {
      if (!existing.has(path)) {
        changes.push({ path, status: "added" });
        continue;
      }

      const [before, after] = await Promise.all([
        readFile(join(this.#target, path)),
        readFile(join(this.#directory, path)),
      ]);

      if (!before.equals(after)) {
        changes.push({ path, status: "modified" });
      }
    }

    for (const path of existing) {
      if (!staged.has(path)) {
        changes.push({ path, status: "deleted" });
      }
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * A unified diff of the staged changes against the target,
   * colorized when stdout supports it.
   *
   * @param {Change[]} [changes] pass the result of {@link Stage#changes} to avoid recomputing
   * @returns {Promise<string>}
   */
  async diff(changes) {
    changes ??= await this.changes();

    const patches = [];

    for (const change of changes) {
      const before =
        change.status === "added" ? null : await readFile(join(this.#target, change.path));
      const after =
        change.status === "deleted" ? null : await readFile(join(this.#directory, change.path));

      patches.push(renderPatch(change, before, after));
    }

    return patches.join("\n");
  }

  /**
   * Applies the staged changes to the target directory, then removes the
   * stage. Only paths reported by {@link Stage#changes} are touched --
   * everything else in the target (untracked files, node_modules, .git)
   * is left alone.
   *
   * One exception: when the stage has a `.git` directory and the target
   * does not (the git layer ran `git init` inside the stage), the `.git`
   * directory is carried over so a freshly generated project keeps its
   * history.
   *
   * @param {Change[]} [changes] the changes to apply -- pass a subset of
   *   {@link Stage#changes} to apply only some of them (e.g. the ones a
   *   user accepted during review). Defaults to all staged changes.
   * @returns {Promise<Change[]>} the changes that were written
   */
  async commit(changes) {
    changes ??= await this.changes();

    await mkdir(this.#target, { recursive: true });

    for (const change of changes) {
      const targetPath = join(this.#target, change.path);

      if (change.status === "deleted") {
        await rm(targetPath, { force: true });
        continue;
      }

      await mkdir(dirname(targetPath), { recursive: true });
      await cp(join(this.#directory, change.path), targetPath, { force: true });
    }

    const stagedGit = join(this.#directory, ".git");
    const targetGit = join(this.#target, ".git");

    if (existsSync(stagedGit) && !existsSync(targetGit)) {
      await cp(stagedGit, targetGit, { recursive: true });
    }

    await this.discard();

    return changes;
  }

  /**
   * Removes the stage without writing anything to the target.
   */
  async discard() {
    await rm(this.#directory, { recursive: true, force: true });
  }
}

/**
 * All files (as paths relative to `directory`), excluding environment
 * directories. Includes dotfiles (`.gitignore`, `.github/`, ...), which
 * `fs.glob` would skip.
 *
 * @param {string} directory
 * @returns {Promise<Set<string>>}
 */
async function listFiles(directory) {
  /** @type {Set<string>} */
  const files = new Set();

  const entries = await readdir(directory, { withFileTypes: true, recursive: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const path = relative(directory, join(entry.parentPath, entry.name));

    if (path.split(sep).some((segment) => ENVIRONMENT_DIRECTORIES.has(segment))) {
      continue;
    }

    files.add(path);
  }

  return files;
}

/**
 * @param {Change} change
 * @param {Buffer | null} before
 * @param {Buffer | null} after
 * @returns {string}
 */
function renderPatch(change, before, after) {
  const header = styleText("bold", `${statusLabel(change.status)} ${change.path}`);

  if (before?.includes(0) || after?.includes(0)) {
    return `${header}\n${styleText("dim", "(binary file)")}\n`;
  }

  const patch = structuredPatch(
    change.path,
    change.path,
    before?.toString() ?? "",
    after?.toString() ?? "",
    undefined,
    undefined,
    { context: 3 },
  );

  const lines = [
    header,
    styleText("red", `--- ${change.status === "added" ? "/dev/null" : `a/${change.path}`}`),
    styleText("green", `+++ ${change.status === "deleted" ? "/dev/null" : `b/${change.path}`}`),
  ];

  for (const hunk of patch.hunks) {
    lines.push(
      styleText(
        "cyan",
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      ),
    );

    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(styleText("green", line));
      } else if (line.startsWith("-")) {
        lines.push(styleText("red", line));
      } else {
        lines.push(line);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * @param {ChangeStatus} status
 * @returns {string}
 */
function statusLabel(status) {
  switch (status) {
    case "added":
      return styleText("green", "A");
    case "modified":
      return styleText("yellow", "M");
    case "deleted":
      return styleText("red", "D");
  }
}

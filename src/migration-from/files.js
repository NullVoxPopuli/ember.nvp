import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/**
 * Never part of a project's own source
 */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "declarations", ".git"]);

/**
 * @param {string} root the project directory
 * @param {string} directory relative to `root`
 * @returns {string[]} every file below `directory`, relative to `root`, sorted
 */
export function listFiles(root, directory) {
  let absolute = join(root, directory);

  if (!existsSync(absolute)) return [];

  /** @type {string[]} */
  let files = [];

  collect(absolute, root, files);

  return files.sort();
}

/**
 * @param {string} directory
 * @param {string} root
 * @param {string[]} files
 */
function collect(directory, root, files) {
  for (let entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;

    let path = join(directory, entry.name);

    if (entry.isDirectory()) {
      collect(path, root, files);
    } else if (entry.isFile()) {
      files.push(relative(root, path).split(sep).join("/"));
    }
  }
}

/**
 * @param {string} root the project directory
 * @param {string[]} directories relative to `root`
 * @param {string[]} extensions such as `.hbs`
 * @returns {string[]}
 */
export function filesWithExtension(root, directories, extensions) {
  /** @type {string[]} */
  let result = [];

  for (let directory of directories) {
    for (let file of listFiles(root, directory)) {
      if (extensions.some((extension) => file.endsWith(extension))) {
        result.push(file);
      }
    }
  }

  return result;
}

/**
 * Tests that render with `hbs` from ember-cli-htmlbars (or its older aliases).
 *
 * Those templates are loose mode:
 * components are looked up by name at runtime,
 * and the babel plugin that compiles them is part of ember-cli.
 *
 * @param {string} root the project directory
 * @param {string[]} directories relative to `root`
 * @returns {string[]}
 */
export function testsWithHbs(root, directories) {
  let candidates = filesWithExtension(root, directories, [".js", ".ts"]);

  return candidates.filter((file) => {
    let source = readFileSync(join(root, file), "utf-8");

    return /from\s+["'](ember-cli-htmlbars|htmlbars-inline-precompile|ember-cli-htmlbars-inline-precompile)["']/.test(
      source,
    );
  });
}

/**
 * The first of `names` that exists in `root`
 *
 * @param {string} root
 * @param {string[]} names
 * @returns {string | undefined}
 */
export function firstExisting(root, names) {
  return names.find((name) => existsSync(join(root, name)));
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string[]} paths files or directories, relative to the project
 */
export async function remove(project, paths) {
  for (let path of paths) {
    await rm(project.path(path), { recursive: true, force: true });
  }
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} from relative to the project
 * @param {string} to relative to the project
 */
export async function move(project, from, to) {
  await mkdir(dirname(project.path(to)), { recursive: true });
  await rename(project.path(from), project.path(to));
}

import latestVersion, { VersionNotFoundError } from "latest-version";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import semver from "semver";

/**
 * @type {{ [name: string]: { [version: string]: string } }}
 */
const CACHE = {};

/**
 * Local, not-yet-published workspace packages.
 * These must be `link:`ed rather than resolved from the registry.
 *
 * Maps the published package name to its folder under `packages/`.
 *
 * @type {{ [name: string]: string }}
 */
const LOCAL_PACKAGES = {
  "@nullvoxpopuli/ember-vite": "vite",
  "@nullvoxpopuli/ember-rolldown": "rolldown",
};

/**
 * @param {{ [name: string]: string }} deps map of dep name to semver range
 */
export async function getLatest(deps) {
  let needsLocalLink = await needsWorkspace();

  let results = await Promise.all(
    Object.entries(deps).map(async ([dep, range]) => {
      let existing = CACHE[dep]?.[range];

      if (existing) {
        return [dep, existing];
      }

      let version;
      let alias = parseAlias(range);

      /**
       * HACK FOR CI.
       *
       * In practice, these packages will be published separately,
       * and those versions will be used.
       *
       * Only the local, not-yet-published @nullvoxpopuli/ember-* packages need the link.
       * Every other dependency must still resolve its real version.
       *
       * We use `link:` (a symlink) rather than `file:` (a copy into the store) on purpose:
       * - the packages ship TypeScript source
       * - Node 24 refuses to strip types for files physically located under node_modules
       * - a symlink makes Node resolve the realpath to packages/* (outside node_modules),
       *   so its `.ts` runs directly
       */
      if (needsLocalLink && LOCAL_PACKAGES[dep]) {
        version =
          "link:" + resolve(join(import.meta.dirname, "../../packages", LOCAL_PACKAGES[dep]));
      } else if (alias) {
        version = `npm:${alias.name}@${await bump(alias.name, alias.range)}`;
      } else {
        /**
         * The templates use `workspace:*` for the packages in this repo, which are published.
         * A workspace package of the user's project stays `workspace:`, because it is not on npm,
         * or another package has its name there.
         */
        if (range == "workspace:*" && LOCAL_PACKAGES[dep]) {
          range = "latest";
        }
        version = isFromRegistry(range) ? await bump(dep, range) : range;
      }

      CACHE[dep] ||= {};
      CACHE[dep][range] = version;

      return [dep, version];
    }),
  );

  return Object.fromEntries(results);
}

/**
 * git, file, link, url, and catalog specs have no registry version to bump to.
 *
 * Semver ranges and dist-tags never contain `:` or `/`.
 *
 * @param {string} range
 */
function isFromRegistry(range) {
  return !/[:/]/.test(range);
}

/**
 * Moves a range to the newest version it allows, and keeps its kind:
 * - `^5.4.1` becomes `^5.5.2`, and `~` works the same way
 * - an exact version stays exact
 * - a dist-tag becomes the version it points at
 *
 * Other ranges (`>= 4.1.0`, `1.x`, `^1 || ^2`) stay as written.
 * A new floor there would drop versions that the project supports.
 *
 * @param {string} name
 * @param {string} range
 */
async function bump(name, range) {
  let isTag = !semver.validRange(range);
  let isExact = Boolean(semver.valid(range));
  let [, operator = ""] = /^([\^~])\s*v?\d[\w.+-]*$/.exec(range) ?? [];

  if (!isTag && !isExact && !operator) return range;

  return operator + (await resolveVersion(name, range));
}

/**
 * Deprecated versions are skipped when the range allows another version.
 *
 * A package can deprecate a whole major (ESLint 9, once 10 was out).
 * An existing project can still ask for that range.
 *
 * @param {string} name
 * @param {string} range
 */
async function resolveVersion(name, range) {
  try {
    return await latestVersion(name, { version: range });
  } catch (error) {
    if (!(error instanceof VersionNotFoundError)) throw error;

    return await latestVersion(name, { version: range, omitDeprecated: false });
  }
}

/**
 * An npm alias installs a package under another name:
 *
 *   "@typescript/native": "npm:typescript@^7.1.0-0"
 *
 * The range belongs to the aliased package.
 *
 * @param {string} range
 * @returns {{ name: string; range: string } | undefined}
 */
function parseAlias(range) {
  if (!range.startsWith("npm:")) return;

  let spec = range.slice("npm:".length);
  // The last `@` starts the range. A scope's `@` is at index 0.
  let at = spec.lastIndexOf("@");

  if (at <= 0) {
    return { name: spec, range: "latest" };
  }

  return { name: spec.slice(0, at), range: spec.slice(at + 1) };
}

async function needsWorkspace() {
  if (process.env.GITHUB_REPOSITORY === "NullVoxPopuli/ember.nvp") return true;

  let root = resolve(import.meta.dirname, "../../");

  if (existsSync(join(root, ".git"))) {
    return true;
  }

  return false;
}

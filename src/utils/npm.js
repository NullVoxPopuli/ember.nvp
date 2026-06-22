import latestVersion from "latest-version";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @type {{ [name: string]: { [version: string]: string } }}
 */
const CACHE = {};

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

      /**
       * HACK FOR CI.
       * In practice, this package will be published separately, and that version will be used.
       * Only the local, not-yet-published @nullvoxpopuli/ember-vite package needs the link;
       * every other dependency must still resolve its real version.
       *
       * We use `link:` (a symlink) rather than `file:` (a copy into the store)
       * on purpose: the package ships TypeScript source, and Node 24 refuses to
       * strip types for files physically located under node_modules. A symlink
       * makes Node resolve the realpath to packages/vite (outside node_modules),
       * so its `.ts` runs directly.
       */
      if (needsLocalLink && dep === "@nullvoxpopuli/ember-vite") {
        version = "link:" + resolve(join(import.meta.dirname, "../../packages/vite"));
      } else {
        if (range == "workspace:*") {
          range = "latest";
        }
        version = await latestVersion(dep, { version: range });
      }

      CACHE[dep] ||= {};
      CACHE[dep][range] = version;

      return [dep, version];
    }),
  );

  return Object.fromEntries(results);
}

async function needsWorkspace() {
  if (process.env.GITHUB_REPOSITORY === "NullVoxPopuli/ember.nvp") return true;

  let root = resolve(import.meta.dirname, "../../");

  if (existsSync(join(root, ".git"))) {
    return true;
  }

  return false;
}

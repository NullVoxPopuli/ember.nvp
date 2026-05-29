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
  let needsFileLink = await needsWorkspace();

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
       */
      if (needsFileLink) {
        version = "file:" + resolve(join(import.meta.dirname, "../../packages/vite"));
      } else {
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
  if ( process.env.GITHUB_REPOSITORY === "NullVoxPopuli/ember.nvp")
    
    return true;


  let root = resolve(import.meta.dirname, '../../');

  if (existsSync(join(root, '.git'))) {
    return true;
  }

  return false;

}
import latestVersion from "latest-version";
import { join } from "node:path";

/**
 * @type {{ [name: string]: { [version: string]: string } }}
 */
const CACHE = {};

/**
 * @param {{ [name: string]: string }} deps map of dep name to semver range
 */
export async function getLatest(deps) {
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
      if (process.env.GITHUB_REPOSITORY === "NullVoxPopuli/ember.nvp") {
        version = "file:" + join(import.meta.dirname, "../../packages/vite");
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

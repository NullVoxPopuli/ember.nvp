import latestVersion from "latest-version";

/**
 * @type {{ [name: string]: { [version: string]: string } }}
 */
const CACHE = {

}

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

      let version = await latestVersion(dep, { version: range });

      CACHE[dep] ||= {};
      CACHE[dep][range] = version;

      return [dep, version];
    }),
  );

  return Object.fromEntries(results);
}

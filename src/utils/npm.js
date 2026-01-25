import latestVersion from "latest-version";

/**
 * @param {{ [name: string]: string }} deps map of dep name to semver range
 */
export async function getLatest(deps) {
  let results = await Promise.all(
    Object.entries(deps).map(async ([dep, range]) => {
      let version = await latestVersion(dep, { version: range });

      return [dep, version];
    }),
  );

  return Object.fromEntries(results);
}

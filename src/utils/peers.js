import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";

/**
 * The packages that a layer installs, for which an installed package declares a peer range
 * that the new version does not satisfy, such as ember-data's optional peer `qunit@^2`
 * next to the qunit layer's qunit 3.
 *
 * @param {string} directory the project
 * @param {Record<string, string>} installed the ranges that the layer installs, by name
 * @returns {string[]}
 */
export function outdatedPeers(directory, installed) {
  let modules = join(directory, "node_modules");

  if (!existsSync(modules)) return [];

  /** @type {Set<string>} */
  let outdated = new Set();

  for (let folder of globSync(["*/package.json", "@*/*/package.json"], { cwd: modules })) {
    let manifest = JSON.parse(readFileSync(join(modules, folder), "utf-8"));

    for (let [name, peer] of Object.entries(manifest.peerDependencies ?? {})) {
      let range = installed[name];
      let version = range && semver.validRange(range) ? semver.minVersion(range) : undefined;

      if (version && semver.validRange(String(peer)) && !semver.satisfies(version, String(peer))) {
        outdated.add(name);
      }
    }
  }

  return Array.from(outdated).sort();
}

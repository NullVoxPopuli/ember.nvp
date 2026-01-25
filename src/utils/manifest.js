import { hasAllKeys } from "./object.js";

/**
 * @param {Record<string, any>} manifest
 * @param {string[] | Record<string, unknown>} listOrObject
 */
export function hasDevDeps(manifest, listOrObject) {
  return hasAllKeys(manifest.devDependencies ?? {}, listOrObject);
}

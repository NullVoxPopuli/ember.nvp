/**
 * Libraries and custom elements share one toolchain:
 * - built with tsdown
 * - no babel config
 * - published to npm
 *
 * Layers that branch on "is this a library?" must treat both the same.
 *
 * This module has no imports on purpose.
 * Layers are loaded by `#layers`, and `#utils/project.js` imports `#layers`.
 * A layer that imports `#utils/project.js` at the top level
 * creates a cycle that never settles, and Node exits with code 13.
 *
 * @param {import('#types').ProjectType} type
 * @returns {boolean}
 */
export function isLibraryType(type) {
  return type === "library" || type === "custom-element";
}

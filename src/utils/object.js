/**
 * @param {Record<string, unknown>} object
 * @param {string[] | Record<string, unknown>} keysOrObject
 */
export function hasAllKeys(object, keysOrObject) {
  let keysToCheck = Array.isArray(keysOrObject) ? keysOrObject : Object.keys(keysOrObject);
  let fromObject = new Set(Object.keys(object));

  return keysToCheck.every((key) => fromObject.has(key));
}

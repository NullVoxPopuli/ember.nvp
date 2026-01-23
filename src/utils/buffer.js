/**
 * from https://github.com/ember-cli/ember-cli/blob/8ea5b2e22d37805f5749a4917e0ef25fac3c9cda/lib/models/blueprint.js#L1789
 *
 *  Takes a substring of a string based on byte offsets.

 * @param {string} value : The input string.
 * @param {number} start : The byte index of the substring start.
 * @param {number} end : The byte index of the substring end.
 * @return {string} : The substring.
 */
export function substringBytes(value, start, end) {
  const buf = Buffer.from(value);

  return buf.subarray(start, end).toString();
}

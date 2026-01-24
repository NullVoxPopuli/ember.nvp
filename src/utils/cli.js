import { styleText } from "node:util";

export function isInteractive() {
  const isTerminalInteractive = process.stdout.isTTY;

  return isTerminalInteractive;
}

/**
 * I would like to have selecs look more like a table,
 * but @clack/prompts makes this a bit hard.
 *
 * I tried using padding, but then when it prints your selection,
 * I don't think there is a way to format just that, so
 * there are a bunch of goofy spacings in the labels.
 */
const PADDING = 10;

/**
 * @param {string} name
 * @param {string} [subTitle]
 */
export function formatLabel(name, subTitle) {
  if (!subTitle) {
    return padToWidth(name, PADDING);
  }

  return padToWidth(name, PADDING) + styleText("magentaBright", subTitle);
}

/**
 * @param {string} input
 * @param {number} maxWidth
 * @param {{ side?: 'right' | 'left' }} [options]
 */
function padToWidth(input, maxWidth, { side = "right" } = {}) {
  let str = String(input);
  let width = Math.max(0, maxWidth | 0);

  if (str.length >= width) return str;

  let spaces = " ".repeat(width - str.length);

  return side === "left" ? spaces + str : str + spaces;
}

import { styleText } from "node:util";

export function isInteractive() {
  const isTerminalInteractive = process.stdout.isTTY;

  return isTerminalInteractive;
}

export function formatLabel(name, subTitle) {
  if (!subTitle) {
    return padToWidth(name, 12);
  }

  return padToWidth(name, 12) + styleText("magentaBright", subTitle);
}

function padToWidth(input, maxWidth, { side = "right" } = {}) {
  let str = String(input);
  let width = Math.max(0, maxWidth | 0);

  if (str.length >= width) return str;

  let spaces = " ".repeat(width - str.length);

  return side === "left" ? spaces + str : str + spaces;
}

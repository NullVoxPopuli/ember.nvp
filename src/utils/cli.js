export function isInteractive() {
  const isTerminalInteractive = process.stdout.isTTY;

  return isTerminalInteractive;
}

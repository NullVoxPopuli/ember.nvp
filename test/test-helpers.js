const minimalApp = "minimal-app";
const minimalAddon = "minimal-library";

export const bases = [minimalApp, minimalAddon];

export function permutate(items) {
  const toPermutate = items.filter((item) => !item.startsWith("minimal")).sort();

  const out = [];

  function backtrack(startIndex, prefix) {
    if (prefix.length > 0) out.push(prefix.slice());

    for (let i = startIndex; i < toPermutate.length; i++) {
      if (i > startIndex && toPermutate[i] === toPermutate[i - 1]) continue; // skip dup
      prefix.push(toPermutate[i]);
      backtrack(i + 1, prefix);
      prefix.pop();
    }
  }

  backtrack(0, []);
  return out;
}

import * as p from "@clack/prompts";

export async function askPackageManager() {

  const packageManager = await p.select({
    message: "Which package manager?",
    options: [
      { value: "pnpm", label: "pnpm", hint: "Fast, disk space efficient" },
      { value: "npm", label: "npm", hint: "Node default" },
      { value: "yarn", label: "yarn", hint: "Classic alternative" },
    ],
  });

  if (p.isCancel(packageManager)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return packageManager;
}


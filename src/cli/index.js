#!/usr/bin/env node

import * as p from "@clack/prompts";
import { join } from "node:path";
import pc from "picocolors";
import { generateProject } from "./generator.js";
import { askName } from './questions/name.js';
import { askLayers } from './questions/layers.js';
import { askPackageManager } from './questions/package-manager.js';

async function main() {
  console.clear();

  p.intro(pc.bgCyan(pc.black(" ember.nvp ")));

  const projectName = await askName();
  const selectedLayers = await askLayers();
  const packageManager = await askPackageManager();

  const s = p.spinner();
  s.start("Creating your Ember app...");

  try {
    // Generate the project
    const projectPath = join(process.cwd(), projectName);
    await generateProject(projectPath, projectName, selectedLayers);

    s.stop("Project created!");

    p.note(
      `cd ${projectName}\n` +
      `${packageManager} install\n` +
      `${packageManager} ${packageManager === "npm" ? "run " : ""}start`,
      "Next steps",
    );

    p.outro(pc.green("✓") + " Project ready! " + pc.dim("Happy coding!"));
  } catch (err) {
    s.stop("Failed to create project");
    p.cancel(`Error: ${err.message}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

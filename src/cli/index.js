#!/usr/bin/env node

import * as p from "@clack/prompts";
import { join } from "node:path";
import { generateProject } from "./generator.js";
import { askName } from "./questions/name.js";
import { askLayers } from "./questions/layers.js";
import { askProjectType } from "./questions/project-type.js";
import { askPackageManager } from "./questions/package-manager.js";
import { styleText } from "node:util";

async function main() {
  console.clear();

  p.intro(styleText(["bgCyan", "black"], " ember.nvp "));

  const projectName = await askName();
  const projectType = await askProjectType();
  const selectedLayers = await askLayers();
  const packageManager = await askPackageManager();

  const s = p.spinner();
  s.start("Creating your Ember app...");

  try {
    // Generate the project
    const projectPath = join(process.cwd(), projectName);
    await generateProject({
      projectType,
      projectPath,
      projectName,
      selectedLayers,
    });

    s.stop("Project created!");

    p.note(
      `cd ${projectName}\n` +
        `${packageManager} install\n` +
        `${packageManager} ${packageManager === "npm" ? "run " : ""}start`,
      "Next steps",
    );

    p.outro(styleText("green", "✓") + " Project ready! " + styleText("dim", "Happy coding!"));
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

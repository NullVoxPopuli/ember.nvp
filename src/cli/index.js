#!/usr/bin/env node

import * as p from "@clack/prompts";
import { generateProject } from "./generator.js";
import { askName } from "./questions/name.js";
import { askLayers } from "./questions/layers.js";
import { askProjectType } from "./questions/project-type.js";
import { askPackageManager } from "./questions/package-manager.js";
import { askPath } from "./questions/path.js";
import { askIfOK } from "./questions/ok.js";
import { styleText } from "node:util";
import { Project } from "#utils/project.js";

/**
 * This whole file's primary purpose is to be an interactive CLI
 * for `generateProject`.
 *
 * Other tools can call `generateProject` themselves if they wish
 * if they want to provide different TUI/GUIs.
 */
async function main() {
  console.clear();

  p.intro(styleText(["bgCyan", "black"], " ember.nvp "));

  const projectName = await askName();
  const projectPath = await askPath(projectName);
  const projectType = await askProjectType();
  const selectedLayers = await askLayers();
  const packageManager = await askPackageManager();

  let project = new Project(projectPath, {
    name: projectName,
    type: projectType,
    path: projectPath,
    layers: selectedLayers,
    packageManager,
  });

  await askIfOK();

  const s = p.spinner();
  s.start("Creating your Ember app...");

  try {
    // Generate the project
    await generateProject(project);

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
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

import * as p from "@clack/prompts";
import { generateProject } from "./generator.js";
import { askName } from "./questions/name.js";
import { askLayers } from "./questions/layers.js";
import { askProjectType } from "./questions/project-type.js";
import { askPackageManager } from "./questions/package-manager.js";
import { askPath } from "./questions/path.js";
import { askIfOK } from "./questions/ok.js";
import { askToWrite } from "./questions/write.js";
import { styleText } from "node:util";
import { rm } from "node:fs/promises";
import { Project } from "#utils/project.js";
import { Stage } from "#utils/stage.js";
import { askReplaceOrUpdate } from "./questions/replace-or-update.js";

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
  const replaceOrUpdate = await askReplaceOrUpdate(projectPath);
  const projectType = await askProjectType();
  const selectedLayers = await askLayers();
  const packageManager = await askPackageManager();

  await askIfOK();

  /**
   * Everything is generated in a stage: a real directory (in the OS temp
   * dir) acting as a writable overlay of the target directory.
   *
   * When updating an existing project, the stage is seeded with a full
   * copy of it (sans node_modules/.git), so the bases and layers run
   * against the project's current state -- isSetup checks, package.json
   * reads, file existence checks, etc. all see the existing files, and
   * the codemods modify them in the stage exactly as if they were
   * operating in place. "replace" starts from an empty stage instead.
   *
   * The target itself is not touched until stage.commit() below, which
   * applies the difference between the stage and the target (or the
   * subset of it the user accepts during review).
   */
  const stage = await Stage.create(projectPath, { seed: replaceOrUpdate !== "replace" });

  let project = new Project(stage.directory, {
    name: projectName,
    type: projectType,
    path: projectPath,
    layers: selectedLayers,
    packageManager,
  });

  const s = p.spinner();
  s.start("Creating your Ember app...");

  try {
    // Generate the project (into the stage)
    await generateProject(project);

    s.stop("Project generated");
  } catch (err) {
    s.stop("Failed to create project");

    await stage.discard();

    if (err instanceof Error) {
      p.cancel(`Error: ${err.message}`);
      if (err.stack) {
        console.error(err.stack);
      }

      process.exit(1);
    }

    p.cancel(`Error: ${String(err)}`);
    process.exit(1);
  }

  const changes = await stage.changes();

  if (changes.length === 0 && replaceOrUpdate !== "replace") {
    await stage.discard();

    p.outro(styleText("green", "✓") + " Already up to date -- nothing to write.");
    return;
  }

  /**
   * New projects (and "replace", which was already confirmed) are written
   * without asking. Updates to an existing project must be confirmed:
   * write all / review each change (accept/reject) / cancel.
   */
  const isUpdate = !stage.isNew && replaceOrUpdate !== "replace";

  const toApply = isUpdate ? await askToWrite(stage, changes) : changes;

  if (!toApply || toApply.length === 0) {
    await stage.discard();

    p.cancel("Cancelled -- no files were written");
    return process.exit(0);
  }

  if (replaceOrUpdate === "replace") {
    await rm(projectPath, { recursive: true, force: true });
  }

  await stage.commit(toApply);

  p.log.success(`Applied ${toApply.length} change${toApply.length === 1 ? "" : "s"}`);

  p.note(
    `cd ${projectName}\n` +
      `${packageManager} install\n` +
      `${packageManager} ${packageManager === "npm" ? "run " : ""}start`,
    "Next steps",
  );

  p.outro(styleText("green", "✓") + " Project ready! " + styleText("dim", "Happy coding!"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

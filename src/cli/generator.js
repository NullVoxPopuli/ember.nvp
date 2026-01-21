import { mkdir } from "node:fs/promises";

/**
 * Generate project files by running layer functions
 */
export async function generateProject(projectPath, projectName, layers) {
  // Create project directory
  await mkdir(projectPath, { recursive: true });

  // Run each layer's run function in sequence
  for (const layer of layers) {
    if (typeof layer.run === "function") {
      await layer.run({
        targetDir: projectPath,
        projectName,
      });
    }
  }
}

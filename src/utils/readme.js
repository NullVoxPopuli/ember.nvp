import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Render a template string replacing double-at (@@) tokens with project values.
 *
 * @param {string} template
 * @param {import('./project.js').Project} project
 * @returns {string}
 */
export function renderTemplate(template, project) {
  const pm = project.packageManager;
  const run = pm === "npm" ? "npm run" : "pnpm";

  return template
    .replaceAll("@@NAME@@", project.name)
    .replaceAll("@@TYPE@@", project.type)
    .replaceAll("@@PM@@", pm)
    .replaceAll("@@RUN@@", run);
}

/**
 * Reads README.template.md from a layer directory and renders tokens using project context.
 *
 * @param {string} layerDir
 * @param {import('./project.js').Project} project
 * @returns {Promise<string | undefined>}
 */
export async function renderLayerReadme(layerDir, project) {
  const templatePath = join(layerDir, "README.template.md");
  if (!existsSync(templatePath)) {
    return undefined;
  }

  const raw = await readFile(templatePath, "utf-8");
  return renderTemplate(raw, project);
}

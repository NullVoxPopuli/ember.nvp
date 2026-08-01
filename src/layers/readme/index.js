import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatLabel } from "#utils/cli.js";
import { renderTemplate } from "#utils/readme.js";

export default {
  label: formatLabel("README.md", "generate project documentation"),
  hint: "project README",

  async defaultValue() {
    return true;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    const templateFileName = `${project.type}.md`;
    let templatePath = join(import.meta.dirname, "templates", templateFileName);

    if (!existsSync(templatePath)) {
      templatePath = join(import.meta.dirname, "templates", "app.md");
    }

    const rawTemplate = await readFile(templatePath, "utf-8");
    let content = renderTemplate(rawTemplate, project);

    // Collect layer docs
    const layerDocs = [];
    for (const layer of project.desires.layers) {
      if (layer.name === "readme" || !layer.readme) {
        continue;
      }

      let doc;
      if (typeof layer.readme === "function") {
        doc = await layer.readme(project);
      } else if (typeof layer.readme === "string") {
        doc = renderTemplate(layer.readme, project);
      }

      if (doc && typeof doc === "string" && doc.trim().length > 0) {
        layerDocs.push(doc.trim());
      }
    }

    let layerDocsMarkdown = "";
    if (layerDocs.length > 0) {
      layerDocsMarkdown = "\n## Features & Tooling\n\n" + layerDocs.join("\n\n") + "\n";
    }

    content = content.replace("@@LAYER_DOCS@@", layerDocsMarkdown).trim() + "\n";

    const targetPath = join(project.directory, "README.md");
    await writeFile(targetPath, content, "utf-8");
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    return existsSync(join(project.directory, "README.md"));
  },
};

import { packageJson, files, js } from "ember-apply";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal Layer
 *
 * Provides the absolute bare minimum for an Ember app:
 * - type: "module" in package.json
 * - No @embroider/compat (no-compat mode)
 * - No testing framework
 * - No linting or formatting
 * - No ember-welcome-page
 * - No warp-drive (opt-in if needed)
 */
export default {
  label: "Minimal Base",
  description: "Bare minimum Ember app structure",

  async run({ targetDir, projectName }) {
    // Apply all files from the files directory
    await files.applyFolder(join(__dirname, "files"), targetDir);

    // Replace __PROJECT_NAME__ placeholders in specific files
    const filesToUpdate = [
      join(targetDir, "app", "config.ts"),
      join(targetDir, "app", "templates", "application.gts"),
      join(targetDir, "index.html"),
    ];

    for (const filePath of filesToUpdate) {
      const content = await readFile(filePath, "utf-8");
      const updated = content.replaceAll("__PROJECT_NAME__", projectName);
      await files.copyFileTo(filePath, { content: updated });
    }

    // Add dependencies
    await packageJson.addDependencies(
      {
        "@glimmer/component": "^1.1.2",
        "@glimmer/tracking": "^1.1.2",
        "@embroider/core": "^3.4.16",
        "@embroider/macros": "^1.16.7",
        "@embroider/router": "^2.1.8",
        "@embroider/vite": "^6.0.2",
        "@embroider/virtual": "^3.4.16",
        "ember-page-title": "^8.2.4",
        "ember-resolver": "^14.0.0",
        "ember-source": "^6.0.1",
        vite: "^6.0.3",
      },
      targetDir,
    );

    // Add devDependencies
    await packageJson.addDevDependencies(
      {
        "@babel/core": "^7.26.0",
        "@babel/plugin-transform-typescript": "^7.26.3",
        "@rollup/plugin-babel": "^6.0.4",
        "@tsconfig/ember": "^3.0.8",
        typescript: "^5.7.3",
      },
      targetDir,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        start: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      targetDir,
    );

    // Update package.json to set type: "module" and other metadata
    await packageJson.modify((json) => {
      json.name = projectName;
      json.version = "0.0.0";
      json.private = true;
      json.type = "module";
      return json;
    }, targetDir);
  },
};

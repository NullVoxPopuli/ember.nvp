import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatLabel } from "#utils/cli.js";

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} layerDocsMarkdown
 */
function appReadme(project, layerDocsMarkdown) {
  return `# ${project.name}

An Ember application created with \`ember.nvp\`.

## Getting Started

### Prerequisites

- Node.js >= 24
- ${project.packageManager}

### Installation

~~~sh
${project.packageManager} install
~~~

### Development

To start the local development server:

~~~sh
${project.runPrefix} dev
~~~

or

~~~sh
${project.runPrefix} start
~~~
${layerDocsMarkdown}`;
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} layerDocsMarkdown
 */
function extensionReadme(project, layerDocsMarkdown) {
  return `# ${project.name}

A browser extension using Ember created with \`ember.nvp\`.

## Getting Started

### Prerequisites

- Node.js >= 24
- ${project.packageManager}

### Development

To start development:

~~~sh
${project.runPrefix} dev
~~~

or

~~~sh
${project.runPrefix} start
~~~

### Building

To build the library:

~~~sh
${project.runPrefix} build
~~~

or

~~~sh
${project.runPrefix} build:watch
~~~
${layerDocsMarkdown}`;
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} layerDocsMarkdown
 */
function libraryReadme(project, layerDocsMarkdown) {
  return `# ${project.name}

An Ember library/addon created with \`ember.nvp\`.

## Getting Started

### Prerequisites

- Node.js >= 24
- ${project.packageManager}

### Development & Building

To build the library:

~~~sh
${project.runPrefix} build
~~~
${layerDocsMarkdown}`;
}

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
        doc = layer.readme;
      }

      if (doc && typeof doc === "string" && doc.trim().length > 0) {
        layerDocs.push(doc.trim());
      }
    }

    let layerDocsMarkdown = "";
    if (layerDocs.length > 0) {
      layerDocsMarkdown = `\n## Features & Tooling\n\n${layerDocs.join("\n\n")}\n`;
    }

    // Merge the layers' snippets into the main readme template
    let content;
    switch (project.type) {
      case "extension":
        content = extensionReadme(project, layerDocsMarkdown);
        break;
      case "library":
        content = libraryReadme(project, layerDocsMarkdown);
        break;
      default:
        content = appReadme(project, layerDocsMarkdown);
        break;
    }

    const targetPath = join(project.directory, "README.md");
    await writeFile(targetPath, `${content.trim()}\n`, "utf-8");
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async isSetup(project) {
    return existsSync(join(project.directory, "README.md"));
  },
};

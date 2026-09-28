import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatLabel } from "#utils/cli.js";
import { tagNameFor } from "#bases/minimal-custom-element";

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

\`\`\`sh
${project.packageManager} install
\`\`\`

### Development

To start the local development server:

\`\`\`sh
${project.runPrefix} dev
\`\`\`

or

\`\`\`sh
${project.runPrefix} start
\`\`\`
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

\`\`\`sh
${project.runPrefix} dev
\`\`\`

or

\`\`\`sh
${project.runPrefix} start
\`\`\`

### Building

To build the extension:

\`\`\`sh
${project.runPrefix} build
\`\`\`

or, to rebuild on change:

\`\`\`sh
${project.runPrefix} build:watch
\`\`\`
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

\`\`\`sh
${project.runPrefix} build
\`\`\`
${layerDocsMarkdown}`;
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} layerDocsMarkdown
 */
function customElementReadme(project, layerDocsMarkdown) {
  let tagName = tagNameFor(project.name);

  return `# ${project.name}

An Ember component, packaged as a custom element, created with \`ember.nvp\`.
The built package contains ember, so the page that uses the element needs nothing else.

## Usage

Import the \`register\` entry once. It defines the \`<${tagName}>\` tag.

\`\`\`js
import "${project.name}/register";
\`\`\`

\`\`\`html
<${tagName} label="Clicks" step="2"></${tagName}>
\`\`\`

To choose your own tag name, import the class and define it yourself:

\`\`\`js
import { CounterElement } from "${project.name}";

customElements.define("my-counter", CounterElement);
\`\`\`

## Getting Started

### Prerequisites

- Node.js >= 24
- ${project.packageManager}

### Development & Building

To build the package:

\`\`\`sh
${project.runPrefix} build
\`\`\`
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

    let content;
    switch (project.type) {
      case "extension":
        content = extensionReadme(project, layerDocsMarkdown);
        break;
      case "library":
        content = libraryReadme(project, layerDocsMarkdown);
        break;
      case "custom-element":
        content = customElementReadme(project, layerDocsMarkdown);
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

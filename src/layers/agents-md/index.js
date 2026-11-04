import { packageJson } from "ember-apply";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatLabel } from "#utils/cli.js";

/**
 * ember.nvp owns the text between these markers, and writes it again on every run.
 * Text outside them belongs to the user.
 */
const START = "<!-- ember.nvp:start -->";
const END = "<!-- ember.nvp:end -->";

/**
 * Pages of the Ember guides, as raw markdown on these guides-source PR branches:
 * - templates: https://github.com/ember-learn/guides-source/pull/2248
 * - application state: https://github.com/ember-learn/guides-source/pull/2237
 * - reactivity: https://github.com/ember-learn/guides-source/pull/2219
 *
 * Agents read raw markdown more cheaply than a rendered page.
 */
const GUIDES = {
  templates:
    "https://raw.githubusercontent.com/ember-learn/guides-source/t3/port-glimmer-cheatsheet-reference/guides/release/reference/templates.md",
  state:
    "https://raw.githubusercontent.com/ember-learn/guides-source/nvp/lifetimes-of-state/guides/release/application-state/index.md",
  reactivity:
    "https://raw.githubusercontent.com/NullVoxPopuli/guides-source/nvp/reactivity/guides/release/in-depth-topics/reactivity/index.md",
};

/**
 * Template keywords that need no import.
 * The layer test renders a template that uses each one without an import.
 */
export const KEYWORDS = ["on", "fn", "eq", "not", "and", "or"];

/**
 * @param {import('#utils/project.js').Project} project
 */
async function scripts(project) {
  let manifest = await packageJson.read(project.directory);
  let names = Object.keys(manifest.scripts ?? {});

  if (names.length === 0) return "";

  return `## Scripts

${names.map((name) => `- \`${project.runPrefix} ${name}\`: \`${manifest.scripts[name]}\``).join("\n")}`;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function aliases(project) {
  let manifest = await packageJson.read(project.directory);
  let entries = Object.entries(manifest.imports ?? {});

  if (entries.length === 0) return "";

  return `## Import aliases

From \`imports\` in \`package.json\`:

${entries.map(([alias, target]) => `- \`${alias}\` → \`${typeof target === "string" ? target : JSON.stringify(target)}\``).join("\n")}`;
}

const APP_LAYOUT = `## Project layout

- \`app/app\` registers the modules in \`app/router\`, \`app/routes/\`, \`app/templates/\`, and \`app/services/\`.
  Everything else (components, helpers, modifiers, utils) is imported where it is used.
- Services from libraries are not registered automatically.
  Re-export each one in \`app/services/\`, for example \`app/services/page-title.js\`:

  \`\`\`js
  export { default } from "ember-page-title/services/page-title";
  \`\`\``;

const GUIDES_SECTION = `## Guides

- [Templates](${GUIDES.templates}): syntax, keywords, and helpers.
  In \`<template>\`, these are keywords and need no import: ${KEYWORDS.map((word) => `\`${word}\``).join(", ")}, and the other comparison helpers in the reference.
- [Application state](${GUIDES.state}): where each piece of state lives.
- [Reactivity](${GUIDES.reactivity}): tracked state and derived state.`;

/**
 * @param {import('#utils/project.js').Project} project
 */
async function layerSections(project) {
  let sections = [];

  for (let layer of project.desires.layers) {
    if (!layer.agents) continue;

    let text = typeof layer.agents === "function" ? await layer.agents(project) : layer.agents;

    if (text && text.trim().length > 0) sections.push(text.trim());
  }

  return sections;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function block(project) {
  let sections = [
    `# ${project.name}

An Ember ${project.type}, generated with [ember.nvp](https://github.com/NullVoxPopuli/ember.nvp).`,
    await scripts(project),
    project.type === "app" ? APP_LAYOUT : "",
    await aliases(project),
    GUIDES_SECTION,
  ];

  for (let section of await layerSections(project)) sections.push(section);

  return `${START}\n${sections.filter(Boolean).join("\n\n")}\n${END}`;
}

/**
 * @param {string | undefined} existing
 * @param {string} owned
 */
function withBlock(existing, owned) {
  if (!existing) return `${owned}\n`;

  let start = existing.indexOf(START);
  let end = existing.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    return `${existing.trimEnd()}\n\n${owned}\n`;
  }

  return existing.slice(0, start) + owned + existing.slice(end + END.length);
}

/**
 * @param {string} path
 */
async function readIfExists(path) {
  return existsSync(path) ? readFile(path, "utf-8") : undefined;
}

export default {
  label: formatLabel("AGENTS.md", "notes for coding agents"),
  hint: "project notes that coding agents read",

  async defaultValue() {
    return true;
  },

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    let agentsPath = join(project.directory, "AGENTS.md");

    await writeFile(agentsPath, withBlock(await readIfExists(agentsPath), await block(project)));
  },

  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {true} explain
   * @returns {Promise<{ isSetup: boolean; reasons: string[] }>}
   */
  /**
   * @overload
   * @param {import('#utils/project.js').Project} project
   * @param {false} [explain]
   * @returns {Promise<boolean>}
   */
  /**
   * @param {import('#utils/project.js').Project} project
   * @param {boolean} [explain]
   */
  async isSetup(project, explain) {
    let agents = await readIfExists(join(project.directory, "AGENTS.md"));
    let reasons = [];

    if (!agents?.includes(START) || !agents.includes(END)) {
      reasons.push("AGENTS.md has no ember.nvp section");
    }

    if (explain) return { isSetup: reasons.length === 0, reasons };

    return reasons.length === 0;
  },
};

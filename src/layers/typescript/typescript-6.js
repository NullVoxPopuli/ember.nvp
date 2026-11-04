import { packageJson } from "ember-apply";
import { hasConfiguredTSBabel } from "#utils/babel.js";
import { getLatest } from "#utils/npm.js";
import { addTSConfig, updateBabelConfig } from "#utils/typescript.js";

const sharedDeps = {
  "@glint/ember-tsc": "^1.0.8",
  "@glint/template": "^1.7.3",
  "@glint/tsserver-plugin": "^2.0.8",
  typescript: "^6.0.3",
};

const appDeps = {
  // Apps strip types via their own babel.config.js.
  // Libraries have no babel config: ember() handles type stripping.
  "@babel/plugin-transform-typescript": "^7.28.5",
  "@ember/app-tsconfig": "^2.0.0",
};

const libraryDeps = {
  "@ember/library-tsconfig": "^2.0.0",
};

/**
 * @param {import('#utils/project.js').Project} project
 */
function depsFor(project) {
  return {
    ...sharedDeps,
    ...(project.isLibrary ? libraryDeps : appDeps),
  };
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  /**
   * TODO:
   * - if jsconfig exists, switch to tsconfig
   */
  await addTSConfig(project);
  await updatePackageJson(project);
  await updateBabelConfig(project);
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {Record<string, any>} manifest
 * @returns {Promise<string[]>} why TypeScript 6 is not set up
 */
export async function reasons(project, manifest) {
  const reasons = [];

  if (!project.hasFile("tsconfig.json")) {
    reasons.push("tsconfig.json is missing");
  }

  // Only projects with their own babel config need the TS plugin in it.
  // Without one (libraries), ember() strips types.
  if (project.hasFile("babel.config.js") && !(await hasConfiguredTSBabel(project))) {
    reasons.push(`babel.config is missing @babel/plugin-transform-typescript`);
  }

  if (!manifest.scripts?.["lint:types"]) {
    reasons.push(`package.json is missing the "lint:types" script`);
  }

  for (let dep of Object.keys(depsFor(project))) {
    if (!manifest.devDependencies?.[dep]) {
      reasons.push(`package.json is missing ${dep} in devDependencies`);
    }
  }

  return reasons;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export function readme(project) {
  return `### TypeScript

This project uses TypeScript and Glint for static type checking.

- \`${project.runPrefix} lint:types\` - Typecheck code with Glint/TypeScript`;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export function agents(project) {
  return `## Types

- \`${project.runPrefix} lint:types\` checks the types with Glint, templates included.
  Plain \`tsc\` does not read \`<template>\`, so it reports errors that are not real.`;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updatePackageJson(project) {
  await packageJson.modify(async (json) => {
    json.scripts ||= {};
    json.devDependencies ||= {};

    Object.assign(json.scripts, {
      "lint:types": "ember-tsc --noEmit",
    });
    Object.assign(json.devDependencies, await getLatest(depsFor(project)));
  }, project.directory);
}

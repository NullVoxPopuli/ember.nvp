import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "GitHub Actions",
  async run(project) {
    let result = await transform(project);

    if (result.didChange) {
      await writeFile(result.outputPath, result.content, "utf-8");
    }
  },
  async isSetup(project) {
    let result = await transform(project);

    return result.didChange === false;
  },
};

/**
 * This is a very silly way to handle YAML, but 🤷
 * will update if this starts getting to be troublesome.
 */
const preamble = `name: CI

on:
  push:
    branches:
      - main
      - master
  pull_request: {}

concurrency:
  group: ci-\${{ github.head_ref || github.ref }}
  cancel-in-progress: true`;

const lint = {
  npm: `lint:
    name: "Lints"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm install
      - run: npm run lint`,
  pnpm: `  lint:
    name: "Lints"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: wyvox/action-setup-pnpm@v3
      - run: pnpm lint`};

const test = {
  npm: `test:
    name: "Tests"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm install
      - run: npm test`,
  pnpm: `  test:
    name: "Tests"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: wyvox/action-setup-pnpm@v3
      - run: pnpm test`
};

/**
 *
 * @param {import('#utils/project.js').Project} project
 * @returns
 */
async function transform(project) {
  let outputPath = join(project.directory, ".github/workflows/ci.yml");
  let content = "";
  let original = "";

  if (existsSync(outputPath)) {
    let buffer = await readFile(outputPath, "utf-8");
    content = buffer.toString();
    original = content;
  }

  content = await addOrUpdateLints(project, content);
  content = await addOrUpdateTests(project, content);

  /**
   * If we've still added nothing, we can't actually add the preamble
   * because there are no jobs to run (we need at least one job).
   */
  if (content === "") {
    return { content, original, didChange: original !== content, outputPath };
  }

  content = await addOrUpdateBase(project, content);

  return { content, original, didChange: original !== content, outputPath };
}

/**
 * 
 * @param {import('#utils/project.js').Project} project 
 * @param {string} file 
 */
async function addOrUpdateBase(project, file) {
  if (file.includes('jobs:')) {

    if (file.includes(preamble)) {
      return file;
    }

    return preamble + file;
  }

  return file;
}


/**
 * 
 * @param {import('#utils/project.js').Project} project 
 * @param {string} file 
 */
async function addOrUpdateLints(project, file) {
  if (project.wantsESLint === false) {
    return file;
  }

  if (file.includes('lint:')) {
    return file;
  }

  if (!file.includes('jobs:')) {
    file+= '\n\njobs:\n';
  }

  return file + '\n' + lint[project.desires.packageManager];
}

/**
 * 
 * @param {import('#utils/project.js').Project} project 
 * @param {string} file 
 */
async function addOrUpdateTests(project, file) {
  if (project.wantsTesting === false) {
    return file;
  }

  if (file.includes('test:')) {
    return file;
  }
  
  if (!file.includes('jobs:')) {
    file+= '\n\njobs:\n';
  }

  return file + '\n' + test[project.desires.packageManager];
}

import { packageJson, tsconfig } from "ember-apply";
import { hasConfiguredTSBabel } from "#utils/babel.js";
import { getLatest } from "#utils/npm.js";
import {
  TYPESCRIPT_7,
  addTSConfig,
  hasTypeScript6,
  syncTypeScript6,
  updateBabelConfig,
} from "#utils/typescript.js";

const MAPPER = "ember-content-mapper";

/**
 * TypeScript 7 does not load tsserver plugins.
 * The content mapper replaces this one.
 */
const TSSERVER_PLUGIN = "@glint/tsserver-plugin";

/**
 * `@typescript/native` owns the `tsc` bin.
 * `typescript` is left to eslint, which needs TypeScript 6, see `syncTypeScript6`.
 *
 * The mapper transforms with `@glint/ember-tsc` and references its types.
 * `@glint/template` types the signatures written by hand.
 */
const sharedDeps = {
  "@glint/ember-tsc": "^1.11.0",
  "@glint/template": "^1.7.3",
  "@typescript/native": TYPESCRIPT_7,
  [MAPPER]: "^0.3.1",
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

const scripts = {
  "lint:types": "tsc --noEmit --runExternalCode",
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
 * @param {Record<string, any>} config
 * @returns {boolean}
 */
function hasContentMapper(config) {
  return (
    Array.isArray(config.contentMappers) &&
    config.contentMappers.some((/** @type {any} */ mapper) => mapper?.package === MAPPER)
  );
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  await addTSConfig(project);
  await updateTSConfig(project);
  await updatePackageJson(project);
  await syncTypeScript6(project);
  await updateBabelConfig(project);
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {Record<string, any>} manifest
 * @returns {Promise<string[]>} why TypeScript 7 is not set up
 */
export async function reasons(project, manifest) {
  const reasons = [];

  if (!project.hasFile("tsconfig.json")) {
    reasons.push("tsconfig.json is missing");
  } else if (!hasContentMapper(await tsconfig.read(project.directory))) {
    reasons.push(`tsconfig.json is missing the ${MAPPER} entry in contentMappers`);
  }

  // Only projects with their own babel config need the TS plugin in it.
  // Without one (libraries), ember() strips types.
  if (project.hasFile("babel.config.js") && !(await hasConfiguredTSBabel(project))) {
    reasons.push(`babel.config is missing @babel/plugin-transform-typescript`);
  }

  if (!manifest.scripts?.["lint:types"]?.includes("--runExternalCode")) {
    reasons.push(`package.json's "lint:types" script is missing --runExternalCode`);
  }

  for (let dep of Object.keys(depsFor(project))) {
    if (!manifest.devDependencies?.[dep]) {
      reasons.push(`package.json is missing ${dep} in devDependencies`);
    }
  }

  if (manifest.devDependencies?.typescript && !hasTypeScript6(manifest)) {
    reasons.push(`package.json's typescript must be @typescript/typescript6, or tsc is ambiguous`);
  }

  return reasons;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export function readme(project) {
  return `### TypeScript

This project uses TypeScript 7 and [ember-content-mapper](https://github.com/NullVoxPopuli/ember-content-mapper) for static type checking.

- \`${project.runPrefix} lint:types\` - Typecheck code with TypeScript
- Imports of \`.gts\` and \`.gjs\` modules must include the extension
- Editor setup: see [ember-content-mapper's editors section](https://github.com/NullVoxPopuli/ember-content-mapper#editors)`;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export function agents(project) {
  return `## Types

- \`${project.runPrefix} lint:types\` checks the types, templates included.
  Use it, not plain \`tsc\`: without \`--runExternalCode\`, \`tsc\` cannot read \`.gts\` and \`.gjs\` files.
- Imports of \`.gts\` and \`.gjs\` modules must include the extension.`;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updateTSConfig(project) {
  let config = await tsconfig.read(project.directory);

  if (hasContentMapper(config) && !hasTSServerPlugin(config)) return;

  await tsconfig.modify((json) => {
    if (!hasContentMapper(json)) {
      json.contentMappers ||= [];
      json.contentMappers.push({ package: MAPPER, extensions: [".gts", ".gjs"] });
    }

    if (hasTSServerPlugin(json)) {
      json.compilerOptions.plugins = json.compilerOptions.plugins.filter(
        (/** @type {any} */ plugin) => plugin?.name !== TSSERVER_PLUGIN,
      );

      if (json.compilerOptions.plugins.length === 0) {
        delete json.compilerOptions.plugins;
      }
    }
  }, project.directory);
}

/**
 * @param {Record<string, any>} config
 * @returns {boolean}
 */
function hasTSServerPlugin(config) {
  let plugins = config.compilerOptions?.plugins;

  return (
    Array.isArray(plugins) &&
    plugins.some((/** @type {any} */ plugin) => plugin?.name === TSSERVER_PLUGIN)
  );
}

/**
 * @param {import('#utils/project.js').Project} project
 */
async function updatePackageJson(project) {
  await packageJson.addScripts(scripts, project.directory);
  await packageJson.addDevDependencies(await getLatest(depsFor(project)), project.directory);
  await packageJson.removeDevDependencies([TSSERVER_PLUGIN], project.directory);
}

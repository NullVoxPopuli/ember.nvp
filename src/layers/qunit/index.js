import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { removeConfiguredPlugin } from "#utils/babel.js";
import { packageJson } from "ember-apply";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const deps = {
  "@ember/test-helpers": "^5.4.1",
  "@ember/test-waiters": "^4.1.0",
  "ember-qunit": "^9.0.4",
  "qunit-theme-ember": "^1.0.0",
  qunit: "^2.25.0",
  "qunit-dom": "3.5.0",
  testem: "3.17.0",
};
const tsDeps = {
  "@types/qunit": "^2.19.12",
};

/**
 * Libraries don't have the app's build stack, so the test build brings
 * its own: vite + the babel toolchain the generated babel.config.js
 * imports, plus a minimal test application to render into.
 */
const libraryDeps = {
  ...deps,
  "@babel/core": "^7.29.7",
  "@babel/plugin-transform-runtime": "^7.29.7",
  "@babel/runtime": "^7.29.7",
  "@embroider/core": "^4.4.2",
  "@embroider/macros": "^1.20.3",
  "@nullvoxpopuli/ember-vite": "workspace:*",
  "@rollup/plugin-babel": "^7.1.0",
  "babel-plugin-ember-template-compilation": "^4.0.0",
  "ember-strict-application-resolver": "^0.1.0",
  vite: "^8.0.14",
};
const libraryTsDeps = {
  ...tsDeps,
  "@babel/plugin-transform-typescript": "^7.29.7",
};

/**
 * @param {import('#utils/project.js').Project} project
 */
function depsFor(project) {
  return project.type === "library" ? libraryDeps : deps;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
function tsDepsFor(project) {
  return project.type === "library" ? libraryTsDeps : tsDeps;
}

/**
 * @type {import('#types').Layer}
 */
export default {
  label: "QUnit",

  async run(project) {
    let isLibrary = project.type === "library";
    let ts = await project.hasOrWantsLayer("typescript");

    if (isLibrary) {
      await addSourceImports(project);
    }

    await applyFolderTo(join(import.meta.dirname, "files/shared"), project);
    await applyFolderTo(
      join(import.meta.dirname, isLibrary ? "files/library" : "files/app"),
      project,
    );

    if (isLibrary) {
      if (!ts) {
        await removeConfiguredPlugin(project, "@babel/plugin-transform-typescript");
      }

      await keepTestBabelConfigOutOfPublishBuild(project);
    }

    await packageJson.addDevDependencies(
      await getLatest({
        ...depsFor(project),
        ...(ts ? tsDepsFor(project) : {}),
      }),
      project.directory,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        "build:test": "EMBER_ENV=test NODE_ENV=development vite build --mode development",
        "test:ci": "testem ci --port 0",
        test: "pnpm build:test && pnpm test:ci",
      },
      project.directory,
    );
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
   * @param {boolean | undefined} [explain]
   * @returns {Promise<boolean>}
   */
  async isSetup(project, explain) {
    const reasons = [];
    let depsToCheck = [
      Object.keys(depsFor(project)),
      project.wantsTypeScript ? Object.keys(tsDepsFor(project)) : "",
    ]
      .flat()
      .filter(Boolean);

    let manifest = await packageJson.read(project.directory);

    if (!manifest.scripts?.["build:test"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "build:test" script`);
    }

    if (!manifest.scripts?.["test:ci"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "test:ci" script`);
    }
    if (!manifest.scripts?.["test"]) {
      if (!explain) return false;

      reasons.push(`package.json is missing the "test" script`);
    }

    for (let dep of depsToCheck) {
      if (!manifest.devDependencies?.[dep]) {
        if (!explain) return false;

        reasons.push(`package.json is missing ${dep} in devDependencies`);
      }
    }

    if (explain) {
      return {
        isSetup: reasons.length === 0,
        reasons,
      };
    }

    return reasons.length === 0;
  },
};

/**
 * Tests import the library's source (not its published dist), so the
 * `#src/*` subpath must exist before the test files are applied --
 * applying rewrites their import extensions by resolving each specifier
 * through this mapping.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function addSourceImports(project) {
  await packageJson.modify((json) => {
    json.imports ||= {};
    json.imports["#src/*"] ||= "./src/*";
  }, project.directory);
}

/**
 * The generated babel.config.js exists for the vite test build: it
 * compiles templates to wire format and evaluates macros, both of which
 * must never reach the published dist (libraries ship
 * `precompileTemplate`; consuming apps do the final compile). The
 * publish build's plugin resolves a root babel config on its own, so it
 * has to be told to ignore config files.
 *
 * @param {import('#utils/project.js').Project} project
 */
async function keepTestBabelConfigOutOfPublishBuild(project) {
  let configPath = project.path("tsdown.config.js");
  let contents = await readFile(configPath, "utf-8");

  let updated = contents.replace(
    "plugins: [ember()]",
    "plugins: [ember({ babel: { configFile: false } })]",
  );

  if (updated !== contents) {
    await writeFile(configPath, updated);
  }
}

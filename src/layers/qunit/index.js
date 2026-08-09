import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { hasConfiguredPlugin, prependPlugin, removeConfiguredPlugin } from "#utils/babel.js";
import { packageJson } from "ember-apply";
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
 * Libraries don't have the app base's vite stack, so the test build
 * brings the pieces the generated configs and test-helper import
 * directly. Everything else (babel itself, the embroider machinery)
 * comes with @nullvoxpopuli/ember-vite.
 */
const libraryDeps = {
  ...deps,
  "@embroider/macros": "^1.20.3",
  "@nullvoxpopuli/ember-vite": "workspace:*",
  "babel-plugin-ember-template-compilation": "^4.0.0",
  "ember-strict-application-resolver": "^0.1.0",
  vite: "^8.0.14",
};
const libraryTsDeps = {
  ...tsDeps,
  "@babel/plugin-transform-typescript": "^7.28.5",
};

const TEST_BABEL_CONFIG = "config/test/babel.config.js";

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

    await applyFolderTo(join(import.meta.dirname, isLibrary ? "library-files" : "files"), project);

    if (isLibrary) {
      await syncTestBabelConfig(project, ts);
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
        "test:ci": isLibrary
          ? "testem ci --file config/test/testem.cjs --port 0"
          : "testem ci --port 0",
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
 * The test babel config is the qunit layer's own (a root babel config,
 * when a library has one, belongs to the publish build), so this layer
 * also keeps the config's TypeScript handling in step with the project:
 * the shipped config carries the TS plugin, which must not survive in a
 * JavaScript project, and must come back when a project adopts the
 * typescript layer later.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {boolean} ts
 */
async function syncTestBabelConfig(project, ts) {
  if (!ts) {
    await removeConfiguredPlugin(project, "@babel/plugin-transform-typescript", TEST_BABEL_CONFIG);
    return;
  }

  if (await hasConfiguredPlugin(project, "@babel/plugin-transform-typescript", TEST_BABEL_CONFIG)) {
    return;
  }

  await prependPlugin(
    project,
    `[
      "@babel/plugin-transform-typescript",
      {
        allExtensions: true,
        onlyRemoveTypeImports: true,
        allowDeclareFields: true,
      },
    ]`,
    TEST_BABEL_CONFIG,
  );
}

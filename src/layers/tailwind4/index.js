import { js, packageJson } from "ember-apply";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFolderTo } from "#utils/fs.js";
import { getLatest } from "#utils/npm.js";
import { formatLabel } from "#utils/cli.js";
import { findViteConfig, analyzeVitePlugin, addVitePlugin } from "#utils/vite.js";

const deps = {
  tailwindcss: "^4.3.3",
  "@tailwindcss/vite": "^4.3.3",
};

const PLUGIN = {
  importSource: "@tailwindcss/vite",
  importName: "tailwindcss",
};

const STYLESHEET = "app/styles/app.css";
const STYLESHEET_IMPORT = "./styles/app.css";
const TAILWIND_IMPORT = `@import "tailwindcss";`;

const APPLICATION_FILES = ["app/app.ts", "app/app.js"];

/**
 * @param {import('#utils/project.js').Project} project
 * @returns {string | undefined}
 */
function findApplicationFile(project) {
  return APPLICATION_FILES.find((file) => project.hasFile(file));
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} file
 * @returns {Promise<boolean>} whether `file` imports the stylesheet
 */
async function importsStylesheet(project, file) {
  let hasImport = false;

  await js.analyze(project.path(file), async ({ root, j }) => {
    hasImport = root.find(j.ImportDeclaration, { source: { value: STYLESHEET_IMPORT } }).size() > 0;
  });

  return hasImport;
}

/**
 * @param {import('#utils/project.js').Project} project
 * @param {string} file
 */
async function importStylesheet(project, file) {
  await js.transform(project.path(file), async ({ root, j }) => {
    let declaration = j.importDeclaration([], j.literal(STYLESHEET_IMPORT));
    let imports = root.find(j.ImportDeclaration);

    if (imports.size() > 0) {
      imports.at(imports.size() - 1).insertAfter(declaration);
    } else {
      root.get().node.program.body.unshift(declaration);
    }
  });
}

/**
 * Tailwind CSS 4 Layer
 *
 * Wires https://tailwindcss.com/ into the project's vite build.
 *
 * @type {import('#types').Layer}
 */
export default {
  label: formatLabel("Tailwind CSS", "utility-first styling"),

  /**
   * @param {import('#utils/project.js').Project} project
   */
  async run(project) {
    let configPath = findViteConfig(project);

    // libraries have no vite build to plug in to
    if (!configPath) return;

    let { hasImport, hasCall } = await analyzeVitePlugin(project, PLUGIN, configPath);

    if (!hasImport || !hasCall) {
      await addVitePlugin(project, PLUGIN, configPath);
    }

    await applyFolderTo(join(import.meta.dirname, "files"), project);

    let stylesheet = await project.read(STYLESHEET);

    // pre-existing stylesheet (applyFolderTo leaves it alone)
    if (stylesheet && !stylesheet.includes(TAILWIND_IMPORT)) {
      await writeFile(project.path(STYLESHEET), `${TAILWIND_IMPORT}\n${stylesheet}`);
    }

    let applicationFile = findApplicationFile(project);

    if (applicationFile && !(await importsStylesheet(project, applicationFile))) {
      await importStylesheet(project, applicationFile);
    }

    await packageJson.addDevDependencies(await getLatest(deps), project.directory);
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

    let configPath = findViteConfig(project);

    if (!configPath) {
      if (!explain) return false;

      reasons.push("there is no vite config to plug in to");
    } else {
      let { hasImport, hasCall } = await analyzeVitePlugin(project, PLUGIN, configPath);

      if (!hasImport) {
        if (!explain) return false;

        reasons.push(`${configPath} does not import ${PLUGIN.importSource}`);
      }

      if (!hasCall) {
        if (!explain) return false;

        reasons.push(`${configPath} does not call ${PLUGIN.importName}() in its plugins`);
      }
    }

    let stylesheet = await project.read(STYLESHEET);

    if (!stylesheet?.includes(TAILWIND_IMPORT)) {
      if (!explain) return false;

      reasons.push(`${STYLESHEET} is missing ${TAILWIND_IMPORT}`);
    }

    let applicationFile = findApplicationFile(project);

    if (!applicationFile) {
      if (!explain) return false;

      reasons.push("there is no application file to import the stylesheet from");
    } else if (!(await importsStylesheet(project, applicationFile))) {
      if (!explain) return false;

      reasons.push(`${applicationFile} does not import ${STYLESHEET_IMPORT}`);
    }

    let manifest = await packageJson.read(project.directory);

    for (let dep of Object.keys(deps)) {
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

  readme() {
    return `### Styling (Tailwind CSS)

Utility classes from [Tailwind CSS](https://tailwindcss.com/) are available in every template.

\`${STYLESHEET}\` is the entrypoint stylesheet. Add custom CSS and [theme customizations](https://tailwindcss.com/docs/theme) there.`;
  },
};

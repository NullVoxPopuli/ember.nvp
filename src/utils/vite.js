// uses jscodeshift
import { js } from "ember-apply";

const CONFIG_FILES = ["vite.config.mjs", "vite.config.js", "vite.config.ts"];

/**
 * @param {import('./project.js').Project} project
 * @returns {string | undefined} the project's vite config file, if it has one
 */
export function findViteConfig(project) {
  return CONFIG_FILES.find((file) => project.hasFile(file));
}

/**
 * @param {import('./project.js').Project} project
 * @param {{ importSource: string, importName: string }} plugin
 * @param {string} configPath which vite config to inspect
 * @returns {Promise<{ hasImport: boolean, hasCall: boolean }>}
 */
export async function analyzeVitePlugin(project, { importSource, importName }, configPath) {
  let hasImport = false;
  let hasCall = false;

  await js.analyze(project.path(configPath), async ({ root, j }) => {
    hasImport = root.find(j.ImportDeclaration, { source: { value: importSource } }).size() > 0;

    root.find(j.CallExpression, { callee: { name: importName } }).forEach(() => {
      hasCall = true;
    });
  });

  return { hasImport, hasCall };
}

/**
 * Adds a default-imported plugin to the front of the config's `plugins`
 * array. No-op for anything already present.
 *
 * @param {import('./project.js').Project} project
 * @param {{ importSource: string, importName: string }} plugin
 * @param {string} configPath which vite config to modify
 */
export async function addVitePlugin(project, { importSource, importName }, configPath) {
  await js.transform(project.path(configPath), async ({ root, j }) => {
    if (root.find(j.ImportDeclaration, { source: { value: importSource } }).size() === 0) {
      let declaration = j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(importName))],
        j.literal(importSource),
      );
      let imports = root.find(j.ImportDeclaration);

      if (imports.size() > 0) {
        imports.at(imports.size() - 1).insertAfter(declaration);
      } else {
        root.get().node.program.body.unshift(declaration);
      }
    }

    root
      .find(j.Property, {
        key: { name: "plugins" },
        value: { type: "ArrayExpression" },
      })
      .forEach(
        /**
         * @param {any} path
         */
        (path) => {
          let elements = path.node.value.elements;
          let already = elements.some(
            /**
             * @param {any} element
             */
            (element) =>
              element?.type === "CallExpression" &&
              element.callee.type === "Identifier" &&
              element.callee.name === importName,
          );

          if (!already) {
            elements.unshift(j.callExpression(j.identifier(importName), []));
          }
        },
      );
  });
}

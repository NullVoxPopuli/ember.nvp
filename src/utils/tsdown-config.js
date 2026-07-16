import { readFile, writeFile } from "node:fs/promises";
import { toTree, print, statements } from "ember-estree";

/**
 * Adds a property to the object passed to `defineConfig(...)` in the
 * project's tsdown.config.js.
 *
 * No-ops when the property is already present (layers re-run), and when
 * the config doesn't have the `defineConfig({ ... })` shape -- an existing
 * project's hand-rolled config is the user's to manage.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {string} propertyName
 * @param {string} propertySource the property as source, e.g. `publint: true`
 */
export async function addTsdownConfigProperty(project, propertyName, propertySource) {
  const configPath = project.path("tsdown.config.js");
  const contents = await readFile(configPath, "utf-8");

  /** @type {import('ember-estree').ASTNode | null} */
  let configObject = null;

  const tree = /** @type {import('ember-estree').FileNode} */ (
    toTree(contents, {
      filePath: configPath,
      visitors: {
        CallExpression(node) {
          const callee = /** @type {import('ember-estree').ASTNode} */ (node.callee);

          if (callee?.type !== "Identifier" || callee.name !== "defineConfig") return;

          const [argument] = /** @type {import('ember-estree').ASTNode[]} */ (node.arguments ?? []);

          if (argument?.type === "ObjectExpression") {
            configObject = argument;
          }
        },
      },
    })
  );

  if (!configObject) return;

  const found = /** @type {import('ember-estree').ASTNode} */ (configObject);
  const properties = /** @type {import('ember-estree').ASTNode[]} */ (found.properties ?? []);

  const alreadyPresent = properties.some((property) => {
    const key = /** @type {import('ember-estree').ASTNode} */ (property.key);

    return key?.type === "Identifier" && key.name === propertyName;
  });

  if (alreadyPresent) return;

  const [statement] = statements`defineConfig({ ${propertySource} });`;

  if (!statement) return;

  const expression = /** @type {import('ember-estree').ASTNode} */ (statement.expression);
  const [templateObject] = /** @type {import('ember-estree').ASTNode[]} */ (expression.arguments);
  const [property] = /** @type {import('ember-estree').ASTNode[]} */ (
    templateObject?.properties ?? []
  );

  if (!property) return;

  properties.push(property);
  found.properties = properties;

  await writeFile(configPath, print(tree));
}

/**
 * Whether the project's tsdown.config.js configures `propertyName`.
 *
 * @param {import('#utils/project.js').Project} project
 * @param {string} propertyName
 */
export async function hasTsdownConfigProperty(project, propertyName) {
  if (!project.hasFile("tsdown.config.js")) return false;

  const contents = await readFile(project.path("tsdown.config.js"), "utf-8");

  return contents.includes(propertyName);
}

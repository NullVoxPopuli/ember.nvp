// uses jscodeshift
import { js } from "ember-apply";

/**
 * @param {import('./project.js').Project} project
 */
export async function hasConfiguredTSBabel(project) {
  return hasConfiguredPlugin(project, "@babel/plugin-transform-typescript");
}

/**
 * @param {import('./project.js').Project} project
 * @param {string} pluginName
 * @param {string} [configPath] which babel config to inspect
 */
export async function hasConfiguredPlugin(project, pluginName, configPath = "babel.config.js") {
  let hasPlugin = false;

  await js.analyze(project.path(configPath), async ({ root, j }) => {
    root
      .find(j.ArrayExpression, {
        elements: {
          0: { value: pluginName },
        },
      })
      .forEach(() => {
        hasPlugin = true;
      });
  });

  return hasPlugin;
}

/**
 * @param {import('./project.js').Project} project
 * @param {string} pluginName
 * @param {string} [configPath] which babel config to modify
 */
export async function removeConfiguredPlugin(project, pluginName, configPath = "babel.config.js") {
  await js.transform(project.path(configPath), async ({ root, j }) => {
    root
      .find(j.ArrayExpression, {
        elements: {
          0: { value: pluginName },
        },
      })
      .forEach(
        /**
         * @param {unknown} path
         */
        (path) => {
          j(path).remove();
        },
      );
  });
}

/**
 * @param {import('./project.js').Project} project
 * @param {string} plugin
 * @param {string} [configPath] which babel config to modify
 */
export async function prependPlugin(project, plugin, configPath = "babel.config.js") {
  await js.transform(project.path(configPath), async ({ root, j }) => {
    root
      .find(j.Property, {
        key: { name: "plugins" },
      })
      .forEach(
        /**
         * @param {any} path
         */
        (path) => {
          let array = pluginsArrayOf(path.node.value);

          array?.elements.unshift(plugin);
        },
      );
  });
}

/**
 * The plugins value may be the array itself, or the array with
 * methods chained off of it: `[ ... ].filter(Boolean)`
 *
 * @param {any} node
 * @returns {any | undefined} the underlying ArrayExpression
 */
function pluginsArrayOf(node) {
  if (node.type === "ArrayExpression") return node;

  if (node.type === "CallExpression" && node.callee.type === "MemberExpression") {
    return pluginsArrayOf(node.callee.object);
  }

  return undefined;
}

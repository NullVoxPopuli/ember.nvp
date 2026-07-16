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
        value: { type: "ArrayExpression" },
      })
      .forEach(
        /**
         * @param {any} path
         */
        (path) => {
          path.node.value.elements.unshift(plugin);
        },
      );
  });
}

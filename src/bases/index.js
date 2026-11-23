import app from "./minimal-app/index.js";
import customElement from "./minimal-custom-element/index.js";
import extension from "./minimal-extension/index.js";
import library from "./minimal-library/index.js";
import widget from "./minimal-widget/index.js";

/**
 * The base for each project type.
 *
 * Detection asks the bases in this order,
 * so each base comes before the bases whose markers it also has:
 * - an extension has the index.html and app/ folder of an app
 * - a custom element and a widget build with tsdown, like a library
 * - a library can have an app/ folder (classic addons) or an index.html (a docs app)
 *
 * @type {Record<import('#types').ProjectType, import('#types').Base>}
 */
export const bases = {
  extension,
  "custom-element": customElement,
  widget,
  library,
  app,
};

/**
 * @param {string} directory an existing project
 * @returns {import('#types').ProjectType | undefined}
 */
export function detectProjectType(directory) {
  for (let [type, base] of Object.entries(bases)) {
    if (base.detect(directory)) return /** @type {import('#types').ProjectType} */ (type);
  }
}

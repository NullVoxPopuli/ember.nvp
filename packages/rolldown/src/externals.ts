import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Plugin } from "rolldown";

// @embroider/core is cjs, so we default-import and destructure.
import pkg from "@embroider/core";
const { emberVirtualPackages, emberVirtualPeerDeps, packageName, templateCompilationModules } = pkg;

const compilationModules = new Set(templateCompilationModules.map((m) => m.module));

/**
 * @param {string} path
 */
function readJsonSync(path: string) {
  return JSON.parse(readFileSync(path, { encoding: "utf8" }));
}

/**
 * Everything the library declares as a `dependency` or `peerDependency`
 * is resolvable by the consuming app, so we never bundle it.
 */
function resolvableDependencies(): Set<string> {
  const deps = new Set<string>();
  const manifest = readJsonSync("package.json");

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    deps.add(name);
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    deps.add(name);
  }

  return deps;
}

/**
 * The modules ember-source provides by renaming them into itself.
 *
 * This is its `ember-addon.renamed-modules`, keyed by module file path:
 *   `@glimmer/runtime/index.js` → `ember-source/@glimmer/runtime/index.js`
 *
 * It is the authoritative list of ember's provided modules.
 * It includes private API that @embroider/core's emberVirtualPackages
 * doesn't cover (e.g. `@glimmer/runtime`).
 *
 * It deliberately does NOT include real packages like `@glimmer/component`,
 * which a library may want bundled.
 *
 * Empty when ember-source isn't resolvable from the library.
 */
export function emberSourceRenamedModules(): Record<string, string> {
  try {
    const require = createRequire(path.resolve("package.json"));
    const manifest = require("ember-source/package.json") as {
      "ember-addon"?: { "renamed-modules"?: Record<string, string> };
    };

    return manifest["ember-addon"]?.["renamed-modules"] ?? {};
  } catch {
    // The library doesn't have ember-source in its graph; nothing to provide.
    return {};
  }
}

/**
 * The renamed modules as import specifiers
 *   `@glimmer/runtime/index.js` → `@glimmer/runtime`
 */
function emberSourceProvidedModules(): Set<string> {
  const provided = new Set<string>();

  for (const key of Object.keys(emberSourceRenamedModules())) {
    provided.add(key.replace(/\.js$/, "").replace(/\/index$/, ""));
  }

  return provided;
}

/**
 * Keeps external:
 * - the library's declared dependencies
 * - the ember virtual packages
 *   (things like `@ember/component`, `@glimmer/tracking`, the template compiler, …)
 *
 * So the app that consumes the library resolves them,
 * instead of the library bundling copies of them.
 */
export function emberExternals(): Plugin {
  let deps: Set<string>;
  let renamedModules: Set<string>;

  return {
    name: "ember:externals",

    buildStart() {
      this.addWatchFile("package.json");
      deps = resolvableDependencies();
      renamedModules = emberSourceProvidedModules();
    },

    resolveId: {
      order: "pre",
      handler(source) {
        // Anything with a protocol (`node:`, virtual modules, …)
        // is not ours to externalize.
        if (source.includes(":")) {
          return null;
        }

        const pkgName = packageName(source);

        if (!pkgName) {
          // No package name means a relative import, which we don't deal with.
          return null;
        }

        if (
          deps.has(pkgName) ||
          emberVirtualPeerDeps.has(pkgName) ||
          emberVirtualPackages.has(pkgName) ||
          compilationModules.has(pkgName)
        ) {
          // `false` tells rolldown to treat the id as external.
          return false;
        }

        // Modules ember-source provides by renaming them into itself
        // (`ember-addon.renamed-modules`).
        //
        // Private API like `@glimmer/runtime`,
        // which only exists inside the app's ember-source.
        //
        // Matched on the full specifier:
        // the renamed modules are module paths, not packages.
        if (renamedModules.has(source)) {
          return false;
        }

        return undefined;
      },
    },
  };
}

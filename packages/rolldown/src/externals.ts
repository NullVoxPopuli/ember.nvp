import { readFileSync } from "node:fs";

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
 * Everything the library declares as a `dependency` or `peerDependency` is
 * resolvable by the consuming app, so we never bundle it.
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
 * Keeps the library's declared dependencies and the ember virtual packages
 * (things like `@ember/component`, `@glimmer/tracking`, the template compiler,
 * …) external, so the app that consumes the library resolves them instead of
 * the library bundling copies of them.
 */
export function emberExternals(): Plugin {
  let deps: Set<string>;

  return {
    name: "ember:externals",

    buildStart() {
      this.addWatchFile("package.json");
      deps = resolvableDependencies();
    },

    resolveId: {
      order: "pre",
      handler(source) {
        // Anything with a protocol (`node:`, virtual modules, …) is not ours
        // to externalize.
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

        return undefined;
      },
    },
  };
}

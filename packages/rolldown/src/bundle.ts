import type { Plugin } from "rolldown";

import { emberSourceRenamedModules } from "./externals.ts";

/**
 * The package name a renamed-modules key belongs to
 *   `@ember/modifier/on.js` → `@ember/modifier`
 *   `rsvp/index.js` → `rsvp`
 */
function packageOf(modulePath: string): string {
  const segments = modulePath.split("/");
  const length = modulePath.startsWith("@") ? 2 : 1;

  return segments.slice(0, length).join("/");
}

/**
 * One alias per package ember-source provides, pointing into ember-source
 *   `@ember/modifier` → `ember-source/@ember/modifier`
 *
 * The provided packages are the ones named in `ember-addon.renamed-modules`
 * (`@ember/*`, `@glimmer/tracking`, `rsvp`, `backburner.js`, …).
 *
 * Real packages such as `@glimmer/component` are not in it,
 * so they keep resolving from node_modules.
 */
export function emberSourceAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const modulePath of Object.keys(emberSourceRenamedModules())) {
    const name = packageOf(modulePath);

    aliases[name] = `ember-source/${name}`;
  }

  return aliases;
}

/**
 * Makes the modules ember-source provides resolvable,
 * so a bundle-mode build can include them.
 *
 * ember-source exports every module under `./*`,
 * with `development` and `production` conditions selecting one of its two builds.
 *
 * A bare `@ember/modifier` is not that path, though.
 * It only exists as `ember-source/@ember/modifier`.
 *
 * So this plugin adds the alias for each provided package,
 * and leaves the rest to the resolver:
 * - the `default` condition selects the production build
 * - `resolve.conditionNames: ["development"]` selects the development build
 *   (tsdown: `inputOptions.resolve.conditionNames`)
 *
 * Aliases set explicitly in the build config win over these.
 */
export function emberBundle(): Plugin {
  return {
    name: "ember:bundle",

    options(inputOptions) {
      inputOptions.resolve ??= {};
      inputOptions.resolve.alias = {
        ...emberSourceAliases(),
        ...inputOptions.resolve.alias,
      };

      return inputOptions;
    },
  };
}

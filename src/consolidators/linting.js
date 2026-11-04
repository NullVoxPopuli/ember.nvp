import { getLatest } from "#utils/npm.js";
import { packageJson } from "ember-apply";

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function consolidateLintingScripts(project) {
  // todo
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function maybeLintWithConcurrently(project) {
  /** @type {Record<string, boolean>} */
  let linting = {
    prettier: false,
    eslint: false,
    "ember-template-lint": false,
    stylelint: false,
  };

  let count = 0;
  let manifest = await packageJson.read(project.directory);

  for (let script of Object.values(manifest.scripts)) {
    for (let bin of Object.keys(linting)) {
      if (script.includes(bin)) {
        linting[bin] = true;
        count++;
      }
    }
  }

  if (count > 1) {
    await packageJson.modify(async (json) => {
      json.scripts ||= {};
      json.devDependencies ||= {};
      /**
       * concurrently runs package.json scripts with an "npm:" or "pnpm:" prefix.
       */
      let pm = project.packageManager;

      json.scripts.lint = `concurrently "${pm}:lint:*(!fix)" --names "lint:" --prefixColors auto`;
      json.scripts["lint:fix"] =
        `concurrently "${pm}:lint:*:fix" --names "fix:" --prefixColors auto && ${project.runPrefix} format`;

      Object.assign(
        json.devDependencies,
        await getLatest({
          concurrently: "^9.2.1",
        }),
      );
    }, project.directory);
  }
}

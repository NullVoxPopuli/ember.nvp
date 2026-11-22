import { editFile } from "#utils/fs.js";
import { VITE_CONFIG, addVitePlugin, vitePluginReasons } from "#utils/vite-config.js";

export const deps = {
  "ember-scoped-css": "^3.5.2",
};

const PLUGIN = {
  importLine: `import { scopedCSS } from "ember-scoped-css/vite";`,
  call: "scopedCSS()",
};

const BABEL_CONFIG = "babel.config.js";
const BABEL_IMPORT = `import { scopedCSS } from "ember-scoped-css/babel";`;
const MACROS_IMPORT = /^import \{ buildMacros \} from ["']@embroider\/macros\/babel["'];?$/m;
const TEMPLATE_TRANSFORMS = /transforms:\s*\[\s*\.\.\.macros\.templateMacros\s*\]/;
const TEMPLATE_TRANSFORM = "scopedCSS.template({})";

/**
 * `scopedCSS()` compiles away the `scopedClass` import in module code.
 * `scopedCSS.template()` rewrites the classes in templates.
 *
 * @param {string} code
 */
function wireBabelConfig(code) {
  /**
   * The codemod only knows the base's config.
   * For any other shape, isSetup reports what is missing.
   */
  if (!MACROS_IMPORT.test(code)) return code;

  if (!code.includes(BABEL_IMPORT)) {
    code = code.replace(MACROS_IMPORT, (line) => `${line}\n${BABEL_IMPORT}`);
  }

  if (!code.includes(TEMPLATE_TRANSFORM)) {
    code = code.replace(
      TEMPLATE_TRANSFORMS,
      `transforms: [...macros.templateMacros, ${TEMPLATE_TRANSFORM}]`,
    );
  }

  if (!code.includes("scopedCSS(),")) {
    code = code.replace(
      /plugins:\s*\[(\s*)/,
      (_plugins, space) => `plugins: [${space}scopedCSS(),${space || " "}`,
    );
  }

  return code;
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function run(project) {
  await editFile(project, VITE_CONFIG, (code) => addVitePlugin(code, PLUGIN));
  await editFile(project, BABEL_CONFIG, wireBabelConfig);
}

/**
 * @param {import('#utils/project.js').Project} project
 */
export async function reasons(project) {
  let reasons = await vitePluginReasons(project, PLUGIN, "ember-scoped-css/vite");
  let babel = (await project.read(BABEL_CONFIG)) ?? "";

  if (!babel.includes(BABEL_IMPORT)) {
    reasons.push(`${BABEL_CONFIG} does not import ember-scoped-css/babel`);
  }

  if (!babel.includes(TEMPLATE_TRANSFORM)) {
    reasons.push(`${BABEL_CONFIG} does not use the ${TEMPLATE_TRANSFORM} template transform`);
  }

  if (!babel.includes("scopedCSS(),")) {
    reasons.push(`${BABEL_CONFIG} does not use the scopedCSS() plugin`);
  }

  return reasons;
}

export const readme = `#### Scoped CSS

[ember-scoped-css](https://github.com/auditboard/ember-scoped-css) scopes the CSS of each component to that component.
Put the CSS in a \`<style scoped>\` block in the template, or in a \`.css\` file next to the component.`;

export const agents = `### Scoped CSS (ember-scoped-css)

- Put the styles of a component in a \`<style scoped>\` block in its template, or in a \`.css\` file with the same name next to it.
- The build scopes each class to its component. \`:global(.name)\` keeps a class unscoped.
- In module code, \`import { scopedClass } from "ember-scoped-css";\` gives the scoped name of a class.`;

/**
 * Reasons we have to have babel
 * - decorators
 * - ember-concurrency
 * - scoped-css
 * - template compilation optimization
 */
import { extensions } from "@embroider/vite";
import { babel } from "@rollup/plugin-babel";
import { join, resolve } from "node:path";
import { parse as oxcParse } from "oxc-parser";
import { transform } from "oxc-transform";
import { walk } from "zimmerframe";

/**
 * if a file imports any of these, it must be optimize
 */
const babelTemplateImports = new Set([
  // Templates
  "@ember/template-compiler",
  "@ember/template-compilation",
  "ember-cli-htmlbars",
  "ember-cli-htmlbars-inline-precompile",
  "htmlbars-inline-precompile",
]);

const babelMacroImports = new Set([
  // Macros
  "@embroider/macros",
  "@glimmer/env",
  "@ember/application/deprecations",
  // Macros only needed in prod
  "@ember/debug",
]); // Babel plugins required from libraries
const babelOtherImports = new Set([
  "ember-concurrency",
  "ember-scoped-css",
  "ember-intl/helpers/format-message",
]);

const babelRequiredImports = [...babelTemplateImports, ...babelMacroImports, ...babelOtherImports];

const counts = {
  total: 0,
  babel: 0,
  why: {
    decorators: 0,
    formatMessage: 0,
    imports: {
      templates: 0,
      macros: 0,
      other: 0,
    },
    initializeRuntimeMacrosConfig: 0,
  },
};
export function maybeBabel(options: { parallel?: boolean; configFile: string; env: any }) {
  const { env, parallel, ...restOptions } = options;
  const original = (() => {
    const babelPath = resolve(join(process.cwd(), "./babel.config.mjs"));

    return babel({
      babelHelpers: "runtime",
      extensions,
      skipPreflightCheck: true,
      ...restOptions,
      configFile: babelPath,
      parallel: parallel ?? true,
    });
  })();

  const babelMacros = new Set(babelRequiredImports);
  if (env.mode === "development") {
    babelMacros.delete("@ember/debug");
  }

  console.log(original);

  async function doTransform(code, id) {
    counts.total++;

    const ext = id.split(".").at(-1);
    const lang = ext === "gjs" ? "js" : ext === "gts" ? "ts" : ext;

    let needsBabel = false;

    const estree = await oxcParse(id, code, { lang });

    walk(
      estree.program,
      /* state */ {},
      {
        Decorator(_node, { stop }) {
          needsBabel = true;
          counts.why.decorators++;
          stop();
        },
        MemberExpression(node, { stop }) {
          if (node.property?.name === "formatMessage" && node.object?.name === "intl") {
            needsBabel = true;
            counts.why.formatMessage++;
            stop();
          }
        },
        ImportDeclaration(node, { stop }) {
          const value = node.source.value;
          if (babelMacros.has(value)) {
            needsBabel = true;

            if (babelTemplateImports.has(value)) {
              counts.why.imports.templates++;
            } else if (babelMacroImports.has(value)) {
              counts.why.imports.macros++;
            } else {
              counts.why.imports.other++;
            }

            stop();
          }
        },
      },
    );

    if (!needsBabel && code.includes("initializeRuntimeMacrosConfig")) {
      counts.why.initializeRuntimeMacrosConfig++;
      needsBabel = true;
    }

    if (needsBabel) {
      counts.babel++;

      const result = await original.transform.call(this, code, id);

      return result;
    }

    if (ext === "json") {
      return;
    }

    if (ext === "js" || ext === "gjs") {
      // We don't need to process JS
      return null;
    }

    const result = await transform(id, code, {
      lang,
      typescript: {
        onlyRemoveTypeImports: true,
        /**
         * We should work towards disabling this.
         */
        allowNamespaces: true,
        removeClassFieldsWithoutInitializer: false,
        rewriteImportExtensions: false,
      },
    });

    if (result.errors?.length) {
      console.error(`Errors during oxc-transform of ${id}:`);
      for (const err of result.errors) {
        if (err.labels) {
          console.error(err.labels);
        }
        console.error(err.codeframe || err.message);
      }
      throw result.errors;
    }

    return result;
  }

  return {
    enforce: "pre",
    buildEnd() {
      if (process.env.INSPECT) {
        console.debug(`Babel usage: ${counts.babel} / ${counts.total}`, counts.why);
      }
    },
    ...original,
    name: "nullvoxpopuli:babel",
    transform: {
      filter: {
        id: {
          include: [/\.js/, /\.gjs/, /\.ts/, /\.gts/],
          exclude: [/\.json/],
        },
        // Enabling this opts us out of template compilation
        // it's an AND instead of OR
        // code: {
        // 	include: [/initializeRuntimeMacrosConfig/, /precompileTemplate/],
        // },
      },
      handler(code, id) {
        try {
          return doTransform.call(this, code, id);
        } catch (e) {
          // Use VSCode JavaScript Debug Terminal
          // eslint-disable-next-line no-debugger
          debugger;
          throw e;
        }
      },
    },
  };
}

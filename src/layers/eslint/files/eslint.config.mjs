import globals from "globals";
import js from "@eslint/js";
import ts from "typescript-eslint";
import ember from "eslint-plugin-ember";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...ember.configs["flat/recommended"],
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },
  {
    files: ["**/*.gts", "**/*.gjs"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".gts", ".gjs"],
      },
    },
  },
  {
    ignores: ["dist/", "node_modules/", ".vite/"],
  },
];

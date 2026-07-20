import { Preprocessor } from "content-tag";
import type { Plugin } from "rolldown";

const processor = new Preprocessor();

/**
 * Preprocesses `<template>` (`.gts`/`.gjs`) via content-tag.
 *
 * rolldown resolves and parses these custom extensions natively, so all this
 * plugin has to do is strip the `<template>` tags and tell rolldown whether to
 * parse the result as TS (`.gts`) or JS (`.gjs`).
 */
export function emberTransform(): Plugin {
  return {
    name: "ember:transform",

    transform: {
      filter: {
        id: /\.g[jt]s$/,
      },
      handler(code, id) {
        const moduleType = id.endsWith(".gts") ? "ts" : "js";

        if (!code.includes("<template>")) {
          return { code, moduleType };
        }

        const { code: transformed, map } = processor.process(code, {
          filename: id,
        });

        return { code: transformed, map, moduleType };
      },
    },
  };
}

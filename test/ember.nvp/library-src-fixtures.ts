import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Project } from "ember.nvp";

/**
 * The library base generates an empty `src/`; tests that build or test a
 * library write this example source (a class component, a template-only
 * component, and a plain module) into the generated project first.
 */
export const librarySource = {
  typescript: {
    "src/index.ts": `export { Badge, type BadgeSignature } from "./components/badge.gts";
export { default as Greeting, type GreetingSignature } from "./components/greeting.gts";
export { add } from "./utils/math.ts";
`,
    "src/components/greeting.gts": `import Component from "@glimmer/component";

export interface GreetingSignature {
  Element: HTMLParagraphElement;
  Args: {
    name: string;
  };
}

export default class Greeting extends Component<GreetingSignature> {
  <template>
    <p ...attributes>Hello, {{@name}}!</p>
  </template>
}
`,
    "src/components/badge.gts": `import type { TOC } from "@ember/component/template-only";

export interface BadgeSignature {
  Element: HTMLSpanElement;
  Blocks: {
    default: [];
  };
}

export const Badge: TOC<BadgeSignature> = <template>
  <span class="badge" ...attributes>{{yield}}</span>
</template>;
`,
    "src/utils/math.ts": `export function add(a: number, b: number): number {
  return a + b;
}
`,
  },
  javascript: {
    "src/index.js": `export { Badge } from "./components/badge.gjs";
export { default as Greeting } from "./components/greeting.gjs";
export { add } from "./utils/math.js";
`,
    "src/components/greeting.gjs": `import Component from "@glimmer/component";

export default class Greeting extends Component {
  <template>
    <p ...attributes>Hello, {{@name}}!</p>
  </template>
}
`,
    "src/components/badge.gjs": `export const Badge = <template>
  <span class="badge" ...attributes>{{yield}}</span>
</template>;
`,
    "src/utils/math.js": `export function add(a, b) {
  return a + b;
}
`,
  },
};

export async function writeLibrarySource(project: Project, flavor: keyof typeof librarySource) {
  for (let [filePath, contents] of Object.entries(librarySource[flavor])) {
    let target = join(project.directory, filePath);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

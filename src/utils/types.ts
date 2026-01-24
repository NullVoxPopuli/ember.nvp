import type { ResultPromise } from "execa";

export type PackageManager = "pnpm" | "npm";

export interface Project {
  readonly directory: string;
  readonly desires: Answers;
  readonly wantsTypeScript: boolean;

  run(command: string): Promise<ResultPromise>;
  install(command: string): Promise<ResultPromise>;
}

export interface Layer {
  /**
   * The text to show during selection
   */
  label: string;
  hint?: string;
  defaultValue?: () => unknown;
  /**
   * The function that applies the codemod
   *
   * run _may_ be invoked multiple times,
   * so it's important to not require interaction here
   */
  run: (project: Project) => Promise<void>;
  isSetup: (project: Project) => Promise<boolean>;
}

export interface Answers {
  type: string;
  path: string;
  name: string;
  layers: Layer[];
  packageManager: PackageManager;
}

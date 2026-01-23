import type { ResultPromise } from "execa";

type PackageManager = "pnpm" | "npm";

interface Project {
  readonly directory: string;
  readonly desires: Answers;
  readonly wantsTypeScript: boolean;

  run(command: string): Promise<ResultPromise>;
  install(command: string): Promise<ResultPromise>;
}

export interface Layer {
  label: string;
  description: string;
  defaultValue?: () => unknown;
  run(project: Project): Promise<void>;
  isSetup: (project: Project) => Promise<boolean>;
}

export interface Answers {
  type: string;
  path: string;
  name: string;
  layers: Layer[];
  packageManager: PackageManager;
}

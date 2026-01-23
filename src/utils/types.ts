type PackageManager = "pnpm" | "npm";

interface Project {
  readonly directory: string;
  readonly desires: Answers;
  readonly wantsTypeScript: boolean;
}

export interface Layer {
  label: string;
  description: string;
  run(project: Project): Promise<void>;
}

export interface Answers {
  type: string;
  path: string;
  layers: Layer[];
  packageManager: PackageManager;
}

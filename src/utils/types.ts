import { Project } from "./project.js";
export type PackageManager = "pnpm" | "npm";
export type ProjectType = "app" | "library";

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

interface DiscoveredLayer extends Layer {
  /**
   * The unique name of the layer
   * (exact match of the folder name
   *   not provided by the layer
   * )
   */
  name: string;
}

export interface Answers {
  type: ProjectType;
  path: string;
  name: string;
  layers: DiscoveredLayer[];
  packageManager: PackageManager;
}

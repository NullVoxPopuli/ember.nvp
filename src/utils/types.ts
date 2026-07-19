import { Project } from "./project.js";
export type PackageManager = "pnpm" | "npm";
export type ProjectType = "app" | "library" | "extension";

export interface Layer {
  /**
   * The text to show during selection
   */
  label: string;
  hint?: string;
  /**
   * Whether the layer is pre-selected in the CLI (the user can still
   * deselect it).
   */
  defaultValue?: (projectType: ProjectType) => unknown;
  /**
   * The function that applies the codemod
   *
   * run _may_ be invoked multiple times,
   * so it's important to not require interaction here
   */
  run: (project: Project) => Promise<void>;
  isSetup: <Explain extends boolean = false>(
    project: Project,
    explain?: Explain,
  ) => Promise<
    Explain extends true
      ? {
          isSetup: boolean;
          reasons: string[];
        }
      : boolean
  >;
}

export interface DiscoveredLayer extends Layer {
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

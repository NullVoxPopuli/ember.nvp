import { describe, it, expect } from "vitest";
import { Project } from "#utils/project.js";
import { parseLayerOptionsFromArgv } from "#args";
import type { DiscoveredLayer } from "#types";

describe("Layer Options Feature", () => {
  const dummyLayer: DiscoveredLayer = {
    name: "prettier",
    label: "Prettier",
    options: {
      printWidth: {
        type: "number",
        prompt: "What print width would you like?",
        default: 100,
        validate: (val: number) => val > 0 || "Must be > 0",
      },
      useTabs: {
        type: "confirm",
        prompt: "Use tabs?",
        default: false,
      },
    },
    async run(project, options = {}) {
      // noop
    },
    async isSetup(_project?: Project, explain?: boolean): Promise<any> {
      return explain ? { isSetup: true, reasons: [] } : true;
    },
  };

  describe("Project.prototype.getLayerOptions", () => {
    it("returns default values when no user options are provided", () => {
      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [dummyLayer],
      });

      expect(project.getLayerOptions("prettier")).toEqual({
        printWidth: 100,
        useTabs: false,
      });
    });

    it("overrides default values with user-supplied options", () => {
      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [dummyLayer],
        options: {
          prettier: {
            printWidth: 120,
          },
        },
      });

      expect(project.getLayerOptions("prettier")).toEqual({
        printWidth: 120,
        useTabs: false,
      });
    });

    it("returns empty object for layers without options or schemas", () => {
      const plainLayer: DiscoveredLayer = {
        name: "plain",
        label: "Plain Layer",
        async run() {},
        async isSetup(_project?: Project, explain?: boolean): Promise<any> {
          return explain ? { isSetup: true, reasons: [] } : true;
        },
      };

      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [plainLayer],
      });

      expect(project.getLayerOptions("plain")).toEqual({});
    });
  });

  describe("parseLayerOptionsFromArgv", () => {
    it("parses --<layer>.<option> flags", () => {
      const argv = ["--layers", "prettier", "--prettier.printWidth", "120", "--prettier.useTabs"];
      const parsed = parseLayerOptionsFromArgv([dummyLayer], argv);

      expect(parsed).toEqual({
        prettier: {
          printWidth: 120,
          useTabs: true,
        },
      });
    });

    it("ignores flags for unknown layers or options", () => {
      const argv = ["--unknown-flag", "value", "--prettier.unknownOpt", "100"];
      const parsed = parseLayerOptionsFromArgv([dummyLayer], argv);

      expect(parsed).toEqual({});
    });
  });

  describe("Layer execution with options", () => {
    it("passes options to layer.run", async () => {
      let receivedOptions: Record<string, any> | undefined;

      const layerWithOptions: DiscoveredLayer = {
        name: "test-layer",
        label: "Test Layer",
        options: {
          theme: {
            type: "select",
            prompt: "Select theme",
            default: "light",
            options: [
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
            ],
          },
        },
        async run(_project, options) {
          receivedOptions = options;
        },
        async isSetup(_project?: Project, explain?: boolean): Promise<any> {
          return explain ? { isSetup: true, reasons: [] } : true;
        },
      };

      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [layerWithOptions],
        options: {
          "test-layer": {
            theme: "dark",
          },
        },
      });

      const opts = project.getLayerOptions("test-layer");
      await layerWithOptions.run(project, opts);

      expect(receivedOptions).toEqual({
        theme: "dark",
      });
    });
  });
});

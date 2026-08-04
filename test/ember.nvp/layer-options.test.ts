import { describe, it, expect } from "vitest";
import { Project } from "#utils/project.js";
import { parseLayerOptionsFromParsedArgs } from "#args";
import type { DiscoveredLayer } from "#types";

describe("Layer Options Feature", () => {
  const fakeKitchenSinkLayer: DiscoveredLayer = {
    name: "fake-kitchen-sink",
    label: "Fake Kitchen Sink Layer",
    hint: "demonstrates options",
    options: {
      unitCount: {
        type: "number",
        prompt: "How many units do you want?",
        default: 7,
        validate: (val: number) => val > 0 || "Must be greater than 0",
      },
      customTitle: {
        type: "text",
        prompt: "Enter a custom title",
        default: "My Kitchen Sink",
        validate: (input: string) => (input.trim().length > 0 ? true : "Title cannot be empty"),
      },
      flavor: {
        type: "select",
        prompt: "Which kitchen sink flavor do you prefer?",
        default: "standard",
        options: [
          { label: "Standard", value: "standard", hint: "Regular kitchen sink setup" },
          { label: "Deluxe", value: "deluxe", hint: "Includes extra features" },
        ],
      },
      enableLogging: {
        type: "confirm",
        prompt: "Enable detailed sink logging?",
        default: true,
      },
    },
    async run(_project, _options = {}) {
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
        layers: [fakeKitchenSinkLayer],
      });

      expect(project.getLayerOptions("fake-kitchen-sink")).toEqual({
        unitCount: 7,
        customTitle: "My Kitchen Sink",
        flavor: "standard",
        enableLogging: true,
      });
    });

    it("overrides default values with user-supplied options", () => {
      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [fakeKitchenSinkLayer],
        options: {
          "fake-kitchen-sink": {
            unitCount: 12,
            customTitle: "Custom Sink",
            flavor: "deluxe",
            enableLogging: false,
          },
        },
      });

      expect(project.getLayerOptions("fake-kitchen-sink")).toEqual({
        unitCount: 12,
        customTitle: "Custom Sink",
        flavor: "deluxe",
        enableLogging: false,
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

  describe("Option Validation Schemas", () => {
    it("validates number schema constraints", () => {
      const numberSchema = fakeKitchenSinkLayer.options!.unitCount!;
      expect(numberSchema.validate!(10)).toBe(true);
      expect(numberSchema.validate!(0)).toBe("Must be greater than 0");
    });

    it("validates text schema constraints", () => {
      const textSchema = fakeKitchenSinkLayer.options!.customTitle!;
      expect(textSchema.validate!("Valid Title")).toBe(true);
      expect(textSchema.validate!("   ")).toBe("Title cannot be empty");
    });
  });

  describe("parseLayerOptionsFromParsedArgs", () => {
    it("parses layer options for all option types", () => {
      const parsedValues = {
        layers: ["fake-kitchen-sink"],
        "fake-kitchen-sink.unitCount": "15",
        "fake-kitchen-sink.customTitle": "CLI Title",
        "fake-kitchen-sink.flavor": "deluxe",
        "fake-kitchen-sink.enableLogging": true,
      };
      const parsed = parseLayerOptionsFromParsedArgs([fakeKitchenSinkLayer], parsedValues);

      expect(parsed).toEqual({
        "fake-kitchen-sink": {
          unitCount: 15,
          customTitle: "CLI Title",
          flavor: "deluxe",
          enableLogging: true,
        },
      });
    });

    it("ignores flags for unknown layers or options", () => {
      const parsedValues = {
        "unknown-flag": "value",
        "fake-kitchen-sink.unknownOpt": "100",
      };
      const parsed = parseLayerOptionsFromParsedArgs([fakeKitchenSinkLayer], parsedValues);

      expect(parsed).toEqual({});
    });
  });

  describe("Layer execution with options", () => {
    it("passes options to layer.run", async () => {
      let receivedOptions: Record<string, any> | undefined;

      const layerWithOptions: DiscoveredLayer = {
        ...fakeKitchenSinkLayer,
        async run(_project, options) {
          receivedOptions = options;
        },
      };

      const project = new Project("/tmp/test", {
        name: "my-app",
        type: "app",
        path: "/tmp/test",
        packageManager: "pnpm",
        layers: [layerWithOptions],
        options: {
          "fake-kitchen-sink": {
            unitCount: 42,
            flavor: "deluxe",
          },
        },
      });

      const opts = project.getLayerOptions("fake-kitchen-sink");
      await layerWithOptions.run(project, opts);

      expect(receivedOptions).toEqual({
        unitCount: 42,
        customTitle: "My Kitchen Sink",
        flavor: "deluxe",
        enableLogging: true,
      });
    });
  });
});

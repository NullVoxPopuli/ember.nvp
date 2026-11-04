import { describe, it, expect, vi } from "vitest";
import { stripVTControlCharacters } from "node:util";
import { Project } from "#utils/project.js";
import { coreOptions, parseCliArgs, parseLayerOptionsFromParsedArgs } from "#args";
import { printHelp } from "../../src/cli/help.js";
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
        validate: (val: number) => (val > 0 ? undefined : "Must be greater than 0"),
      },
      customTitle: {
        type: "text",
        prompt: "Enter a custom title",
        default: "My Kitchen Sink",
        validate: (input: string) =>
          input.trim().length > 0 ? undefined : "Title cannot be empty",
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
      extras: {
        type: "multiselect",
        prompt: "Select optional kitchen sink extras",
        default: ["soap-dispenser"],
        options: [
          { label: "Soap Dispenser", value: "soap-dispenser", hint: "Built-in pump" },
          { label: "Garbage Disposal", value: "garbage-disposal", hint: "Continuous feed" },
        ],
        validate: (val: string[]) => (val.length > 0 ? undefined : "Select at least one extra"),
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
        extras: ["soap-dispenser"],
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
            extras: ["garbage-disposal"],
          },
        },
      });

      expect(project.getLayerOptions("fake-kitchen-sink")).toEqual({
        unitCount: 12,
        customTitle: "Custom Sink",
        flavor: "deluxe",
        enableLogging: false,
        extras: ["garbage-disposal"],
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

  describe("CLI flags", () => {
    const layers = [fakeKitchenSinkLayer];

    function parse(args: string[]) {
      return parseLayerOptionsFromParsedArgs(layers, parseCliArgs(args, layers));
    }

    it("parses layer options for all option types", () => {
      expect(
        parse([
          "--fake-kitchen-sink.unitCount=15",
          "--fake-kitchen-sink.customTitle",
          "CLI Title",
          "--fake-kitchen-sink.flavor",
          "deluxe",
          "--no-fake-kitchen-sink.enableLogging",
          "--fake-kitchen-sink.extras",
          "soap-dispenser",
          "--fake-kitchen-sink.extras",
          "garbage-disposal",
        ]),
      ).toEqual({
        "fake-kitchen-sink": {
          unitCount: 15,
          customTitle: "CLI Title",
          flavor: "deluxe",
          enableLogging: false,
          extras: ["soap-dispenser", "garbage-disposal"],
        },
      });
    });

    it("turns a confirm option on without a value", () => {
      expect(parse(["--fake-kitchen-sink.enableLogging"])).toEqual({
        "fake-kitchen-sink": { enableLogging: true },
      });
    });

    it("parses multiselect options supplied as comma-separated string", () => {
      expect(parse(["--fake-kitchen-sink.extras", "soap-dispenser, garbage-disposal"])).toEqual({
        "fake-kitchen-sink": {
          extras: ["soap-dispenser", "garbage-disposal"],
        },
      });
    });

    it("leaves out options that were not passed", () => {
      expect(parse(["--name", "my-app"])).toEqual({});
    });

    it("ignores flags for layers that were not selected", () => {
      const values = parseCliArgs(["--fake-kitchen-sink.flavor", "deluxe"], layers);

      expect(parseLayerOptionsFromParsedArgs([], values)).toEqual({});
    });

    it("throws when a confirm option is given a value", () => {
      expect(() => parseCliArgs(["--fake-kitchen-sink.enableLogging=false"], layers)).toThrow(
        "Option '--fake-kitchen-sink.enableLogging' does not take an argument",
      );
    });

    it("throws on an unknown option", () => {
      expect(() => parseCliArgs(["--fake-kitchen-sink.unitcount=3"], layers)).toThrow(
        "Unknown option '--fake-kitchen-sink.unitcount'",
      );
    });

    it.each([
      ["a value that fails validate", "--fake-kitchen-sink.unitCount=-5"],
      ["a number in hex", "--fake-kitchen-sink.unitCount=0x10"],
      ["an unlisted select value", "--fake-kitchen-sink.flavor=ultra"],
      ["an unlisted multiselect value", "--fake-kitchen-sink.extras=invalid-extra"],
    ])("exits on %s", (_, arg) => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit called");
      }) as any);

      try {
        expect(() => parse([arg])).toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });
  });

  it("lists layer options in --help", () => {
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(stripVTControlCharacters(line));
    });

    try {
      printHelp(coreOptions, [fakeKitchenSinkLayer]);
    } finally {
      logSpy.mockRestore();
    }

    const output = lines.join("\n");

    expect(output.slice(output.indexOf("Layer Options:"))).toMatchInlineSnapshot(`
      "Layer Options:
        Without a TTY, an option without a flag gets its default.

        Layer: fake-kitchen-sink
            --fake-kitchen-sink.unitCount <number>
            How many units do you want? [default: 7]

            --fake-kitchen-sink.customTitle <string>
            Enter a custom title [default: "My Kitchen Sink"]

            --fake-kitchen-sink.flavor <string>
            Which kitchen sink flavor do you prefer? [choices: "standard", "deluxe"] [default: "standard"]

            --[no-]fake-kitchen-sink.enableLogging <boolean>
            Enable detailed sink logging? [default: true]

            --fake-kitchen-sink.extras <string> [--fake-kitchen-sink.extras <string> ...]
            Select optional kitchen sink extras [choices: "soap-dispenser", "garbage-disposal"] [default: ["soap-dispenser"]]
      "
    `);
  });

  it("marks a text option without a default as required without a TTY", () => {
    const fakeRequiredLayer: DiscoveredLayer = {
      name: "fake-required",
      label: "Fake Required Layer",
      options: {
        title: { type: "text", prompt: "Which title?" },
        flavor: {
          type: "select",
          prompt: "Which flavor?",
          options: [{ label: "Plain", value: "plain" }],
        },
      },
      async run() {},
      async isSetup(_project?: Project, explain?: boolean): Promise<any> {
        return explain ? { isSetup: true, reasons: [] } : true;
      },
    };

    const lines: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(stripVTControlCharacters(line));
    });

    try {
      printHelp(coreOptions, [fakeRequiredLayer]);
    } finally {
      logSpy.mockRestore();
    }

    const output = lines.join("\n");

    expect(output).toContain("Which title? [required without a TTY]");
    expect(output).toContain('Which flavor? [choices: "plain"]\n');
  });
});

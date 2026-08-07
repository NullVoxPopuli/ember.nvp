import { describe, it, expect } from "vitest";
import { validateOption } from "../../src/cli/questions/validate-option.js";
import type { LayerOptionSchema } from "../../src/utils/types.js";

describe("validateOption", () => {
  describe("number validation", () => {
    const schema: LayerOptionSchema = {
      type: "number",
      prompt: "Enter number",
      default: 10,
      validate: (val: number) => val > 0 || "Must be greater than 0",
    };

    it("validates valid numbers", () => {
      expect(validateOption(schema, 5)).toEqual({ ok: true, value: 5 });
      expect(validateOption(schema, "42")).toEqual({ ok: true, value: 42 });
    });

    it("falls back to default when input is empty string or undefined", () => {
      expect(validateOption(schema, "")).toEqual({ ok: true, value: 10 });
      expect(validateOption(schema, undefined)).toEqual({ ok: true, value: 10 });
    });

    it("fails on non-numeric strings", () => {
      expect(validateOption(schema, "abc")).toEqual({ ok: false, error: "Must be a valid number" });
    });

    it("fails custom validate function", () => {
      expect(validateOption(schema, -5)).toEqual({ ok: false, error: "Must be greater than 0" });
    });
  });

  describe("text validation", () => {
    const schema: LayerOptionSchema = {
      type: "text",
      prompt: "Enter text",
      default: "default-title",
      validate: (val: string) => val.length >= 3 || "Minimum 3 chars",
    };

    it("validates valid text", () => {
      expect(validateOption(schema, "hello")).toEqual({ ok: true, value: "hello" });
    });

    it("uses default when input is empty", () => {
      expect(validateOption(schema, "")).toEqual({ ok: true, value: "default-title" });
    });

    it("fails custom validate function", () => {
      expect(validateOption(schema, "hi")).toEqual({ ok: false, error: "Minimum 3 chars" });
    });
  });

  describe("confirm validation", () => {
    const schema: LayerOptionSchema = {
      type: "confirm",
      prompt: "Confirm action",
      default: true,
    };

    it("validates booleans and boolean strings", () => {
      expect(validateOption(schema, true)).toEqual({ ok: true, value: true });
      expect(validateOption(schema, "false")).toEqual({ ok: true, value: false });
      expect(validateOption(schema, "yes")).toEqual({ ok: true, value: true });
      expect(validateOption(schema, "no")).toEqual({ ok: true, value: false });
    });

    it("uses default when input is empty", () => {
      expect(validateOption(schema, "")).toEqual({ ok: true, value: true });
    });

    it("fails invalid boolean string", () => {
      expect(validateOption(schema, "maybe")).toEqual({
        ok: false,
        error: "Invalid boolean value 'maybe'. Must be true/false or yes/no.",
      });
    });
  });

  describe("select validation", () => {
    const schema: LayerOptionSchema = {
      type: "select",
      prompt: "Select option",
      default: "standard",
      options: [
        { label: "Standard", value: "standard" },
        { label: "Deluxe", value: "deluxe" },
      ],
    };

    it("validates valid option choice", () => {
      expect(validateOption(schema, "deluxe")).toEqual({ ok: true, value: "deluxe" });
    });

    it("uses default when input is empty", () => {
      expect(validateOption(schema, "")).toEqual({ ok: true, value: "standard" });
    });

    it("fails unlisted choice", () => {
      expect(validateOption(schema, "ultra")).toEqual({
        ok: false,
        error: "Invalid option 'ultra'. Must be one of: standard, deluxe",
      });
    });
  });
});

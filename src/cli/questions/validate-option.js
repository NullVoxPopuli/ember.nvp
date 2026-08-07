/**
 * @typedef {import('#types').LayerOptionSchema} LayerOptionSchema
 *
 * @typedef {Object} ValidationSuccess
 * @property {true} ok
 * @property {any} value
 */

/**
 * @typedef {Object} ValidationFailure
 * @property {false} ok
 * @property {string} error
 */

/**
 * @typedef {ValidationSuccess | ValidationFailure} ValidationResult
 */

/**
 * Type validators map for plug-and-play extensibility.
 * @type {Record<string, (schema: LayerOptionSchema, rawValue: any) => ValidationResult>}
 */
const typeValidators = {
  number(schema, rawValue) {
    let input = rawValue;
    if ((input === undefined || input === "" || input === null) && schema.default !== undefined) {
      input = schema.default;
    }
    const num = Number(input);
    if (isNaN(num)) {
      return { ok: false, error: "Must be a valid number" };
    }
    if (schema.validate) {
      const res = schema.validate(num);
      if (typeof res === "string") return { ok: false, error: res };
      if (res === false) return { ok: false, error: "Invalid value" };
    }
    return { ok: true, value: num };
  },

  text(schema, rawValue) {
    let input = rawValue;
    if ((input === undefined || input === "" || input === null) && schema.default !== undefined) {
      input = String(schema.default);
    } else {
      input = input ?? "";
    }
    const str = String(input);
    if (schema.validate) {
      const res = schema.validate(str);
      if (typeof res === "string") return { ok: false, error: res };
      if (res === false) return { ok: false, error: "Invalid value" };
    }
    return { ok: true, value: str };
  },

  confirm(schema, rawValue) {
    let input = rawValue;
    if ((input === undefined || input === "" || input === null) && schema.default !== undefined) {
      input = schema.default;
    }

    let boolVal;
    if (typeof input === "boolean") {
      boolVal = input;
    } else if (typeof input === "string") {
      const lower = input.trim().toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") {
        boolVal = true;
      } else if (lower === "false" || lower === "no" || lower === "0") {
        boolVal = false;
      } else {
        return {
          ok: false,
          error: `Invalid boolean value '${input}'. Must be true/false or yes/no.`,
        };
      }
    } else {
      return {
        ok: false,
        error: `Invalid boolean value '${String(input)}'. Must be true/false or yes/no.`,
      };
    }

    if (schema.validate) {
      const res = schema.validate(boolVal);
      if (typeof res === "string") return { ok: false, error: res };
      if (res === false) return { ok: false, error: "Invalid value" };
    }
    return { ok: true, value: boolVal };
  },

  select(schema, rawValue) {
    let input = rawValue;
    if ((input === undefined || input === "" || input === null) && schema.default !== undefined) {
      input = schema.default;
    }

    const optionsList = schema.options ?? [];
    const validValues = optionsList.map((/** @type {any} */ opt) =>
      typeof opt === "object" && opt !== null ? opt.value : opt,
    );

    if (!validValues.includes(input)) {
      const allowedStr = validValues.map((/** @type {any} */ v) => String(v)).join(", ");
      return {
        ok: false,
        error: `Invalid option '${String(input)}'. Must be one of: ${allowedStr}`,
      };
    }

    if (schema.validate) {
      const res = schema.validate(input);
      if (typeof res === "string") return { ok: false, error: res };
      if (res === false) return { ok: false, error: "Invalid value" };
    }
    return { ok: true, value: input };
  },
};

/**
 * Validate a raw value against an option schema.
 *
 * @param {LayerOptionSchema} schema
 * @param {any} rawValue
 * @returns {ValidationResult}
 */
export function validateOption(schema, rawValue) {
  if (!schema || !schema.type) {
    return { ok: false, error: "Missing or invalid option schema" };
  }
  const validator = typeValidators[schema.type];
  if (!validator) {
    return { ok: false, error: `Unknown option type '${schema.type}'` };
  }
  return validator(schema, rawValue);
}

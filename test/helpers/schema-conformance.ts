/**
 * A **dependency-free JSON-Schema conformance checker**, sized to exactly the keyword subset the MCP
 * output schemas in `src/mcp/tools.ts` use. This repo declares **zero third-party CLI-core runtime
 * deps** and a hard dependency cap, so the suite validates the published contract with this instead of
 * pulling in a validator.
 *
 * Two properties make that safe to rely on:
 *
 * 1. **It refuses what it does not implement.** An unknown keyword or an unknown `type` throws rather
 *    than being ignored, so the checker can never report green over a schema it did not understand.
 *    That is the failure mode a hand-rolled validator normally has, and it is closed here by
 *    construction. `test/mcp-tools.test.ts` pins it with a negative control.
 * 2. **It never echoes a value.** A violation names the JSON path and the expectation, never the data
 *    at that path, so a failing assertion cannot print an input value into a CI log. That is the same
 *    value-free posture the surface under test is being checked for.
 *
 * @packageDocumentation
 */

/** The JSON-Schema keywords this checker implements. Any other keyword in a schema is a refusal. */
const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "description",
]);

/** The JSON-Schema primitive types this checker implements. Any other `type` is a refusal. */
const SUPPORTED_TYPES: ReadonlySet<string> = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/** True iff `value` is a plain JSON object (not an array, not `null`). */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The JSON type name of `value`, for a violation message. Names the type only, never the value. */
function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** True iff `value` satisfies the JSON-Schema `type` keyword `type`. Throws on an unimplemented type. */
function matchesType(type: string, value: unknown): boolean {
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`schema-conformance: unimplemented JSON-Schema type '${type}'`);
  }
  switch (type) {
    case "object":
      return isJsonObject(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "null":
      return value === null;
    default:
      return typeof value === type;
  }
}

/**
 * Check `value` against `schema` and return every violation as a value-free message. An empty array
 * means the value conforms.
 *
 * @param schema - A JSON Schema using only the implemented keyword subset.
 * @param value - The value to check.
 * @param path - The JSON path prefix used in violation messages (defaults to the root).
 * @returns One value-free message per violation; `[]` when the value conforms.
 * @throws {Error} If the schema uses a keyword or a `type` this checker does not implement, so an
 *   unhandled schema can never be reported as a pass.
 * @example
 * ```ts
 * import { schemaViolations } from "./schema-conformance.js";
 *
 * schemaViolations({ type: "object", properties: {}, required: ["a"] }, {}).length; // => 1
 * ```
 */
export function schemaViolations(schema: unknown, value: unknown, path = "$"): string[] {
  if (!isJsonObject(schema)) {
    throw new Error(`schema-conformance: the schema at ${path} is not a JSON-Schema object`);
  }
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(
        `schema-conformance: unimplemented JSON-Schema keyword '${keyword}' at ${path}`,
      );
    }
  }

  const violations: string[] = [];
  const type = schema["type"];
  if (typeof type === "string" && !matchesType(type, value)) {
    // The value is the wrong shape entirely; checking its members would only add noise.
    return [`${path}: expected type '${type}', got '${typeName(value)}'`];
  }

  const members = schema["enum"];
  if (Array.isArray(members) && !members.includes(value)) {
    violations.push(
      `${path}: value is not one of the ${String(members.length)} declared enum members`,
    );
  }

  if (!isJsonObject(value)) return violations;

  // `Object.hasOwn`, never `in`: an inherited `constructor`/`toString` must not read as a declared
  // property (which would let an undeclared key through) or as a present one.
  const declared = schema["properties"];
  const properties = isJsonObject(declared) ? declared : {};
  const named = schema["required"];
  const required = Array.isArray(named) ? named : [];
  for (const key of required) {
    const name = String(key);
    if (!Object.hasOwn(value, name))
      violations.push(`${path}.${name}: required property is missing`);
  }
  if (schema["additionalProperties"] === false) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) {
        violations.push(`${path}.${key}: undeclared property (additionalProperties is false)`);
      }
    }
  }
  for (const [key, subSchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)) {
      violations.push(...schemaViolations(subSchema, value[key], `${path}.${key}`));
    }
  }
  return violations;
}

/**
 * Assert that `value` conforms to `schema`, throwing a value-free error listing every violation.
 *
 * @param schema - A JSON Schema using only the implemented keyword subset.
 * @param value - The value to check.
 * @param label - A label for the error message (which tool / which case is being checked).
 * @throws {Error} If the value violates the schema, or the schema uses an unimplemented keyword.
 * @example
 * ```ts
 * import { assertConforms } from "./schema-conformance.js";
 *
 * assertConforms({ type: "object", properties: {} }, {}, "empty"); // => undefined
 * ```
 */
export function assertConforms(schema: unknown, value: unknown, label: string): void {
  const violations = schemaViolations(schema, value);
  if (violations.length > 0) {
    throw new Error(
      `${label} does not conform to its declared schema:\n  ${violations.join("\n  ")}`,
    );
  }
}

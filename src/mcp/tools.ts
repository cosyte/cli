/**
 * The **agent-facing tool surface** of the cosyte MCP server — the *second adapter* over the same
 * `core`/`commands` the `cosyte` terminal command drives (ADR 0022, cli roadmap §Phase 5). This module
 * is deliberately **SDK-free**: it declares the tools (name, description, JSON-Schema input) and maps a
 * tool call onto the existing command handlers, returning a plain, value-free MCP-shaped result. The
 * `@modelcontextprotocol/sdk` wiring lives one layer up in `./server.ts`, so the tool *logic* is unit-
 * testable without the SDK and the SDK stays isolated behind the `./mcp` subpath.
 *
 * **The shared-core guarantee.** A tool does not re-implement anything: `parse` calls
 * {@link parseCommand}, `validate` calls {@link validateCommand}, etc., each with `--json` so the
 * library's result lands as machine JSON — so `cosyte parse` and the MCP `parse` tool agree by
 * construction. The tool feeds the caller's `content` string in as if it were piped on stdin (`-`).
 *
 * **The PHI posture (load-bearing).** Every tool runs under the {@link VALUE_FREE} posture — there is
 * **no** `--unsafe-show-values` door on the agent surface. A tool's *result* carries the requested data
 * (the parsed model / converted bundle — the explicit request, the data channel), but a tool *error*
 * carries only the value-free diagnostic the command already produced (a stable code + positional
 * context), never an input value (cli roadmap §7, §Phase 5).
 *
 * @packageDocumentation
 */

import { convertCommand } from "../commands/convert.js";
import { inspectCommand } from "../commands/inspect.js";
import { parseCommand } from "../commands/parse.js";
import { validateCommand } from "../commands/validate.js";
import { CLI_CODES, CliError, toCliError } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunDeps } from "../core/io.js";
import { VALUE_FREE } from "../core/phi.js";
import type { RunResult } from "../core/result.js";

/** A single text content block in an MCP tool result. */
export interface McpTextContent {
  readonly type: "text";
  readonly text: string;
}

/** Value-free metadata every tool result carries so an agent can branch on the outcome. */
export interface McpToolMeta {
  /** The CLI exit code the underlying command resolved to (the documented exit-code contract). */
  readonly exit: number;
  /** `true` iff the tool *call* succeeded (data was produced) — distinct from a negative verdict. */
  readonly ok: boolean;
}

/**
 * The value-free result of dispatching one MCP tool call. Structurally an MCP `CallToolResult`: a text
 * content channel, an `isError` flag, and value-free `structuredContent` metadata.
 */
export interface McpToolResult {
  readonly content: readonly McpTextContent[];
  readonly isError: boolean;
  readonly structuredContent: McpToolMeta;
}

/** A JSON-Schema description of a tool's input (the wire schema advertised to `tools/list`). */
export interface McpToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/** A tool advertised by the server: an agent-callable name, a description, and its input schema. */
export interface McpToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpToolInputSchema;
}

/** The `content` property shared by every tool: the raw message text to operate on. */
const CONTENT_PROP = {
  content: {
    type: "string",
    description:
      "The raw healthcare message to operate on (as text; e.g. an HL7 v2 message or a FHIR JSON resource).",
  },
} as const;

/** The optional `format` override shared by the read commands (autodetected by content when omitted). */
const FORMAT_PROP = {
  format: {
    type: "string",
    enum: ["hl7", "fhir", "dicom", "x12", "ccda", "ncpdp", "astm", "mllp"],
    description:
      "Optional format override; omit to autodetect by content. A format whose parser does not " +
      "support the requested operation returns a value-free CLI_FORMAT_UNSUPPORTED (never a fake).",
  },
} as const;

/**
 * The tools this server exposes — the read/convert operations that share the `core` cleanly and whose
 * results are safe to hand an agent (cli roadmap §Phase 5). `redact`/`deid` (gated on `@cosyte/deid`)
 * and `map-codes` are deliberately **not** exposed yet; they land when the terminal command's ground
 * layer and the tool's PHI/So shape are settled.
 */
export const TOOL_DEFS: readonly McpToolDef[] = [
  {
    name: "parse",
    description:
      "Parse a healthcare message (HL7 v2 or FHIR R4) to typed JSON. Format is autodetected by content. " +
      "Returns the parsed model plus value-free warnings.",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "validate",
    description:
      "Validate a message and carry the verdict: ok=true with a valid result, or a result reporting " +
      "value-free findings. The parsed-but-invalid verdict is a successful call (not a tool error).",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect",
    description:
      "Return a value-free structural summary of a message: its type, segment/entry counts, and a " +
      "warning/issue count. Never includes a field value.",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "convert",
    description:
      "Convert an HL7 v2 message to a FHIR R4 Bundle via @cosyte/transform. Returns the converted " +
      "Bundle; an error-severity conversion issue is reported with ok=false.",
    inputSchema: {
      type: "object",
      properties: {
        ...CONTENT_PROP,
        to: {
          type: "string",
          enum: ["fhir"],
          description: "The conversion target (only FHIR R4 is supported today).",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
];

/** Build injected {@link RunDeps} that feed the tool's inline `content` as if it were piped on stdin. */
function inlineDeps(content: string): RunDeps {
  const bytes = new TextEncoder().encode(content);
  const noFile = new CliError(
    CLI_CODES.CLI_NO_INPUT,
    EXIT.NOINPUT,
    "the MCP tools operate on inline content, not a file path",
  );
  return {
    readStdin: () => Promise.resolve(bytes),
    // The MCP tools always feed inline content via stdin (`-`); a file read is defensive and unreachable.
    /* v8 ignore next -- unreachable: no MCP tool passes a file path, only inline `-` stdin content */
    readFile: () => Promise.reject(noFile),
  };
}

/** Read a required string argument from a tool-call arguments object, or `null` when absent/mistyped. */
function stringArg(args: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" ? v : null;
}

/**
 * Map a command's {@link RunResult} onto a value-free {@link McpToolResult}. A command emits its data on
 * `stdout` (non-empty) and only ever leaves `stdout` empty on a **hard** failure (unparseable / no
 * input / usage / unavailable / internal) — so `stdout === ""` is exactly the "tool call failed" signal.
 * A negative *verdict* (validate-invalid, a convert error-severity issue) still emits its JSON on
 * stdout, so it is a successful call whose value-free payload reports the verdict.
 */
function toToolResult(result: RunResult): McpToolResult {
  const hardError = result.stdout === "";
  const text = hardError ? result.stderr.trim() : result.stdout.trim();
  return {
    content: [
      { type: "text", text: text.length > 0 ? text : `cosyte: exit ${String(result.exit)}` },
    ],
    isError: hardError,
    structuredContent: { exit: result.exit, ok: !hardError },
  };
}

/** Build a value-free usage-error tool result (a bad/missing argument — never echoes the argument). */
function usageError(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: `cosyte: ${CLI_CODES.CLI_USAGE}: ${message}` }],
    isError: true,
    structuredContent: { exit: EXIT.USAGE, ok: false },
  };
}

/**
 * Map an unexpected thrown value to a **value-free** internal-error tool result — the agent-surface
 * mirror of the terminal dispatcher's `try/catch → toCliError` boundary (`core/run.ts`). {@link toCliError}
 * discards the original message, so a library exception that embedded input bytes can never reach the
 * client (which would otherwise see the SDK surface the raw `error.message`). Both adapters inherit the
 * value-free posture *in code*, not by trusting the wrapped libraries never to throw.
 */
function internalError(e: unknown): McpToolResult {
  const err = toCliError(e);
  return {
    content: [{ type: "text", text: `cosyte: ${err.code}: ${err.message}` }],
    isError: true,
    structuredContent: { exit: err.exit, ok: false },
  };
}

/**
 * Dispatch one MCP tool call to the shared command layer and return a value-free {@link McpToolResult}.
 * This is the agent-surface analogue of {@link run}: it validates the arguments, feeds the inline
 * `content` through the same command handlers the terminal uses (under the always-on {@link VALUE_FREE}
 * posture), and maps the {@link RunResult} onto an MCP result. An unknown tool name or a missing
 * `content` argument is a value-free usage error — never a thrown stack trace carrying input.
 *
 * @param name - The tool name (one of {@link TOOL_DEFS}).
 * @param args - The tool-call arguments object.
 * @param deps - Optional {@link RunDeps} override (tests inject fakes); defaults to feeding `content` as
 *   stdin. An unexpected throw from a command is mapped to a value-free `CLI_INTERNAL` result, never
 *   propagated to the SDK (which would surface the raw message).
 * @returns A value-free {@link McpToolResult}; this function never throws.
 * @example
 * ```ts
 * import { dispatchTool } from "@cosyte/cli/mcp";
 *
 * const r = await dispatchTool("parse", { content: '{"resourceType":"Patient"}' });
 * r.isError; // => false
 * ```
 */
export async function dispatchTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  deps?: RunDeps,
): Promise<McpToolResult> {
  const content = stringArg(args, "content");
  if (content === null) {
    return usageError("missing required 'content' argument (the message text to operate on)");
  }
  const runDeps = deps ?? inlineDeps(content);
  const format = stringArg(args, "format");
  const fmtFlag = format !== null ? ["--format", format] : [];

  try {
    switch (name) {
      case "parse":
        return toToolResult(await parseCommand(["-", "--json", ...fmtFlag], runDeps, VALUE_FREE));
      case "validate":
        return toToolResult(
          await validateCommand(["-", "--json", ...fmtFlag], runDeps, VALUE_FREE),
        );
      case "inspect":
        return toToolResult(await inspectCommand(["-", "--json", ...fmtFlag], runDeps, VALUE_FREE));
      case "convert": {
        const to = stringArg(args, "to") ?? "fhir";
        return toToolResult(await convertCommand(["-", "--to", to, "--json"], runDeps, VALUE_FREE));
      }
      default:
        return usageError(`unknown tool '${name}'`);
    }
  } catch (e) {
    // The agent-surface mirror of core/run.ts's dispatcher boundary: any unexpected throw becomes a
    // value-free CLI_INTERNAL result, so a library exception carrying input can never reach the client.
    return internalError(e);
  }
}

/**
 * The **agent-facing tool surface** of the cosyte MCP server: the *second adapter* over the same
 * `core`/`commands` the `cosyte` terminal command drives. This module
 * is deliberately **SDK-free**: it declares the tools (name, description, JSON-Schema input) and maps a
 * tool call onto the existing command handlers, returning a plain, value-free MCP-shaped result. The
 * `@modelcontextprotocol/sdk` wiring lives one layer up in `./server.ts`, so the tool *logic* is unit-
 * testable without the SDK and the SDK stays isolated behind the `./mcp` subpath.
 *
 * **The shared-core guarantee.** A tool does not re-implement anything: `parse` calls
 * {@link parseCommand}, `validate` calls {@link validateCommand}, etc., each with `--json` so the
 * library's result lands as machine JSON, so `cosyte parse` and the MCP `parse` tool agree by
 * construction. The tool feeds the caller's `content` string in as if it were piped on stdin (`-`).
 *
 * **The PHI posture (load-bearing).** Every tool runs under the {@link VALUE_FREE} posture. There is
 * **no** `--unsafe-show-values` door on the agent surface. A tool's *result* carries the requested data
 * (the parsed model / converted bundle: the explicit request, the data channel), but a tool *error*
 * carries only the value-free diagnostic the command already produced (a stable code + positional
 * context), never an input value.
 *
 * **The published contract.** Every tool declares an {@link McpToolOutputSchema}, and every dispatch
 * path returns {@link McpStructuredResult} conforming to the schema its own tool declared, so a client
 * validates an object instead of pattern-matching prose. The text content block carries the serialized
 * JSON of that same structured value. On a **failed** call every field of the structured result is
 * drawn from a fixed enumeration (the outcome vocabulary, the exit-code contract, the
 * {@link CLI_CODES} registry), so no part of the caller's input can appear in it; the tool's own
 * payload is present only on a call that produced data, which is the explicit request.
 *
 * @packageDocumentation
 */

import { convertCommand } from "../commands/convert.js";
import { inspectCommand } from "../commands/inspect.js";
import { parseCommand } from "../commands/parse.js";
import { validateCommand } from "../commands/validate.js";
import { CLI_CODES, CliError, toCliError, type CliCode } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunDeps } from "../core/io.js";
import { VALUE_FREE } from "../core/phi.js";
import type { RunResult } from "../core/result.js";

/** A single text content block in an MCP tool result. */
export interface McpTextContent {
  readonly type: "text";
  readonly text: string;
}

/**
 * The outcome of a tool call, as the single property a client branches on with **no text parsing**:
 * `success` the operation completed cleanly, `verdict` the tool ran and reports a negative finding
 * *about the message* (an invalid resource, an error-severity conversion issue), `failed` the call
 * itself produced no data (a usage mistake, unparseable input, an unavailable parser, an internal
 * error). `verdict` and `failed` are the two a text blob could never reliably separate.
 */
export type McpToolStatus = "success" | "verdict" | "failed";

/**
 * The **structured result** of one tool call: the value-free outcome fields every tool carries, plus
 * that tool's own payload on a call that produced data. This is the object an MCP `tools/call` reply
 * carries as `structuredContent`, and the value whose serialization is the reply's text block.
 */
export interface McpStructuredResult {
  /** `true` iff the tool *call* succeeded (data was produced): distinct from a negative verdict. */
  readonly ok: boolean;
  /** The three-way outcome a client branches on: see {@link McpToolStatus}. */
  readonly status: McpToolStatus;
  /** The CLI exit code the underlying command resolved to (the documented exit-code contract). */
  readonly exit: number;
  /** The stable, value-free diagnostic code on a failed call; absent when data was produced. */
  readonly code?: CliCode;
  /** The tool's own payload (the parsed model, the verdict, the summary, the Bundle); absent on a
   * failed call, which produced none. */
  readonly data?: unknown;
}

/**
 * The historical name for a tool result's structured content, kept as the published alias of
 * {@link McpStructuredResult}.
 */
export type McpToolMeta = McpStructuredResult;

/**
 * The value-free result of dispatching one MCP tool call. Structurally an MCP `CallToolResult`: a text
 * content channel carrying the serialized structured result, an `isError` flag, and the
 * {@link McpStructuredResult} itself.
 */
export interface McpToolResult {
  readonly content: readonly McpTextContent[];
  readonly isError: boolean;
  readonly structuredContent: McpStructuredResult;
}

/** A JSON-Schema description of a tool's input (the wire schema advertised to `tools/list`). */
export interface McpToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/**
 * A JSON-Schema description of a tool's **structured result**: the schema advertised alongside the
 * tool on `tools/list` and the one every reply from that tool conforms to. The protocol fixes the
 * root type as `object`; `required` and `additionalProperties` are declared (never omitted) so the
 * published contract states exactly which properties a client may rely on and forbids the rest.
 */
export interface McpToolOutputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

/**
 * A tool advertised by the server: an agent-callable name, a human-readable title, a description, and
 * the schemas of its input and of its structured result.
 */
export interface McpToolDef {
  readonly name: string;
  /** A human-readable title, so these four generic names stay distinguishable in an aggregating client. */
  readonly title: string;
  readonly description: string;
  readonly inputSchema: McpToolInputSchema;
  readonly outputSchema: McpToolOutputSchema;
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
 * The outcome properties every tool's structured result carries, declared identically in every tool's
 * output schema. Each is drawn from a **fixed enumeration** (the outcome vocabulary, the published
 * exit-code contract, the {@link CLI_CODES} registry), which is what makes a failed call's structured
 * result value-free by construction rather than by review.
 */
const OUTCOME_PROPS = {
  ok: {
    type: "boolean",
    description:
      "True iff the tool call produced data. A negative verdict about the message is still true " +
      "(the tool worked); only a call that produced no data at all is false.",
  },
  status: {
    type: "string",
    enum: ["success", "verdict", "failed"],
    description:
      "The outcome to branch on without parsing text: 'success' the operation completed cleanly, " +
      "'verdict' the tool ran and reports a negative finding about the message, 'failed' the call " +
      "produced no data (a usage mistake, unparseable input, an unavailable parser, an internal error).",
  },
  exit: {
    type: "integer",
    enum: Object.values(EXIT),
    description:
      "The exit code the underlying command resolved to, from the documented exit-code contract.",
  },
  code: {
    type: "string",
    enum: Object.values(CLI_CODES),
    description:
      "The stable diagnostic code on a failed call, drawn from a fixed registry so it never carries " +
      "an input value. Absent on a call that produced data.",
  },
} as const;

/** The properties every structured result must carry, whatever the outcome. */
const OUTCOME_REQUIRED = ["ok", "status", "exit"] as const;

/** Build one tool's output schema: the shared outcome properties plus that tool's own `data` payload. */
function outputSchema(data: Readonly<Record<string, unknown>>): McpToolOutputSchema {
  return {
    type: "object",
    properties: { ...OUTCOME_PROPS, data },
    required: [...OUTCOME_REQUIRED],
    additionalProperties: false,
  };
}

/**
 * The tools this server exposes: the read/convert operations that share the `core` cleanly and whose
 * results are safe to hand an agent. `redact`/`deid` (gated on `@cosyte/deid`)
 * and `map-codes` are deliberately **not** exposed yet; they land when the terminal command's ground
 * layer and the tool's PHI/So shape are settled.
 */
export const TOOL_DEFS: readonly McpToolDef[] = [
  {
    name: "parse",
    title: "Parse a healthcare message",
    description:
      "Parse a healthcare message (HL7 v2 or FHIR R4) to typed JSON. Format is autodetected by content. " +
      "Returns the parsed model plus value-free warnings.",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
    outputSchema: outputSchema({
      type: "object",
      description:
        "The parse payload, present on a call that produced data. A single message parses to " +
        "format + model + warnings. A multi-record input (an MLLP stream) parses to `records`, one " +
        "entry per record: a parsed record, or a value-free per-record error code.",
      properties: {
        format: { type: "string", description: "The format the input was parsed as." },
        model: { description: "The wrapped library's parsed model, verbatim: the data channel." },
        warnings: {
          type: "array",
          description: "Value-free parse warnings: a stable code plus positional context.",
        },
        records: {
          type: "array",
          description: "One entry per record of a multi-record input, in stream order.",
        },
      },
      additionalProperties: false,
    }),
  },
  {
    name: "validate",
    title: "Validate a healthcare message",
    description:
      "Validate a message and carry the verdict: ok=true with a valid result, or a result reporting " +
      "value-free findings. The parsed-but-invalid verdict is a successful call (not a tool error).",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
    outputSchema: outputSchema({
      type: "object",
      description:
        "The validation payload, present on a call that produced data (a valid result and a " +
        "negative verdict alike). Value-free throughout: findings are codes, severities and " +
        "positional locators, never a field value.",
      properties: {
        format: { type: "string", description: "The format the input was validated as." },
        valid: {
          type: "boolean",
          description: "The verdict: false means parsed-but-non-conformant, not a failed call.",
        },
        findings: {
          type: "array",
          description: "Value-free findings: a stable code, a severity, and a positional locator.",
        },
      },
      required: ["format", "valid", "findings"],
      additionalProperties: false,
    }),
  },
  {
    name: "inspect",
    title: "Inspect a healthcare message's structure",
    description:
      "Return a value-free structural summary of a message: its type, segment/entry counts, and a " +
      "warning/issue count. Never includes a field value.",
    inputSchema: {
      type: "object",
      properties: { ...CONTENT_PROP, ...FORMAT_PROP },
      required: ["content"],
      additionalProperties: false,
    },
    outputSchema: outputSchema({
      type: "object",
      description:
        "The value-free structural summary, present on a call that produced data. `format` names " +
        "the shape of the rest, which is that format's own counts and structural type codes " +
        "(a message type, a resource type, a transaction-set id): classification, never a value.",
      properties: {
        format: { type: "string", description: "The format the summary describes." },
      },
      required: ["format"],
      additionalProperties: true,
    }),
  },
  {
    name: "convert",
    title: "Convert HL7 v2 to a FHIR R4 Bundle",
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
    outputSchema: outputSchema({
      type: "object",
      description:
        "The conversion payload, present on a call that produced data. An error-severity finding " +
        "is a negative verdict (the Bundle is still returned), not a failed call.",
      properties: {
        format: { type: "string", description: "The conversion target the Bundle is in." },
        bundle: { type: "object", description: "The converted FHIR R4 Bundle: the data channel." },
        findings: {
          type: "array",
          description:
            "Value-free conversion findings: a code, a severity, and a positional locator.",
        },
      },
      required: ["format", "bundle", "findings"],
      additionalProperties: false,
    }),
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
 * Wrap one {@link McpStructuredResult} as a tool result. The text content block is the **serialized
 * JSON of that same structured value** (the protocol's backwards-compatibility route for a client that
 * reads only text), so the two channels can never disagree: there is one value, serialized once.
 * `isError` marks a failed *call*, which is exactly the `failed` status: a negative verdict about the
 * message is a successful call and stays `isError: false`.
 */
function structuredResult(structuredContent: McpStructuredResult): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    isError: structuredContent.status === "failed",
    structuredContent,
  };
}

/**
 * True iff a parsed data-channel line is one record of a **record stream** rather than a whole
 * message: `parse` gives every streamed record its own zero-based `record` index, and a single-message
 * envelope never carries one. Used so a one-record stream is collected like any other stream instead of
 * being mistaken for a single parsed message.
 */
function isRecordLine(value: unknown): boolean {
  return typeof value === "object" && value !== null && "record" in value;
}

/**
 * Read a command's data channel back as the structured payload. Every dispatch runs its command under
 * `--json`, so `stdout` is one compact JSON document, or (for a multi-record input) one per line; a
 * record stream is collected under `records` so the payload has one declared shape whether the stream
 * held one record or many.
 */
function parsePayload(stdout: string): unknown {
  const values: unknown[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      values.push(JSON.parse(line) as unknown);
      // Defensive: every dispatch runs its command under `--json`, so the data channel is JSON on
      // every path here. An unreadable one yields no payload rather than a half-parsed one.
      /* v8 ignore start -- defensive: no dispatch path emits a non-JSON data channel */
    } catch {
      return undefined;
    }
    /* v8 ignore stop */
  }
  const only = values.length === 1 ? values[0] : undefined;
  return only !== undefined && !isRecordLine(only) ? only : { records: values };
}

/**
 * The stable diagnostic code a failed command reported, or `undefined` when its diagnostic carried
 * none. **Value-free by construction**: the answer is a member of the {@link CLI_CODES} registry that
 * the diagnostic line matched, never a substring lifted out of `stderr`, so no input value can reach
 * the structured result through this door even if a future diagnostic were to carry one.
 */
function diagnosticCode(stderr: string): CliCode | undefined {
  return Object.values(CLI_CODES).find((code) => stderr.includes(`cosyte: ${code}: `));
}

/**
 * Map a command's {@link RunResult} onto an {@link McpToolResult}. A command emits its data on
 * `stdout` (non-empty) and only ever leaves `stdout` empty on a **hard** failure (unparseable / no
 * input / usage / unavailable / internal), so `stdout === ""` is exactly the "tool call failed" signal
 * and resolves to `failed` plus the value-free diagnostic code. A negative *verdict* (validate-invalid,
 * a convert error-severity issue) still emits its JSON on stdout: a successful call, distinguished from
 * both a clean success and a failed call by its own `status`, carrying its payload like any other.
 */
function toToolResult(result: RunResult): McpToolResult {
  if (result.stdout === "") {
    const code = diagnosticCode(result.stderr);
    return structuredResult({
      ok: false,
      status: "failed",
      exit: result.exit,
      ...(code !== undefined ? { code } : {}),
    });
  }
  const data = parsePayload(result.stdout);
  return structuredResult({
    ok: true,
    status: result.exit === EXIT.OK ? "success" : "verdict",
    exit: result.exit,
    ...(data !== undefined ? { data } : {}),
  });
}

/**
 * Build a value-free usage-error tool result for a call that failed **before any tool ran** (an
 * unknown tool name, a missing or non-string `content`). It carries the outcome, the exit code and the
 * stable code, and **no part of what the caller sent**: not an argument value, and not the tool name
 * either, which is caller-supplied text like any other and has no place in an agent's context.
 */
function usageError(): McpToolResult {
  return structuredResult({
    ok: false,
    status: "failed",
    exit: EXIT.USAGE,
    code: CLI_CODES.CLI_USAGE,
  });
}

/**
 * Map an unexpected thrown value to a **value-free** internal-error tool result: the agent-surface
 * mirror of the terminal dispatcher's `try/catch → toCliError` boundary (`core/run.ts`). {@link toCliError}
 * discards the original message, so a library exception that embedded input bytes can never reach the
 * client (which would otherwise see the SDK surface the raw `error.message`). Both adapters inherit the
 * value-free posture *in code*, not by trusting the wrapped libraries never to throw. Only the error's
 * registry code and its exit code reach the result; its message never does.
 */
function internalError(e: unknown): McpToolResult {
  const err = toCliError(e);
  return structuredResult({ ok: false, status: "failed", exit: err.exit, code: err.code });
}

/**
 * Dispatch one MCP tool call to the shared command layer and return a value-free {@link McpToolResult}.
 * This is the agent-surface analogue of {@link run}: it validates the arguments, feeds the inline
 * `content` through the same command handlers the terminal uses (under the always-on {@link VALUE_FREE}
 * posture), and maps the {@link RunResult} onto an MCP result. An unknown tool name or a missing
 * `content` argument is a value-free usage error, never a thrown stack trace carrying input.
 *
 * Every path returns an {@link McpStructuredResult} conforming to the called tool's declared
 * {@link McpToolDef.outputSchema}, with the same value serialized into the text content block. An
 * unknown tool name has no schema of its own, so it answers with the shared outcome fields alone,
 * which every tool's schema declares.
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
 * r.structuredContent.status; // => "success"
 * ```
 */
export async function dispatchTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  deps?: RunDeps,
): Promise<McpToolResult> {
  const content = stringArg(args, "content");
  if (content === null) return usageError();
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
        // The tool name is caller-supplied text, so it is answered with a value-free usage error and
        // never echoed back: the same posture the arguments get.
        return usageError();
    }
  } catch (e) {
    // The agent-surface mirror of core/run.ts's dispatcher boundary: any unexpected throw becomes a
    // value-free CLI_INTERNAL result, so a library exception carrying input can never reach the client.
    return internalError(e);
  }
}

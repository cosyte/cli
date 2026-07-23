/**
 * The top-level **subcommand dispatcher** — a small hand-rolled router over Node's built-in
 * `util.parseArgs`, deliberately **third-party-framework-free** so the CLI core keeps zero third-party
 * runtime dependencies (cli roadmap §4.1). It maps `argv[0]` to a command handler, serves `--help`
 * and `--version`, and turns any unexpected exception into a value-free `CLI_INTERNAL` result so a
 * stack trace carrying input can never reach the terminal.
 *
 * @packageDocumentation
 */

import { convertCommand } from "../commands/convert.js";
import { fmtCommand } from "../commands/fmt.js";
import { inspectCommand } from "../commands/inspect.js";
import { mapCodesCommand } from "../commands/map-codes.js";
import { parseCommand } from "../commands/parse.js";
import { redactCommand } from "../commands/redact.js";
import { validateCommand } from "../commands/validate.js";
import { CLI_CODES, CliError, toCliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { RunDeps } from "./io.js";
import { extractPhiPosture } from "./phi.js";
import type { RunResult } from "./result.js";
import { VERSION } from "./version.js";

/** The value-free `--help` text. Names commands, flags, and exit codes — never any input. */
const HELP = `cosyte — a PHI-safe developer CLI over the @cosyte/* healthcare parsers

Usage:
  cosyte <command> [options]

Commands:
  parse <file|->      Parse a healthcare message to typed JSON (format autodetected)
  validate <file|->   Validate a message; exit code carries the verdict (0 valid / 1 invalid)
  inspect <file|->    Print a value-free structural summary (segment/resource counts, type)
  fmt <file|->        Canonically re-serialize via the parser's spec-clean serializer
  convert <file|->    Convert HL7 v2 → FHIR R4 via @cosyte/transform (use --to fhir)
  map-codes <cmap|->  Translate a code through a BYO FHIR ConceptMap via @cosyte/terminology
  redact <file|->     De-identify a message (alias: deid) — gated on @cosyte/deid, not yet available
  mcp                 Start the stdio MCP server (agent front door; also the cosyte-mcp bin)

Global:
  -h, --help              Show this help
  -V, --version           Show the CLI version
  --unsafe-show-values    Permit input values on stderr/diagnostics (PHI-exposing; off by default)

Common options (parse / validate / inspect / fmt):
  --format <fmt>    Override autodetection: hl7 | fhir | dicom | x12 | ccda | ncpdp | astm
                    (wired this build: hl7, fhir)
  --json            Machine-readable JSON output (parse / validate / inspect / convert / map-codes)
  --quiet           Suppress value-free notes on stderr
  --no-color        Disable ANSI colour

convert options:
  --to fhir         The conversion target (required; only HL7 v2 → FHIR R4 today)

map-codes options (the positional is a BYO FHIR ConceptMap; a code is not PHI):
  --code <code>     The source code to translate (required)
  --system <uri>    The source code system (optional; selects the ConceptMap group)
  --version <v>     The source code system version (optional)
  --display <d>     The source display (optional)

Exit codes:
  0   success / valid    65  data error (unparseable / undetected format)
  1   invalid (validate) 66  no input (missing/unreadable file)
  2   usage error        69  unavailable (a capability is not yet built, e.g. redact)
                         70  internal error

PHI posture: the parsed model goes to stdout (the data channel you chose); every diagnostic on
stderr is value-free — codes and positions only, never a field value — unless you pass the loud,
opt-in --unsafe-show-values (which permits a bounded input excerpt in a failure diagnostic).
`;

/** True if `argv` requests help (`-h`/`--help` anywhere). */
function wantsHelp(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

/**
 * Run a full `cosyte` invocation as data.
 *
 * @param argv - The arguments after the program name (i.e. `process.argv.slice(2)`).
 * @param deps - Injected input readers ({@link RunDeps}).
 * @returns The {@link RunResult} to write to the process streams and exit with.
 * @example
 * ```ts
 * import { run } from "@cosyte/cli";
 *
 * const deps = { readFile: async () => new Uint8Array(), readStdin: async () => new Uint8Array() };
 * const { exit } = await run(["--version"], deps);
 * exit; // => 0
 * ```
 */
export async function run(argv: string[], deps: RunDeps): Promise<RunResult> {
  // Resolve the global, order-independent --unsafe-show-values flag once, and dispatch on the argv
  // with it removed so each command's own parseArgs never sees it (core/phi.ts).
  const { posture, argv: rest0 } = extractPhiPosture(argv);
  const [command, ...rest] = rest0;
  if (command === undefined || wantsHelp(rest0)) {
    return { stdout: HELP, stderr: "", exit: EXIT.OK };
  }
  if (command === "--version" || command === "-V") {
    return { stdout: `${VERSION}\n`, stderr: "", exit: EXIT.OK };
  }

  try {
    switch (command) {
      case "parse":
        return await parseCommand(rest, deps, posture);
      case "validate":
        return await validateCommand(rest, deps, posture);
      case "inspect":
        return await inspectCommand(rest, deps, posture);
      case "fmt":
        return await fmtCommand(rest, deps, posture);
      case "convert":
        return await convertCommand(rest, deps, posture);
      case "map-codes":
        return await mapCodesCommand(rest, deps);
      case "redact":
      case "deid":
        return redactCommand(rest);
      default:
        return resolve(
          new CliError(
            CLI_CODES.CLI_USAGE,
            EXIT.USAGE,
            `unknown command '${command}'; run \`cosyte --help\``,
          ),
        );
    }
  } catch (e) {
    return resolve(toCliError(e));
  }
}

/** Render a {@link CliError} as a value-free {@link RunResult}. */
function resolve(e: CliError): RunResult {
  return { stdout: "", stderr: `cosyte: ${e.code}: ${e.message}\n`, exit: e.exit };
}

/**
 * The top-level **subcommand dispatcher** — a small hand-rolled router over Node's built-in
 * `util.parseArgs`, deliberately **third-party-framework-free** so the CLI core keeps zero third-party
 * runtime dependencies (cli roadmap §4.1). It maps `argv[0]` to a command handler, serves `--help`
 * and `--version`, and turns any unexpected exception into a value-free `CLI_INTERNAL` result so a
 * stack trace carrying input can never reach the terminal.
 *
 * @packageDocumentation
 */

import { parseCommand } from "../commands/parse.js";
import { CLI_CODES, CliError, toCliError } from "./diagnostics.js";
import { EXIT } from "./exit-codes.js";
import type { RunDeps } from "./io.js";
import type { RunResult } from "./result.js";
import { VERSION } from "./version.js";

/** The value-free `--help` text. Names commands, flags, and exit codes — never any input. */
const HELP = `cosyte — a PHI-safe developer CLI over the @cosyte/* healthcare parsers

Usage:
  cosyte <command> [options]

Commands:
  parse <file|->    Parse a healthcare message to typed JSON (format autodetected)

Global:
  -h, --help        Show this help
  -V, --version     Show the CLI version

parse options:
  --format <fmt>    Override autodetection: hl7 | fhir | dicom | x12 | ccda | ncpdp | astm
                    (wired this build: hl7, fhir)
  --json            Compact machine-readable JSON (default is pretty-printed)
  --quiet           Suppress the value-free warning-count note on stderr
  --no-color        Disable ANSI colour

Exit codes:
  0   success            65  data error (unparseable / undetected format)
  2   usage error        66  no input (missing/unreadable file)
                         70  internal error

PHI posture: the parsed model goes to stdout (the data channel you chose); every diagnostic on
stderr is value-free — codes and positions only, never a field value.
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
  const [command, ...rest] = argv;
  if (command === undefined || wantsHelp(argv)) {
    return { stdout: HELP, stderr: "", exit: EXIT.OK };
  }
  if (command === "--version" || command === "-V") {
    return { stdout: `${VERSION}\n`, stderr: "", exit: EXIT.OK };
  }

  try {
    switch (command) {
      case "parse":
        return await parseCommand(rest, deps);
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

/**
 * `cosyte completion <bash|zsh|fish>`
 *
 * Print a shell completion script for `cosyte`, generated from the command tree, to **stdout** — the
 * user pipes it into their shell (`source <(cosyte completion bash)`) or saves it to their completions
 * directory. The script is static and value-free: it names commands, subcommand tokens, and flags —
 * never any input. An unknown or missing shell is a usage error (exit `2`), never a silent no-op.
 *
 * @packageDocumentation
 */

import { CLI_CODES, CliError, errorResult } from "../core/diagnostics.js";
import { EXIT } from "../core/exit-codes.js";
import type { RunResult } from "../core/result.js";

/** The subcommands offered for completion (mirrors the dispatcher in `core/run.ts`). */
const COMMANDS = [
  "parse",
  "validate",
  "inspect",
  "fmt",
  "convert",
  "map-codes",
  "redact",
  "deid",
  "mcp",
  "completion",
] as const;

/** The common flags offered across the file-consuming commands. */
const FLAGS = [
  "--format",
  "--json",
  "--ndjson",
  "--quiet",
  "--no-color",
  "--unsafe-show-values",
  "--help",
  "--version",
] as const;

/** The shells `completion` can emit a script for. */
const SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SHELLS)[number];

/**
 * Run the `completion` command.
 *
 * @param args - The arguments after the `completion` subcommand token; the first is the shell name.
 * @returns A {@link RunResult}: the completion script on `stdout` (exit `0`), or a value-free usage
 *   error (exit `2`) when the shell is missing or unrecognised.
 * @example
 * ```ts
 * import { completionCommand } from "@cosyte/cli";
 *
 * completionCommand(["bash"]).exit; // => 0
 * completionCommand(["powershell"]).exit; // => 2
 * ```
 */
export function completionCommand(args: string[]): RunResult {
  const shell = args[0];
  if (shell === undefined) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        `missing shell; usage: cosyte completion <${SHELLS.join("|")}>`,
      ),
    );
  }
  if (!isShell(shell)) {
    return errorResult(
      new CliError(
        CLI_CODES.CLI_USAGE,
        EXIT.USAGE,
        `unknown shell '${shell}'; supported: ${SHELLS.join(", ")}`,
      ),
    );
  }
  return { stdout: SCRIPTS[shell](), stderr: "", exit: EXIT.OK };
}

/** Narrow an arbitrary string to a supported {@link Shell}. */
function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

/** The per-shell script generators. Each is static text built from {@link COMMANDS} + {@link FLAGS}. */
const SCRIPTS: Readonly<Record<Shell, () => string>> = {
  bash: () => `# cosyte bash completion — source <(cosyte completion bash)
_cosyte() {
  local cur prev cmds flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  cmds="${COMMANDS.join(" ")}"
  flags="${FLAGS.join(" ")}"
  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${cmds}" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -W "\${flags}" -f -- "\${cur}") )
  fi
}
complete -F _cosyte cosyte
`,
  zsh: () => `#compdef cosyte
# cosyte zsh completion — source <(cosyte completion zsh)
_cosyte() {
  local -a cmds flags
  cmds=(${COMMANDS.map((c) => `'${c}'`).join(" ")})
  flags=(${FLAGS.map((f) => `'${f}'`).join(" ")})
  if (( CURRENT == 2 )); then
    _describe 'command' cmds
  else
    _describe 'flag' flags
    _files
  fi
}
compdef _cosyte cosyte
`,
  fish: () => {
    const lines = COMMANDS.map(
      (c) => `complete -c cosyte -n '__fish_use_subcommand' -a '${c}' -d 'cosyte ${c}'`,
    );
    const flagLines = FLAGS.filter((f) => f.startsWith("--")).map(
      (f) => `complete -c cosyte -l '${f.slice(2)}'`,
    );
    return `# cosyte fish completion — cosyte completion fish | source
${lines.join("\n")}
${flagLines.join("\n")}
`;
  },
};

<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/cli

> The **Cosyte CLI**: a PHI-safe developer front door over the `@cosyte/*` healthcare parsers.

[![npm version](https://img.shields.io/npm/v/@cosyte/cli.svg)](https://www.npmjs.com/package/@cosyte/cli)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/cli/ci.yml?branch=main&label=CI)](https://github.com/cosyte/cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/cli/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

The Cosyte command line for Node.js and TypeScript: one command over HL7 v2, FHIR R4, X12, ASTM, NCPDP, C-CDA, DICOM, and MLLP, with HL7 v2 to FHIR conversion from transform, code mapping from terminology, and the cosyte-mcp MCP server for agents.

## Why this exists

`@cosyte/cli` is a **`bin` package**: its primary artifact is the `cosyte` command on your `PATH`. Pipe
a raw message from a hospital feed into the terminal and get typed, structured JSON back in one line,
without writing code and without reading the spec.

```bash
cat adt.hl7 | cosyte parse - --json | jq -c '{format, warnings}'
```

It is a thin, honest skin over libraries that already own correctness ([`@cosyte/hl7`](https://github.com/cosyte/hl7),
[`@cosyte/fhir`](https://github.com/cosyte/fhir), [`@cosyte/transform`](https://github.com/cosyte/transform),
[`@cosyte/terminology`](https://github.com/cosyte/terminology)): it routes, reads, and shapes output,
and owns two disciplines of its own: a documented **exit-code contract** and a **value-free
diagnostic** posture.

## Status

The 0.1 line. While the package is below 1.0, a breaking change can ship in a patch
version and is called out in the changelog. The `cosyte` command wraps **all eight
Cosyte formats** (**HL7 v2**, **FHIR R4**, **X12**, **ASTM**, **NCPDP SCRIPT and Telecom**, **C-CDA**, **DICOM**,
and **MLLP**) plus the `@cosyte/transform` and `@cosyte/terminology` higher-layer libraries, with
conservative content-format autodetection and a documented exit-code contract:

- **`parse`**: autodetect the format and print the parsed model as typed JSON on stdout. Multi-record
  inputs (an **MLLP** stream, or any input under **`--ndjson`**) stream as **NDJSON** with per-record
  isolation.
- **`validate`**: parse, then run the wrapped parser's own validation surface, with the **verdict in
  the exit code** (`0` valid · `1` invalid · `65` unparseable); findings are value-free.
- **`inspect`**: a value-free structural summary (type/classification codes + structural counts).
- **`fmt`**: canonical re-serialization through the library's spec-clean serializer; no partial emit
  on unparseable input.
- **`convert`**: HL7 v2 → FHIR R4 via `@cosyte/transform`; the converted `Bundle` on stdout, value-
  free issues on stderr, and a non-zero exit on an error-severity conversion issue.
- **`map-codes`**: translate a code through a BYO FHIR ConceptMap via `@cosyte/terminology`; the
  target coding(s) on stdout, or a value-free unmapped signal + exit `1`.
- **`redact` / `deid`**: a de-identified copy on stdout for `ccda`, `fhir`, `hl7`, `x12`, delegated
  whole to `@cosyte/deid`, with that library's value-free manifest on stderr; every other format is a
  typed refusal and it never emits a partial scrub dressed up as de-identified.
- **`completion <bash|zsh|fish>`**: print a static shell completion script.

**Support is honest per (format, operation)**: not every parser faithfully supports every command, so
the deferred cells (DICOM `parse`/`fmt`: binary model; C-CDA `parse`: XML is the canonical `fmt`
surface; MLLP `fmt`/`validate`) are a value-free `CLI_FORMAT_UNSUPPORTED`, never a fake. PHI discipline
runs throughout: value-free by default across every diagnostic, the loud opt-in `--unsafe-show-values`
as the single door to a value on a secondary surface, and never a temp file with PHI. An **MCP server**
(`cosyte-mcp`) exposes the same core to an LLM/agent as callable tools.

The CLI is **feature-complete**: an argv+stdin+MCP fuzz gate, an exit-code golden matrix, a
built-package smoke of both bins, a clean `npm publish` dry-run, and a release step that installs
the packed tarball from outside the repository and runs both bins before anything publishes. See
[RELEASING.md](https://github.com/cosyte/cli/blob/main/RELEASING.md).

## Install

```bash
npm install -g @cosyte/cli          # put `cosyte` on your PATH
```

Requires Node.js 22 or later, tested on 22, 24, and 26.

Versions `0.0.1` and `0.0.2` are on npm but cannot be installed, because of a packaging defect in
those releases. Install the 0.1 line.

Below 1.0 a break can ship in a patch release, so a caret range such as `^0.1.0` does not protect a
consumer. Pin the exact version:

```bash no-run it installs the package from npm
npm install --save-exact @cosyte/cli
```

Or without installing, using `npx`:

```bash
npx --package @cosyte/cli cosyte inspect message.hl7
```

> **`npx @cosyte/cli …` (the short form) does not work, and this is not the packaging defect above.**
> It fails with `could not determine executable to run`. When a package ships more than one
> executable, `npx` runs the one whose name matches the package name's last segment; that would be
> `cli`, and this package ships `cosyte` and `cosyte-mcp`. Naming the executable explicitly with
> `--package` is the supported form, and it works. A `cli` executable is deliberately **not** added as
> an alias: `npm install -g` would then put a command called `cli` on every user's `PATH`, which is far
> too generic a name to claim.

**Install with optional dependencies, as `npm install` does by default.** The breadth parsers,
`@cosyte/fhir`, `@cosyte/transform`, `@cosyte/deid` and the MCP SDK (`@modelcontextprotocol/sdk`) are
optional dependencies, so `npm install`, `pnpm add` and `npm install --legacy-peer-deps` all bring them
in. If a library a command needs is missing, for example after `npm install --omit=optional`, the
command reports a value-free `CLI_PARSER_UNAVAILABLE` naming the package to install and exits `69`: it
never guesses, and it never blames your input. Every other command still runs. HL7 v2 and `map-codes`
run on the two hard dependencies, `@cosyte/hl7` and `@cosyte/terminology`.

## Usage

This block runs as-is in an empty directory once the CLI is installed: it writes a short synthetic
HL7 v2 message and reads it back. Every command, flag, and exit code is documented on
[docs.cosyte.com/cli](https://docs.cosyte.com/cli).

```bash
# A synthetic ADT^A01 admit. HL7 v2 ends every segment with a carriage return (\r).
printf 'MSH|^~\\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|20240101120000||ADT^A01|MSG00001|P|2.5\rEVN|A01|20240101120000\rPID|1||MRN-000123^^^HOSP^MR||ZZSENTINELLAST^ZZSENTINELFIRST^M||19800101|M\rPV1|1|I|WARD^101^A\r' > message.hl7

cosyte parse message.hl7 --json | jq -c '{format, warnings}'   # format autodetected → HL7 v2
cosyte inspect message.hl7          # a value-free summary: type, version, segment counts
```

### `cosyte parse`

Read a file (or stdin via `-`), autodetect the format by content, and print the parsed model as typed
JSON on stdout:

```bash
cosyte parse message.hl7 > parsed.json            # → { "format": "hl7", "model": …, "warnings": [] }
cat patient.json | cosyte parse - > parsed.json   # from a pipeline
cosyte parse --json message.hl7 | jq '.model.segments | length'   # compact machine output
cosyte parse --format hl7 msg.txt > parsed.json   # override autodetection
cosyte parse stream.mllp > records.ndjson   # MLLP frames → one NDJSON record per frame
cosyte parse bulk.ndjson --ndjson > records.ndjson   # one FHIR resource per line → NDJSON records
```

Autodetection is **conservative**: a confident single match parses; ambiguity or no match is a typed
data error asking for `--format`, **never a guessed parser**. `--format` accepts `hl7 | fhir | x12 |
astm | ncpdp | ccda | dicom | mllp`.

**Streaming / multi-message.** A single message prints one JSON envelope. A multi-record input (an
**MLLP** stream, one record per frame, or any input under **`--ndjson`**, one record per non-empty
line) streams as **NDJSON**, one `{ record, format, model, warnings }` line each, with per-record
isolation: a record that fails to parse becomes a value-free `{ record, error }` line and the stream
continues; the overall exit is a data error (`65`) if any record failed. Each line is written **as
its record is parsed**, before the rest of the input has been read, so a batch pipes straight into
the next process. A single message's JSON is written in pieces as it is produced, and when the
reader falls behind, `parse` waits for it instead of holding the unread output in memory.

**Input size.** `parse` reads at most **67108864 bytes (64 MiB)** per invocation, the number
`cosyte --help` prints. A larger input is a value-free `CLI_INPUT_TOO_LARGE` refusal naming that
limit, with the data-error exit code (`65`) and never the internal-error code: split the input and
re-run. Since records are emitted as they are parsed, a refusal can land after some records have
already reached stdout; the exit code, not the output, says the run did not complete.

Support is honest **per (format, operation)**: `x12`/`astm`/`ncpdp` support all of parse/inspect/fmt/
validate; `ccda` supports inspect/fmt/validate (parse deferred); `dicom` supports inspect/validate
(parse/fmt deferred); `mllp` supports parse/inspect. A deferred cell is a value-free
`CLI_FORMAT_UNSUPPORTED`, never a fake result.

### `cosyte validate`

Parse the input and run the wrapped parser's own validation surface, with the **verdict in the exit
code**, so it drops straight into a CI gate:

```bash
cosyte validate message.hl7            # exit 0 valid · 1 invalid · 65 unparseable
cosyte validate patient.json --json    # value-free { format, valid, findings } on stdout
cosyte validate patient.json --quiet   # no output: the exit code is the whole signal
```

Findings are **value-free**: a stable code, a severity, and a positional locator (a FHIRPath, or an
HL7 segment/field index), never a field value. The verdict is the wrapped library's, never invented:
FHIR validity is `@cosyte/fhir`'s `validateResource()`; an HL7 message is valid when it parses (its
warnings are non-fatal deviations, surfaced but never failing). `--profile` is reserved: the CLI
bundles no profiles yet, so it reports an honest "unavailable" (exit `69`) rather than fake a verdict.

The load-bearing rule: a validation failure is **never exit 0**, and "unparseable" (`65`) is a distinct
signal from "parsed, but invalid" (`1`).

### `cosyte inspect`

A value-free structural summary, the "what shape is this?" answer, with no field value:

```bash
cosyte inspect message.hl7    # message type, version, per-segment counts, warning count
cosyte inspect bundle.json --json
```

### `cosyte fmt`

Canonically re-serialize through the wrapped library's spec-clean serializer (HL7 CR-separated;
FHIR canonical JSON, decimals byte-exact). Its stdout **is** the data channel; an unparseable input is
a data error with **no partial emit**:

```bash
cat messy.json | cosyte fmt - > clean.json   # → canonical FHIR JSON
cosyte fmt message.hl7 > clean.hl7           # → spec-clean HL7
```

### `cosyte convert`

Convert an **HL7 v2** message to **FHIR R4** via [`@cosyte/transform`](https://github.com/cosyte/transform).
The converted FHIR message `Bundle` is your explicit request, so it goes to **stdout**; the
conversion's value-free issues (a v2 index → FHIRPath locator + a stable code, never a field value) go
to stderr:

```bash
cosyte convert adt.hl7 --to fhir > bundle.json   # → a FHIR message Bundle
cat oru.hl7 | cosyte convert - --to fhir | jq '.entry[].resource.resourceType'
cosyte convert adt.hl7 --to fhir --json > result.json    # { format, bundle, findings }
cosyte convert adt.hl7 --to fhir --quiet > bundle.json   # bundle only; the exit code carries the outcome
```

`--to fhir` is required (the only target today). The CLI adds no mapping of its own. The FHIR is
`@cosyte/transform`'s, faithfully surfaced. The load-bearing rule mirrors `validate`: an
**error-severity** conversion issue exits **`1`**, never `0`. A non-HL7 input (e.g. a FHIR document) is
a data error (`65`), never a fake conversion. A valued field the conversion does not carry, such as
PID-29 death date and time, is reported as `TRANSFORM_ELEMENT_DROPPED` at its own location.

### `cosyte map-codes`

Translate a single code through a **bring-your-own FHIR ConceptMap** via
[`@cosyte/terminology`](https://github.com/cosyte/terminology) (`$translate`). A ConceptMap and a code
are reference data, not PHI, so the translation result is your explicit request on **stdout**:

```bash
cosyte map-codes gender.conceptmap.json \
  --system http://hl7.org/fhir/administrative-gender --code male   # → the target coding(s), exit 0
cat cm.json | cosyte map-codes - --code female --json              # compact { source, result }
```

The CLI ships no terminology content and never fabricates a target: a **match** is exit `0`; an
**unmapped** code is the value-free `TERM_TRANSLATE_UNMAPPED` signal + exit `1`; a map that is not
valid JSON or not a loadable ConceptMap is a `CLI_MAP_INVALID` data error (`65`).

## The exit-code contract

Every command is safe to branch on in CI. The exit code carries the outcome. `0` is the conventional
success status and the codes from `65` up are the values the Unix `sysexits.h` header assigns to the
conditions they name; `1` and `2` are this CLI's own values, because that header defines no constant
for either:

| Code | Meaning                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | success / **valid** (`validate`)                                                                                                                                                                             |
| `1`  | **invalid**: `validate` found a parseable-but-bad message, or `redact` could not de-identify every locus                                                                                                     |
| `2`  | usage error (unknown flag, missing argument)                                                                                                                                                                 |
| `65` | data error (unparseable input, format undetected, or input past the size limit)                                                                                                                              |
| `66` | no input (missing/unreadable file)                                                                                                                                                                           |
| `69` | unavailable (a capability is not wired for this input, e.g. `redact` on a format `@cosyte/deid` has no adapter for, or an optional library it needs, such as the MCP SDK for `cosyte-mcp`, is not installed) |
| `70` | internal error (a bug)                                                                                                                                                                                       |
| `74` | output error: the output stream closed before the CLI finished writing (a consumer that exited early)                                                                                                        |

The load-bearing rule: the CLI **never prints a reassuring line and exits `0`** on input it could not
handle, on an invalid message, or on output that never reached its consumer.

### A consumer that goes away

Piping into a reader that stops early is ordinary shell usage (a pager you quit, a `head` that has
seen enough), and it is not an error in your input:

```bash
cosyte parse bulk.ndjson --ndjson | head -3 | wc -l   # three lines, then exit 74, and a value-free note
```

The CLI terminates quietly under `74`: no stack trace, no platform error text, and no byte of the
input on stderr, just the stable `CLI_OUTPUT_WRITE_FAILED` code. Exit `74` is deliberately not the
internal-error code: nothing went wrong inside the CLI, the answer simply did not reach you. The
same holds when the whole result is one write, so a run whose output never arrived is never
reported as a success.

## PHI posture

A CLI operates on real files a developer points at. So the channels are split: **stdout is the data
channel** (`parse` prints the parsed model there because that is your explicit request) while **every
diagnostic on stderr is value-free** (a stable code, a position, a file path, never a name, DOB, MRN,
or field value). The CLI writes no temp files and logs to no file.

### `--unsafe-show-values`

Value-free-by-default is the whole point, but when you are debugging a rejected message locally, you
sometimes need to see the bytes. `--unsafe-show-values` is the **single, loud, opt-in door**: with it
set, a `CLI_PARSE_FAILED` diagnostic appends a bounded excerpt of the offending input. It is off by
default, it is **PHI-exposing** (the name carries the warning), and it is the _only_ configuration
under which a value can reach a secondary surface. A successful parse still puts values only on
stdout, never on stderr.

```bash
cosyte parse broken.hl7 --format hl7                       # value-free: a code + position only
cosyte parse broken.hl7 --format hl7 --unsafe-show-values 2> excerpt.txt  # excerpt.txt holds a bounded input excerpt (PHI!)
```

## `cosyte redact` / `cosyte deid`

De-identification is the one operation whose _job_ is to strip identifiers, and the CLI **owns none of
the policy**. It belongs to [`@cosyte/deid`](https://github.com/cosyte/deid): the CLI locates nothing,
transforms nothing, and has no fallback scrub, because a built-in "minimal Safe-Harbor" pass over only
the obvious fields would leave PHI behind and _look_ de-identified while silently under-redacting, the
exact false-safety hazard `redact` exists to avoid.

```bash
cosyte redact adt.hl7 > clean.hl7   # stdout: the de-identified message. stderr: what was touched
echo $?                             # 0: clean.hl7 is the copy. 1: clean.hl7 is empty, see stderr
```

**Covered formats: `ccda`, `fhir`, `hl7`, `x12`** (what the library covers and this CLI can serialize
onto a text stdout). Anything else emits nothing at all:

| Outcome                                                                              | Diagnostic               | Exit |
| ------------------------------------------------------------------------------------ | ------------------------ | ---- |
| every locus handled                                                                  | the manifest             | `0`  |
| a locus the library reports it could not handle                                      | `CLI_DEID_INCOMPLETE`    | `1`  |
| `astm`, `mllp`, `ncpdp`: no adapter in that library                                  | `CLI_NOT_IMPLEMENTED`    | `69` |
| `dicom`: covered there, but its de-identified form is binary and this stdout is text | `CLI_FORMAT_UNSUPPORTED` | `65` |
| `@cosyte/deid` not installed (an optional dependency)                                | `CLI_PARSER_UNAVAILABLE` | `69` |

stderr carries the library's **own value-free manifest** (category, transform, the structural path,
count, disposition, and its stable code) and the library's **own published label and version**: the CLI
asserts no de-identification standard of its own. An absent library is decided **before your input is
read**.

What the library's default policy does decides which of the first two rows you get, and the CLI
passes it no policy of its own:

- **Medical record, account, and member numbers are removed**, not replaced by a surrogate: their
  manifest lines read `removed DEID_CATEGORY_REMOVED`.
- **A visit number or an order number is blocked, so the whole run is refused.** An HL7 visit number
  (`PV1-19`), and a placer or filler order number (`ORC-2`/`ORC-3`, `OBR-2`/`OBR-3`), fall to the
  library's catch-all identifier category, which its default policy blocks rather than removes. Such a
  message exits with `CLI_DEID_INCOMPLETE` (exit `1`) and nothing on stdout, and stderr names each
  blocked locus with the library's `DEID_LOCUS_BLOCKED` code. Many real ADT messages carry `PV1-19`,
  so check the exit code before you use `clean.hl7`.
- **X12: a value the library cannot place is blocked, so the whole run is refused.** The library
  decides every X12 element it outputs. A code it does not recognise at a code position (`NM1*il*`
  rather than `NM1*IL*`), a value of the wrong shape at a code, date or amount position, a value at a
  position no rule names (`REF-03` and later, `NM1-10` and later), free text such as an 834 `HD-04`
  plan coverage description, a segment it has no shape for (such as `PLB`), and a segment outside
  every transaction set are each blocked. The run exits with `CLI_DEID_INCOMPLETE` (exit `1`) and
  nothing on stdout. Correct or remove the value before you redact, or call `@cosyte/deid` from code
  with a policy of your own. The full list is in the
  [`@cosyte/deid` changelog](https://github.com/cosyte/deid/blob/main/CHANGELOG.md).

The CLI still keys every run with a **per-invocation ephemeral key** and says so on stderr: any
identifier surrogate is consistent within one output and deliberately not stable across runs.

## `cosyte completion`

Print a shell completion script generated from the command tree, and source it:

```bash
source <(cosyte completion bash)     # bash
source <(cosyte completion zsh)      # zsh
cosyte completion fish | source      # fish
```

## The MCP server (agent front door)

The same `core` is exposed to an **LLM/agent** as a [Model Context Protocol](https://modelcontextprotocol.io)
server: the second adapter over one codebase (the terminal is the first). It is a **local stdio
subprocess**, not a hosted endpoint. Register it in an MCP client's config:

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "--package", "@cosyte/cli", "cosyte-mcp"] }
  }
}
```

> **`--package` is required, and the shorter `["-y", "@cosyte/cli", "mcp"]` does not work**: it fails
> with `could not determine executable to run`, for the `npx` executable-selection reason described
> under [Run it](#run-it) above.

`cosyte mcp` and the standalone `cosyte-mcp` bin both start the stdio server. It exposes four tools
(`parse`, `validate`, `inspect`, `convert`), each calling the same command the terminal runs, so the CLI
and the agent get identical results. The PHI posture is inherited and hardened: there is **no
`--unsafe-show-values` door on the agent surface**, a tool _result_ carries the requested data, and a
tool _error_ carries only value-free diagnostics (a stable code + position, never an input value). A
parsed-but-invalid `validate` is a **successful** call reporting the verdict, not a tool error.

**Every tool publishes an `outputSchema`**, so a client validates a result against a declared contract
rather than pattern-matching prose. Each result carries `ok`, a `status` of `success` / `verdict` /
`failed`, the `exit` code, a stable `code` on a failure, and the tool's own payload under `data`; the
text content block carries the serialized JSON of that same structured result. See the docs for the
per-tool payload shapes.

The MCP SDK (`@modelcontextprotocol/sdk`) is the CLI's only third-party runtime dependency; it is
declared **optional**. The programmatic core (the `.` subpath) and every `cosyte` command other than
`cosyte mcp` run with the SDK absent; `cosyte-mcp` and `cosyte mcp` then exit `69` with
`CLI_PARSER_UNAVAILABLE`, naming the package to install. The server surface is importable via the
`@cosyte/cli/mcp` subpath (`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`), which
needs the SDK installed.

## Programmatic API

The same `core` is importable (the `.` subpath): `detectFormat`, the `EXIT` map (now including
`EXIT.INVALID`), the `CLI_CODES` diagnostic registry, `resolveInput`, `run`, and each command
(`parseCommand`, `validateCommand`, `inspectCommand`, `fmtCommand`, `convertCommand`, `mapCodesCommand`,
`redactCommand`, plus `convertOutcome` for the conversion verdict). The **`./mcp` subpath** exports the
agent adapter (`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`). See the docs for the
full surface.

## Documentation

The full documentation is on [docs.cosyte.com/cli](https://docs.cosyte.com/cli):

- [Installation](https://docs.cosyte.com/cli/installation), the [quickstart](https://docs.cosyte.com/cli/quickstart), and
  a tutorial: [check a folder of messages in CI](https://docs.cosyte.com/cli/check-messages-in-ci).
- How-to guides: [parse in a pipeline](https://docs.cosyte.com/cli/parse-messages-in-a-pipeline),
  [branch on the exit code](https://docs.cosyte.com/cli/branch-on-exit-codes),
  [convert HL7 v2 to FHIR](https://docs.cosyte.com/cli/convert-hl7-to-fhir),
  [de-identify a message](https://docs.cosyte.com/cli/de-identify-a-message), and
  [connect an agent](https://docs.cosyte.com/cli/mcp).
- Explanation: [how the CLI works](https://docs.cosyte.com/cli/concepts-archetype).
- Reference: [the limitations](https://docs.cosyte.com/cli/limitations), [every command](https://docs.cosyte.com/cli/reference-commands),
  [diagnostic codes](https://docs.cosyte.com/cli/diagnostic-codes),
  [format support](https://docs.cosyte.com/cli/format-support), and the
  [MCP tools](https://docs.cosyte.com/cli/mcp-tools).
- [Troubleshooting](https://docs.cosyte.com/cli/troubleshooting), [testing and quality](https://docs.cosyte.com/cli/testing-and-quality),
  and [performance](https://docs.cosyte.com/cli/performance).
- [`CHANGELOG.md`](https://github.com/cosyte/cli/blob/main/CHANGELOG.md): every release.

## Support

Questions, bug reports, and messages a command handled wrongly go in
[GitHub issues](https://github.com/cosyte/cli/issues). Use synthetic data only, never a real
patient's: reduce a message to a synthetic one that reproduces the problem, and include the command,
the exit code, and the diagnostic codes you got back. Need an integration built, or hosted and
run for you? See our [integration services](https://cosyte.com/integration-services).

## Security

Report a vulnerability privately, never in a public issue, and with no real patient data in it. Our
[security policy](https://github.com/cosyte/cli/security/policy) says how. An input value that
reaches a diagnostic, a log, or an MCP error result without `--unsafe-show-values` is a
vulnerability: report it that way.

## Contributing

**Where to ask:** open an issue at
[https://github.com/cosyte/cli/issues](https://github.com/cosyte/cli/issues).

**Unsolicited pull requests are accepted.** For anything that changes a command, a flag, an exit
code, or a `CLI_*` code, open an issue first so the behavior can be agreed before you write it:
those are the stable surface scripts branch on, and a change to one updates this README and the
docs in the same pull request. Typo, link, and test fixes can go straight to a pull request.

**What a contribution has to clear**, every one of them a script this package declares:

| check                         | what it is                                         |
| ----------------------------- | -------------------------------------------------- |
| `pnpm typecheck`              | `tsc --noEmit`, strict                             |
| `pnpm lint`                   | ESLint, at `--max-warnings=0`                      |
| `pnpm format:check`           | Prettier                                           |
| `pnpm phi-scan`               | no patient-shaped value anywhere in a tracked file |
| `pnpm test`                   | Vitest, including the exit-code golden matrix      |
| `pnpm test:coverage`          | the coverage gate                                  |
| `pnpm build`                  | the dual ESM and CJS bundle and both executables   |
| `pnpm attw`                   | per-condition type resolution for consumers        |
| `pnpm smoke`                  | both executables run from the built package        |
| `pnpm examples`               | the runnable examples, against the built package   |
| `pnpm check:no-emdash`        | the house punctuation rule                         |
| `pnpm check:no-internal-refs` | no internal bookkeeping on the public surface      |

New behavior needs a test beside it, and a change a consumer would notice needs a changeset
(`pnpm changeset`), whose summary becomes the changelog entry.

## License

MIT, copyright Cosyte LLC. See [LICENSE](https://github.com/cosyte/cli/blob/main/LICENSE). The
standards this package names belong to their owners; see
[TRADEMARKS.md](https://github.com/cosyte/cli/blob/main/TRADEMARKS.md).

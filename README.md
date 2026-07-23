# @cosyte/cli

> The **cosyte CLI** — a PHI-safe developer front door over the `@cosyte/*` healthcare parsers.

`@cosyte/cli` is a **`bin` package**: its primary artifact is the `cosyte` command on your `PATH`. Pipe
a raw message from a hospital feed into the terminal and get typed, structured JSON back in one line —
without writing code, without reading the spec, and **without ever being handed a confident wrong value
or a silent success on a malformed message**.

```bash
cat adt.hl7 | cosyte parse -
```

It is a thin, honest skin over libraries that already own correctness ([`@cosyte/hl7`](https://github.com/cosyte/hl7),
[`@cosyte/fhir`](https://github.com/cosyte/fhir), [`@cosyte/transform`](https://github.com/cosyte/transform),
[`@cosyte/terminology`](https://github.com/cosyte/terminology)): it routes, reads, and shapes output,
and owns two disciplines of its own — a documented **exit-code contract** and a **value-free
diagnostic** posture.

> **Status:** pre-alpha (`0.0.x`), **not yet published to npm**. The `cosyte` command wraps **all eight
> cosyte formats** (**HL7 v2**, **FHIR R4**, **X12**, **ASTM**, **NCPDP SCRIPT**, **C-CDA**, **DICOM**,
> and **MLLP**) plus the `@cosyte/transform` and `@cosyte/terminology` higher-layer libraries, with
> conservative content-format autodetection and a documented exit-code contract:
>
> - **`parse`** — autodetect the format and print the parsed model as typed JSON on stdout. Multi-record
>   inputs (an **MLLP** stream, or any input under **`--ndjson`**) stream as **NDJSON** with per-record
>   isolation.
> - **`validate`** — parse, then run the wrapped parser's own validation surface, with the **verdict in
>   the exit code** (`0` valid · `1` invalid · `65` unparseable); findings are value-free.
> - **`inspect`** — a value-free structural summary (type/classification codes + structural counts).
> - **`fmt`** — canonical re-serialization through the library's spec-clean serializer; no partial emit
>   on unparseable input.
> - **`convert`** — HL7 v2 → FHIR R4 via `@cosyte/transform`; the converted `Bundle` on stdout, value-
>   free issues on stderr, and a non-zero exit on an error-severity conversion issue.
> - **`map-codes`** — translate a code through a BYO FHIR ConceptMap via `@cosyte/terminology`; the
>   target coding(s) on stdout, or a value-free unmapped signal + exit `1`.
> - **`redact` / `deid`** — gated to an honest `CLI_NOT_IMPLEMENTED` (exit `69`) until `@cosyte/deid`
>   ships; it never reads the input and never emits a partial scrub dressed up as de-identified.
> - **`completion <bash|zsh|fish>`** — print a static shell completion script.
>
> **Support is honest per (format, operation)** — not every parser faithfully supports every command, so
> the deferred cells (DICOM `parse`/`fmt` — binary model; C-CDA `parse` — XML is the canonical `fmt`
> surface; MLLP `fmt`/`validate`) are a value-free `CLI_FORMAT_UNSUPPORTED`, never a fake. PHI discipline
> runs throughout: value-free by default across every diagnostic, the loud opt-in `--unsafe-show-values`
> as the single door to a value on a secondary surface, and never a temp file with PHI. An **MCP server**
> (`cosyte-mcp`) exposes the same core to an LLM/agent as callable tools.

## Run it

> Not on npm yet. The commands below are how you'll install and run it **once it's published** —
> until then, run it from a local checkout (`pnpm build`, then invoke `dist/bin/cosyte.mjs`).

```bash
npx @cosyte/cli parse message.hl7   # no install; format autodetected → HL7 v2
npm install -g @cosyte/cli          # or put `cosyte` on your PATH
cosyte --help
```

## `cosyte parse`

Read a file (or stdin via `-`), autodetect the format by content, and print the parsed model as typed
JSON on stdout:

```bash
cosyte parse message.hl7            # → { "format": "hl7", "model": …, "warnings": [] }
cat patient.json | cosyte parse -   # from a pipeline
cosyte parse --json message.hl7 | jq '.model'   # compact machine output
cosyte parse --format hl7 msg.txt   # override autodetection
cosyte parse stream.mllp             # MLLP frames → one NDJSON record per frame
cosyte parse bulk.ndjson --ndjson    # one FHIR resource per line → NDJSON records
```

Autodetection is **conservative**: a confident single match parses; ambiguity or no match is a typed
data error asking for `--format` — **never a guessed parser**. `--format` accepts `hl7 | fhir | x12 |
astm | ncpdp | ccda | dicom | mllp`.

**Streaming / multi-message.** A single message prints one JSON envelope. A multi-record input — an
**MLLP** stream (one record per frame) or any input under **`--ndjson`** (one record per non-empty
line) — streams as **NDJSON**, one `{ record, format, model, warnings }` line each, with per-record
isolation: a record that fails to parse becomes a value-free `{ record, error }` line and the stream
continues; the overall exit is a data error (`65`) if any record failed.

Support is honest **per (format, operation)**: `x12`/`astm`/`ncpdp` support all of parse/inspect/fmt/
validate; `ccda` supports inspect/fmt/validate (parse deferred); `dicom` supports inspect/validate
(parse/fmt deferred); `mllp` supports parse/inspect. A deferred cell is a value-free
`CLI_FORMAT_UNSUPPORTED`, never a fake result.

## `cosyte validate`

Parse the input and run the wrapped parser's own validation surface, with the **verdict in the exit
code** — so it drops straight into a CI gate:

```bash
cosyte validate message.hl7            # exit 0 valid · 1 invalid · 65 unparseable
cosyte validate patient.json --json    # value-free { format, valid, findings } on stdout
cosyte validate patient.json --quiet   # no output — the exit code is the whole signal
```

Findings are **value-free**: a stable code, a severity, and a positional locator (a FHIRPath, or an
HL7 segment/field index) — never a field value. The verdict is the wrapped library's, never invented:
FHIR validity is `@cosyte/fhir`'s `validateResource()`; an HL7 message is valid when it parses (its
warnings are non-fatal deviations, surfaced but never failing). `--profile` is reserved — the CLI
bundles no profiles yet, so it reports an honest "unavailable" (exit `69`) rather than fake a verdict.

The load-bearing rule: a validation failure is **never exit 0**, and "unparseable" (`65`) is a distinct
signal from "parsed, but invalid" (`1`).

## `cosyte inspect`

A value-free structural summary — the "what shape is this?" answer, with no field value:

```bash
cosyte inspect message.hl7    # message type, version, per-segment counts, warning count
cosyte inspect bundle.json --json
```

## `cosyte fmt`

Canonically re-serialize through the wrapped library's spec-clean serializer (HL7 CR-separated;
FHIR canonical JSON, decimals byte-exact). Its stdout **is** the data channel; an unparseable input is
a data error with **no partial emit**:

```bash
cat messy.json | cosyte fmt -   # → canonical FHIR JSON on stdout
cosyte fmt message.hl7          # → spec-clean HL7
```

## `cosyte convert`

Convert an **HL7 v2** message to **FHIR R4** via [`@cosyte/transform`](https://github.com/cosyte/transform).
The converted FHIR message `Bundle` is your explicit request, so it goes to **stdout**; the
conversion's value-free issues (a v2 index → FHIRPath locator + a stable code, never a field value) go
to stderr:

```bash
cosyte convert adt.hl7 --to fhir            # → a FHIR message Bundle on stdout
cat oru.hl7 | cosyte convert - --to fhir | jq '.entry[].resource.resourceType'
cosyte convert adt.hl7 --to fhir --json     # { format, bundle, findings } on stdout
cosyte convert adt.hl7 --to fhir --quiet    # bundle only; the exit code carries the outcome
```

`--to fhir` is required (the only target today). The CLI adds no mapping of its own — the FHIR is
`@cosyte/transform`'s, faithfully surfaced. The load-bearing rule mirrors `validate`: an
**error-severity** conversion issue exits **`1`**, never `0`. A non-HL7 input (e.g. a FHIR document) is
a data error (`65`), never a fake conversion.

## `cosyte map-codes`

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

Every command is safe to branch on in CI — the exit code carries the outcome (`sysexits.h`):

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| `0`  | success / **valid** (`validate`)                           |
| `1`  | **invalid** — `validate` found a parseable-but-bad message |
| `2`  | usage error (unknown flag, missing argument)               |
| `65` | data error (unparseable input, or format undetected)       |
| `66` | no input (missing/unreadable file)                         |
| `69` | unavailable (a capability is not yet built, e.g. `redact`) |
| `70` | internal error (a bug)                                     |

The load-bearing rule: the CLI **never prints a reassuring line and exits `0`** on input it could not
handle, or on an invalid message.

## PHI posture

A CLI operates on real files a developer points at. So the channels are split: **stdout is the data
channel** — `parse` prints the parsed model there because that is your explicit request — while **every
diagnostic on stderr is value-free** (a stable code, a position, a file path — never a name, DOB, MRN,
or field value). The CLI writes no temp files and logs to no file.

### `--unsafe-show-values`

Value-free-by-default is the whole point — but when you are debugging a rejected message locally, you
sometimes need to see the bytes. `--unsafe-show-values` is the **single, loud, opt-in door**: with it
set, a `CLI_PARSE_FAILED` diagnostic appends a bounded excerpt of the offending input. It is off by
default, it is **PHI-exposing** (the name carries the warning), and it is the _only_ configuration
under which a value can reach a secondary surface — a successful parse still puts values only on
stdout, never on stderr.

```bash
cosyte parse broken.hl7 --format hl7                       # value-free: a code + position only
cosyte parse broken.hl7 --format hl7 --unsafe-show-values  # appends a bounded input excerpt (PHI!)
```

## `cosyte redact` / `cosyte deid`

De-identification is the one operation whose _job_ is to strip PHI. It is **not implemented yet, on
purpose.** It belongs to [`@cosyte/deid`](https://github.com/cosyte/deid), which is not published, and
the wrapped parsers expose no de-identification API. A built-in "minimal Safe-Harbor" pass over only
the obvious fields would leave PHI behind and _look_ de-identified while silently under-redacting — the
exact false-safety hazard `redact` exists to avoid. So `cosyte redact <file>` is an honest, typed
`CLI_NOT_IMPLEMENTED` (exit `69`, `EX_UNAVAILABLE`) that **never reads your input** and **never emits a
partial scrub dressed up as safe** — it will produce a real de-identified copy once `@cosyte/deid`
ships and is vetted.

## `cosyte completion`

Print a shell completion script generated from the command tree, and source it:

```bash
source <(cosyte completion bash)     # bash
source <(cosyte completion zsh)      # zsh
cosyte completion fish | source      # fish
```

## The MCP server (agent front door)

The same `core` is exposed to an **LLM/agent** as a [Model Context Protocol](https://modelcontextprotocol.io)
server — the second adapter over one codebase (the terminal is the first). It is a **local stdio
subprocess**, not a hosted endpoint. Register it in an MCP client's config:

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "@cosyte/cli", "mcp"] }
  }
}
```

`cosyte mcp` and the standalone `cosyte-mcp` bin both start the stdio server. It exposes four tools —
`parse`, `validate`, `inspect`, `convert` — each calling the same command the terminal runs, so the CLI
and the agent get identical results. The PHI posture is inherited and hardened: there is **no
`--unsafe-show-values` door on the agent surface**, a tool _result_ carries the requested data, and a
tool _error_ carries only value-free diagnostics (a stable code + position, never an input value). A
parsed-but-invalid `validate` is a **successful** call reporting the verdict, not a tool error.

The MCP SDK (`@modelcontextprotocol/sdk`) is the CLI's only third-party runtime dependency; it is
declared **optional** and loaded only on the MCP path, so a `cosyte parse` invocation never pulls it and
the core works with the SDK absent. The server surface is importable via the `@cosyte/cli/mcp` subpath
(`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`).

## Programmatic API

The same `core` is importable (the `.` subpath): `detectFormat`, the `EXIT` map (now including
`EXIT.INVALID`), the `CLI_CODES` diagnostic registry, `resolveInput`, `run`, and each command
(`parseCommand`, `validateCommand`, `inspectCommand`, `fmtCommand`, `convertCommand`, `mapCodesCommand`,
`redactCommand`, plus `convertOutcome` for the conversion verdict). The **`./mcp` subpath** exports the
agent adapter (`createMcpServer`, `startStdioServer`, `dispatchTool`, `TOOL_DEFS`). See the docs for the
full surface.

## License

MIT © Cosyte

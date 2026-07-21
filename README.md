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
[`@cosyte/fhir`](https://github.com/cosyte/fhir)): it routes, reads, and shapes output, and owns two
disciplines of its own — a documented **exit-code contract** and a **value-free diagnostic** posture.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. **Phase 1** ships `parse` for **HL7 v2**
> and **FHIR R4**, content format autodetection, and the exit-code contract; **Phase 2** hardens the
> PHI posture (value-free by default across every diagnostic, the loud opt-in `--unsafe-show-values`,
> never a temp file with PHI) and adds `redact`/`deid` as an honest, gated stub (see below). `validate`
> / `convert` / `inspect`, the MCP server, and the remaining formats land in later phases.

## Run it

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
```

Autodetection is **conservative**: a confident single match parses; ambiguity or no match is a typed
data error asking for `--format` — **never a guessed parser**.

## The exit-code contract

`cosyte parse` is safe to branch on in CI — the exit code carries the outcome (`sysexits.h`):

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| `0`  | success                                              |
| `2`  | usage error (unknown flag, missing argument)         |
| `65` | data error (unparseable input, or format undetected) |
| `66` | no input (missing/unreadable file)                   |
| `70` | internal error (a bug)                               |

The load-bearing rule: the CLI **never prints a reassuring line and exits `0`** on input it could not
handle.

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

## Programmatic API

The same `core` is importable (the `.` subpath): `detectFormat`, the `EXIT` map, the `CLI_CODES`
diagnostic registry, and `run`. See the docs for the full surface.

## License

MIT © Cosyte

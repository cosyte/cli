---
id: limitations
title: What it does — and does not do
sidebar_position: 2
---

# What `@cosyte/cli` does — and does not do

The `cosyte` CLI touches **real files a developer points at** — the moment cosyte code meets
un-synthetic PHI on a real disk. So this page is deliberately blunt about the promise and its edges.
Read it before you rely on the tool — the **API Reference** and `cosyte --help` are always the exact
truth of what a given release ships; this page is the honest shape of the whole.

## The promise (narrow, on purpose)

`@cosyte/cli` is a **thin, PHI-safe, correct-exit-code terminal-and-agent front door over libraries
that already own correctness** — and **never a mis-routed parse, a green exit on an invalid message,
or a leaked value in a diagnostic.**

- **It wraps; it does not re-implement.** Every wire-format guarantee is the wrapped `@cosyte/*`
  library's, graded by _its_ own conformance gate. The CLI owns only routing, I/O, output shaping, the
  exit-code contract, and the value-free PHI posture. A bug in a parsed _value_ is the library's; a
  mis-route, a wrong exit code, or a leaked value is the CLI's.
- **Fail-safe routing.** Autodetection sniffs content, not the file extension. A confident single
  match parses; an ambiguous or unrecognised input is a typed data error (exit `65`) asking for
  `--format` — **never a guessed parser** and never a confident wrong parse.
- **The exit code is a designed surface.** `0` success / valid · `1` invalid verdict · `2` usage ·
  `65` data error · `66` no input · `69` unavailable · `70` internal. The load-bearing rule: the CLI
  **never prints a reassuring line and exits `0` on input it could not handle.** A `validate` failure
  is exit `1`, never `0` — that is the property the CI use case rests on.
- **Value-free by default.** `parse`/`convert`/`fmt` emit the requested data to **stdout** (the sink
  you chose — that is the tool doing its job). **Every other surface** — stderr, warnings, errors,
  `inspect`'s summary — carries only positional context (a segment/field index, a code, a file path),
  **never** a name, DOB, MRN, or result value. `--unsafe-show-values` is the single, loud, opt-in door
  to a value in a failure diagnostic.

## What it does **not** do

These are **non-goals**, not missing features — named so nothing over-trusts the tool.

- **Not an integration engine.** No channels, listeners, routing, scheduling, or running state — that
  is **`pathways`**. The CLI runs one operation on one input and exits. (The MCP server is a long-lived
  stdio subprocess, but it is **stateless per call** — a request/response tool host, not an
  integration.)
- **No GUI and no web playground.** Terminal + local stdio MCP only. An online
  inspector/validator/de-id is a separate, later, differently-stacked concern with its own hosted-PHI
  threat model.
- **No data storage, no persistence, no PHI cache.** The CLI reads the file you point at, operates in
  memory, writes the output you asked for, and exits. It **never writes a temp file** and **never logs
  to a file**. No telemetry, no crash-report upload.
- **No hosted network service.** The MCP server is a **local subprocess over stdio**, implicitly
  trusted by the user who launched it — not a remote HTTP endpoint accepting untrusted PHI. A
  remote/Streamable-HTTP MCP deployment is a future, separately-security-reviewed concern.
- **No capability its ground layer lacks — and never a faked one.** Where a wrapped library is not yet
  built, the command is **unavailable** (a distinct, value-free exit `69`), never stubbed to a fake
  success:
  - **`redact` / `deid`** is gated on `@cosyte/deid` (not yet shipped) — an honest
    `CLI_NOT_IMPLEMENTED`. The CLI ships **no** built-in partial scrub that could give a false sense of
    safety.
  - **`validate --profile`** is reserved but gated (`CLI_NOT_IMPLEMENTED`) until the CLI can load a
    profile; **no profiles are bundled**.
  - **`convert`** covers **HL7 v2 → FHIR R4** only (via `@cosyte/transform`); **`map-codes`** requires
    a **bring-your-own** FHIR ConceptMap (via `@cosyte/terminology`) — no terminology content is
    bundled.
- **Per-(format, operation) support is honest, not uniform.** All eight cosyte formats are wired, but
  a parser only advertises the operations it can actually back. An unsupported (format, op) is a
  value-free `CLI_FORMAT_UNSUPPORTED`, never a fake:

  | Format                 | parse                         | inspect | fmt     | validate |
  | ---------------------- | ----------------------------- | ------- | ------- | -------- |
  | `hl7`, `fhir`          | ✓                             | ✓       | ✓       | ✓        |
  | `x12`, `astm`, `ncpdp` | ✓                             | ✓       | ✓       | ✓        |
  | `ccda`                 | — (XML is the canonical form) | ✓       | ✓ (XML) | ✓        |
  | `dicom`                | — (binary model)              | ✓       | —       | ✓        |
  | `mllp`                 | ✓ (de-framed to HL7)          | ✓       | —       | —        |

- **No clinical interpretation, no unit conversion, no terminology content.** The CLI inherits these
  non-goals from the libraries it wraps. It never decides criticality, rescales a magnitude, or bundles
  SNOMED/LOINC/CPT.

## The agent surface (MCP)

The `cosyte-mcp` server exposes `parse`/`validate`/`inspect`/`convert` as agent-callable tools over the
**same core** the terminal drives — so `cosyte parse` and the MCP `parse` tool agree by construction.
It runs **value-free with no `--unsafe-show-values` door**: a tool _result_ carries the requested data,
a tool _error_ carries only the value-free diagnostic, and a parsed-but-invalid `validate` verdict is a
**successful** call reporting the verdict. `redact` and `map-codes` are deliberately **not** exposed as
tools yet.

## HIPAA posture

`@cosyte/cli` is **HIPAA-capable, not HIPAA-compliant** — compliance is a property of a system, not a
tool. Fixtures are **synthetic-only** (`# synthetic` enforced); diagnostics carry **positional context
only, never a value**; and a format-specific PHI scanner gates every change, including the golden
stdout/stderr snapshots (the highest-risk artifact). The one deliberate value channel is **stdout** on
`parse`/`convert`/`fmt` — the data you explicitly asked for, sent to the sink you chose. Never pipe
that channel somewhere you would not put PHI.

---
"@cosyte/cli": patch
---

Phase 6 (CLI-6): **six more formats + streaming + shell completion** (ADR 0025). The `cosyte` CLI now
wraps all eight cosyte formats, wired through a single lazy **per-format adapter registry**
(`core/parsers.ts`) that replaces the old `hl7 ? : fhir` command branches and makes support **per
(format, operation)** — an unsupported (format, op) is a value-free `CLI_FORMAT_UNSUPPORTED`, never a
fake.

- **New formats & their honest capabilities:** `x12`, `astm`, `ncpdp` (SCRIPT) → `parse` + `inspect` +
  `fmt` + `validate`; `ccda` → `inspect` + `fmt` (XML) + `validate` (no library-blessed JSON model, so
  `parse` is deferred); `dicom` → `inspect` + `validate` (binary model, so `parse`/`fmt` are deferred);
  `mllp` → `parse` + `inspect` (a transport container de-framed to its enclosed HL7 message(s)).
  Content autodetection now covers all eight; `--format` accepts `mllp`.
- **Streaming / multi-message:** `parse` emits **NDJSON** with per-record isolation for inherently
  multi-record inputs — an **MLLP** stream (one record per frame) and any input under the new
  **`--ndjson`** flag (one record per non-empty line; the FHIR bulk-data convention). A failed record
  becomes a value-free `{ record, error }` line and the stream continues; the overall exit is a data
  error (`65`) if any record failed. A single message is unchanged (one pretty/`--json` envelope).
- **Shell completion:** `cosyte completion <bash|zsh|fish>` prints a static, value-free completion
  script generated from the command tree.
- **Dependencies:** the six breadth parsers are **`optionalDependencies`** (vendored tarballs),
  lazy-loaded per format and outside the hard-runtime-dep closure — so the umbrella `verify-policy`
  `cli` cap stays **4** (ADR 0025, mirroring the MCP SDK isolation of ADR 0024). An absent optional
  parser degrades to a value-free `CLI_PARSER_UNAVAILABLE` (exit `69`), never a crash.
- **New diagnostic:** `CLI_PARSER_UNAVAILABLE` (exit `69`). Exit-code contract unchanged
  (`0/1/2/65/66/69/70`).
- Pinned sibling commits: dicom `d1ed590`, x12 `0c60606`, ccda `3753216`, ncpdp `184eecc`, mllp
  `aecff75`, astm `92ac210`.

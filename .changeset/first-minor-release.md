---
"@cosyte/cli": minor
---

**This is 0.1.0, the first release of `@cosyte/cli` whose commands, output and exit codes we treat as settled.**

What is covered, and what you can build against:

- The `cosyte` command over all eight cosyte formats (HL7 v2, FHIR R4, X12, ASTM, NCPDP SCRIPT,
  C-CDA, DICOM, MLLP): `parse` (the format detected from the content, typed JSON on stdout, NDJSON
  for multi-record input), `validate` (the verdict in the exit code), `inspect` (a value-free
  summary), `fmt`, `convert` (HL7 v2 to FHIR R4), `map-codes` (through a ConceptMap you supply),
  `redact` / `deid` (for `ccda`, `fhir`, `hl7` and `x12`) and `completion`.
- The exit-code contract: `0` success or valid, `1` invalid, `2` usage, `65` data error, `66` no
  input, `69` unavailable, `70` internal error, `74` output closed early. The CLI never exits `0`
  on input it could not handle.
- Value-free diagnostics: every stderr line is a code and a location, never a value from your
  input, with `--unsafe-show-values` as the one loud opt-in.
- The `cosyte-mcp` stdio server, which exposes the same core to an agent as tools, and the
  programmatic `core` API through the package's `.` and `./mcp` exports.

What the version promises. Command names, flags, the JSON output shapes, the exit codes and the
diagnostic codes are the surface we keep stable. While the package is below 1.0, a breaking change
bumps the minor version (0.1 to 0.2) and is called out in the changelog; a fix that changes no
output ships as a patch.

What is not covered yet. DICOM `parse` and `fmt`, C-CDA `parse`, and MLLP `fmt` and `validate` are
deferred and report `CLI_FORMAT_UNSUPPORTED`; `validate --profile` is reserved and reports
`CLI_NOT_IMPLEMENTED`. `redact` refuses `astm`, `dicom`, `mllp` and `ncpdp`. The MCP server runs
over stdio only and has no `redact` or `map-codes` tool. The FHIR commands and `convert` use
`@cosyte/fhir`, which npm installs as the peer of the optional `@cosyte/transform`; without it they
report `CLI_PARSER_UNAVAILABLE` and exit `69`. The short `npx @cosyte/cli` form does not work: use
`npx --package @cosyte/cli cosyte`.

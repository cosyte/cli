# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`pnpm phi-scan`, the shared scanner `cosyte-phi-scan` from
`@cosyte/script-utils`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains a `### <path>` subsection referencing the same
path. The committed log is intentionally annoying: it discourages bypass and
creates an audit trail. Prefer extending `scripts/phi-allow-list.txt` (a
token-level, reviewed declaration) over a whole-file bypass, which silences
_every_ check for that file.

> **The scan is the cross-cutting floor ONLY**: dashed SSN shapes and emails at
> undeclared domains, over the whole repository. This package parses no wire
> format itself, so it carries no field-level detectors of its own; the sibling
> parsers (`hl7` / `dicom` / `x12` / `ccda` / `ncpdp`) run theirs.

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)

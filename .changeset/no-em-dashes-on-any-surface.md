---
"@cosyte/cli": patch
---

Correct the documented support matrix, where three cells said nothing instead of saying "not
supported", and rewrite every user-visible text surface so none of them uses an em dash.

- **The published support matrix now states its negatives in words.** In "What it does and does not
  do", the per-(format, operation) table used a bare dash as the value meaning **not supported**. Three
  cells (`dicom` `fmt`, `mllp` `fmt`, `mllp` `validate`) are now spelled `not supported`, so an absent
  capability reads as an explicit claim rather than as punctuation a reader could mistake for a
  rendering artifact. The support facts are unchanged; what changed is that the page now says them.
- **The npm package description, the README, and the published documentation** are rewritten with a
  period, a colon, a comma, or parentheses. The description is what renders on the package page, so
  this is visible before anything is installed.
- **Terminal output changes wording only.** `cosyte --help`, the generated `bash`/`zsh`/`fish`
  completion scripts, and the messages for `redact`/`deid` and the reserved `--profile` flag are
  rephrased. Every stable code, exit code, flag name, and JSON field is untouched, so anything
  branching on the exit code or parsing `--json` is unaffected.
- **A new `no-emdash` check runs on every pull request**, over all tracked files and over the pull
  request title, body, and commit messages. `pnpm check:no-emdash` runs the file half locally.

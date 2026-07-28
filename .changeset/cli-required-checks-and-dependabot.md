---
"@cosyte/cli": patch
---

Two error messages no longer quote internal tracking identifiers that mean nothing outside this
project.

- **`redact`/`deid`'s unavailable message.** The `CLI_NOT_IMPLEMENTED` text printed when
  de-identification is unavailable named an internal work item, and the same identifier reached the
  published type declarations, where it showed up in editor tooltips. Both now state only what a
  caller can act on: the command delegates to `@cosyte/deid`, which is unpublished, and the CLI
  ships no built-in redactor because a partial scrub would present a false-safety impression.
- **`CLI_PARSER_UNAVAILABLE`'s message.** Telling you an optional parser is not installed, it also
  cited an internal decision record. It now just names the package to install.

The stable `CLI_NOT_IMPLEMENTED` and `CLI_PARSER_UNAVAILABLE` codes and their exit `69` are
unchanged, so nothing branching on them moves. Everything else in this release is internal: branch
protection, Dependabot, and caller workflows.

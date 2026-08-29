---
"@cosyte/cli": patch
---

`cosyte redact` (alias `deid`) now produces a real de-identified copy, delegated whole to
`@cosyte/deid`.

The command that was an honest refusal is wired. For `ccda`, `fhir`, `hl7` and `x12`, stdout carries
the de-identified document, serialized exactly as `cosyte fmt` serializes that format, and stderr
carries the library's own value-free manifest: one line per locus it acted on, with the category, the
transform, the structural path, the count, the disposition and its stable code, plus the library's
own published output label and version. The CLI adds no policy, no locus map, no transform and no
fallback scrub, and it asserts no de-identification standard of its own.

Everything else is a typed refusal that emits nothing at all, because a partial pass offered as a
de-identified copy is the hazard this command exists to prevent. `astm`, `mllp` and `ncpdp` have no
adapter in that library, so they are `CLI_NOT_IMPLEMENTED` (exit `69`). `dicom` is covered there, but
its de-identified form is a Part 10 byte stream and this CLI's data channel is text, so it is
`CLI_FORMAT_UNSUPPORTED` (exit `65`), the CLI's own limit rather than the library's. If the library
reports any locus it could not handle, the run is a new `CLI_DEID_INCOMPLETE` diagnostic and exit `1`
with empty stdout and every blocked path named on stderr.

`@cosyte/deid` is declared as an `optionalDependency`: an install without it degrades to a value-free
`CLI_PARSER_UNAVAILABLE` and exit `69`, decided before the input is read, so a copy that cannot
de-identify never touches the bytes it cannot strip. No other command loads the library.

Identifier surrogates (MRN, account and member numbers) are keyed with a per-invocation ephemeral
key. The CLI holds no key material and offers no key surface, so surrogates are consistent within one
output and deliberately not stable across runs; that is stated on the diagnostic channel and in the
documentation rather than left to be discovered. `redact` also does not honour
`--unsafe-show-values`: an excerpt of the input you asked to have stripped is exactly the leak the
command exists to prevent.

No published exit value moved, and no existing diagnostic code was renamed.
